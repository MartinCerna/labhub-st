import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { CreateLabReservationPayload, LabReservation } from '@/types/labhub';
import { TIME_BLOCK_MAP, getWeekDaysForOffset } from '@/constants/schedule';
import { dbRepository } from '@/lib/storage/db';
import { buildGoogleCalendarUrl, buildReservationCalendarDetails } from '@/lib/calendar/ics';
import { googleBridge } from '@/lib/google/bridge';

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as CreateLabReservationPayload;

    if (
      !payload.labId ||
      !payload.date ||
      !Array.isArray(payload.blockIds) ||
      payload.blockIds.length === 0 ||
      !payload.leadStudent?.fullName ||
      !payload.leadStudent?.upnCode ||
      !payload.projectName?.trim() ||
      !payload.career?.trim() ||
      !payload.course?.trim() ||
      !payload.nrc?.trim()
    ) {
      return NextResponse.json(
        { error: 'Todos los campos marcados son obligatorios para completar la reserva.' },
        { status: 400 }
      );
    }

    // Validar rango de 2 semanas permitidas
    const week0 = getWeekDaysForOffset(0);
    const week1 = getWeekDaysForOffset(1);
    const allowedDates = new Set([
      ...week0.days.map((d) => d.date),
      ...week1.days.map((d) => d.date),
    ]);

    if (!allowedDates.has(payload.date)) {
      return NextResponse.json(
        {
          error:
            'La fecha seleccionada no pertenece al rango de programación permitido (máximo 2 semanas lectivas).',
        },
        { status: 400 }
      );
    }

    // Validar que los bloques no hayan pasado
    const now = new Date();
    const nowIsoDate = now.toLocaleDateString('sv-SE');
    const nowTimeStr = now.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    for (const bId of payload.blockIds) {
      const blockDef = TIME_BLOCK_MAP[bId];
      if (!blockDef) {
        return NextResponse.json(
          { error: `El bloque horario ${bId} no es válido.` },
          { status: 400 }
        );
      }
      if (payload.date < nowIsoDate || (payload.date === nowIsoDate && nowTimeStr >= blockDef.endTime)) {
        return NextResponse.json(
          { error: `El bloque ${blockDef.label} ya transcurrió y no admite reservas.` },
          { status: 400 }
        );
      }
    }

    const cleanLeadCode = payload.leadStudent.upnCode.trim().toUpperCase();

    // Actualización transaccional protegida por mutex
    const newReservation = await dbRepository.updateDatabase(async (db) => {
      const lab = db.labs.find((l) => l.id === payload.labId);
      if (!lab) {
        throw new Error(`El laboratorio ${payload.labId} no existe.`);
      }

      // Validar día de la semana (1..6)
      const dateObj = new Date(`${payload.date}T12:00:00Z`);
      const jsDay = dateObj.getUTCDay(); // 0 = Domingo, 1 = Lunes ... 6 = Sábado
      if (jsDay === 0) {
        throw new Error('Los laboratorios no atienden los días domingo.');
      }
      const dayOfWeek = jsDay as 1 | 2 | 3 | 4 | 5 | 6;

      for (const bId of payload.blockIds) {
        // Validar si hay clase recurrente
        const hasClass = db.recurringClasses.some(
          (c) => c.labId === payload.labId && c.dayOfWeek === dayOfWeek && c.blockId === bId
        );
        if (hasClass) {
          throw new Error(
            `El bloque ${TIME_BLOCK_MAP[bId].label} está ocupado por una clase programada.`
          );
        }

        // Validar si hay bloqueo manual
        const hasBlock = db.slotBlocks.some(
          (sb) =>
            sb.targetType === 'LAB' &&
            sb.targetId === payload.labId &&
            sb.date === payload.date &&
            sb.blockId === bId
        );
        if (hasBlock) {
          throw new Error(
            `El bloque ${TIME_BLOCK_MAP[bId].label} se encuentra bloqueado por la administración.`
          );
        }

        // Validar cupos disponibles en el laboratorio
        const currentActiveInSlot = db.reservations.filter(
          (r) =>
            r.labId === payload.labId &&
            r.date === payload.date &&
            r.status === 'ACTIVA' &&
            r.blockIds.includes(bId)
        );

        if (currentActiveInSlot.length >= lab.maxSimultaneousGroups) {
          throw new Error(
            `El bloque ${TIME_BLOCK_MAP[bId].label} ya alcanzó su capacidad máxima de ${lab.maxSimultaneousGroups} grupos simultáneos.`
          );
        }

        // Validar cruce del estudiante líder en la misma fecha y bloque (en cualquier lab)
        const hasLeadConflict = db.reservations.some(
          (r) =>
            r.date === payload.date &&
            r.status === 'ACTIVA' &&
            r.blockIds.includes(bId) &&
            r.leadStudent.upnCode.trim().toUpperCase() === cleanLeadCode
        );
        if (hasLeadConflict) {
          throw new Error(
            `El estudiante líder (${cleanLeadCode}) ya cuenta con una reserva activa en el bloque ${TIME_BLOCK_MAP[bId].label}.`
          );
        }
      }

      const seq = db.sequences.reservation;
      db.sequences.reservation += 1;
      const code = `RES-2026-${String(seq).padStart(4, '0')}`;

      const created: LabReservation = {
        id: crypto.randomUUID(),
        code,
        origin: 'RESERVA_DIRECTA',
        labId: payload.labId,
        date: payload.date,
        blockIds: payload.blockIds,
        leadStudent: {
          fullName: payload.leadStudent.fullName.trim(),
          upnCode: cleanLeadCode,
        },
        participants: (payload.participants || []).map((p) => ({
          fullName: p.fullName.trim(),
          upnCode: p.upnCode.trim().toUpperCase(),
        })),
        projectName: payload.projectName.trim(),
        career: payload.career.trim(),
        course: payload.course.trim(),
        nrc: payload.nrc.trim(),
        status: 'ACTIVA',
        createdAt: new Date().toISOString(),
        googleSynced: false,
      };

      // Generar link de Google Calendar
      const calDetails = buildReservationCalendarDetails(created);
      created.calendarEventUrl = buildGoogleCalendarUrl(calDetails);

      db.reservations.push(created);
      return created;
    });

    // Disparar sincronización asíncrona con Google Workspace
    googleBridge.syncReservation(newReservation, 'CREATE');

    return NextResponse.json(
      {
        reservation: newReservation,
        message: 'Reserva confirmada con éxito.',
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al procesar la reserva';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'El parámetro "id" es obligatorio para cancelar una reserva.' },
        { status: 400 }
      );
    }

    const cancelledReservation = await dbRepository.updateDatabase(async (db) => {
      const reservation = db.reservations.find((r) => r.id === id);
      if (!reservation) {
        throw new Error('Reserva no encontrada.');
      }
      reservation.status = 'CANCELADA';

      // Si la reserva proviene de una asesoría, cancelar también la asesoría vinculada
      if (reservation.linkedAdvisoryId) {
        const linkedAdvisory = db.advisories.find(
          (a) => a.id === reservation.linkedAdvisoryId
        );
        if (linkedAdvisory) {
          linkedAdvisory.status = 'CANCELADA';
        }
      }

      return reservation;
    });

    // Notificar cancelación a Google Sheets si aplica
    googleBridge.syncReservation(cancelledReservation, 'CANCEL');

    return NextResponse.json({ ok: true, message: 'Reserva cancelada correctamente.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al cancelar la reserva';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
