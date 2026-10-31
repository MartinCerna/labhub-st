import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { AdvisoryRequest, CreateAdvisoryPayload, LabReservation } from '@/types/labhub';
import { TIME_BLOCK_MAP, getWeekDaysForOffset } from '@/constants/schedule';
import { dbRepository } from '@/lib/storage/db';
import { buildAdvisoryCalendarDetails, buildGoogleCalendarUrl } from '@/lib/calendar/ics';
import { googleBridge } from '@/lib/google/bridge';

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as CreateAdvisoryPayload;

    if (
      !payload.advisorId ||
      !payload.date ||
      !Array.isArray(payload.blockIds) ||
      payload.blockIds.length === 0 ||
      !payload.projectName?.trim() ||
      !payload.course?.trim() ||
      !payload.nrc?.trim() ||
      !Array.isArray(payload.students) ||
      payload.students.length === 0 ||
      !payload.students[0]?.fullName ||
      !payload.students[0]?.upnCode
    ) {
      return NextResponse.json(
        { error: 'Todos los campos requeridos deben completarse con al menos 1 estudiante.' },
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
            'La fecha de la asesoría debe encontrarse dentro de las 2 semanas lectivas permitidas.',
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
          { error: `El bloque ${blockDef.label} ya transcurrió.` },
          { status: 400 }
        );
      }
    }

    const leadStudent = {
      fullName: payload.students[0].fullName.trim(),
      upnCode: payload.students[0].upnCode.trim().toUpperCase(),
    };

    // Creación transaccional atómica de Asesoría + Reserva vinculada
    const result = await dbRepository.updateDatabase(async (db) => {
      const advisor = db.advisors.find((a) => a.id === payload.advisorId && a.active);
      if (!advisor) {
        throw new Error('El asesor seleccionado no existe o no está activo.');
      }

      const dateObj = new Date(`${payload.date}T12:00:00Z`);
      const jsDay = dateObj.getUTCDay();
      if (jsDay === 0) {
        throw new Error('No se atienden asesorías los días domingo.');
      }
      const dayOfWeek = jsDay as 1 | 2 | 3 | 4 | 5 | 6;

      let assignedLabId: string | undefined;

      for (const bId of payload.blockIds) {
        // Verificar disponibilidad declarada del asesor
        const avail = advisor.weeklyAvailability.find(
          (av) => av.dayOfWeek === dayOfWeek && av.blockId === bId
        );
        if (!avail) {
          throw new Error(
            `El asesor no atiende en el bloque ${TIME_BLOCK_MAP[bId].label} para el día seleccionado.`
          );
        }

        if (!assignedLabId) {
          assignedLabId = avail.labId;
        } else if (assignedLabId !== avail.labId) {
          throw new Error('Todos los bloques deben pertenecer al mismo laboratorio asignado.');
        }

        // Verificar si el asesor ya tiene una asesoría programada
        const advisorOccupied = db.advisories.some(
          (a) =>
            a.advisorId === advisor.id &&
            a.date === payload.date &&
            a.status === 'PROGRAMADA' &&
            a.blockIds.includes(bId)
        );
        if (advisorOccupied) {
          throw new Error(
            `El asesor ya tiene una asesoría programada en el bloque ${TIME_BLOCK_MAP[bId].label}.`
          );
        }

        // Verificar bloqueos manuales
        const isBlocked = db.slotBlocks.some(
          (sb) =>
            ((sb.targetType === 'ADVISOR' && sb.targetId === advisor.id) ||
              (sb.targetType === 'LAB' && sb.targetId === avail.labId)) &&
            sb.date === payload.date &&
            sb.blockId === bId
        );
        if (isBlocked) {
          throw new Error(
            `El bloque ${TIME_BLOCK_MAP[bId].label} se encuentra bloqueado por la administración.`
          );
        }

        // Verificar que el laboratorio tenga cupo disponible
        const lab = db.labs.find((l) => l.id === avail.labId);
        const maxGroups = lab ? lab.maxSimultaneousGroups : 4;

        const labHasClass = db.recurringClasses.some(
          (c) =>
            c.labId === avail.labId &&
            c.dayOfWeek === dayOfWeek &&
            c.blockId === bId
        );
        if (labHasClass) {
          throw new Error(
            `El laboratorio asignado (${lab?.name || avail.labId}) tiene clase regular en el bloque ${TIME_BLOCK_MAP[bId].label}.`
          );
        }

        const activeInLab = db.reservations.filter(
          (r) =>
            r.labId === avail.labId &&
            r.date === payload.date &&
            r.status === 'ACTIVA' &&
            r.blockIds.includes(bId)
        );
        if (activeInLab.length >= maxGroups) {
          throw new Error(
            `El laboratorio asignado ya no cuenta con cupos en el bloque ${TIME_BLOCK_MAP[bId].label}.`
          );
        }

        // Verificar cruce del estudiante líder
        const leadConflict = db.reservations.some(
          (r) =>
            r.date === payload.date &&
            r.status === 'ACTIVA' &&
            r.blockIds.includes(bId) &&
            r.leadStudent.upnCode.trim().toUpperCase() === leadStudent.upnCode
        );
        if (leadConflict) {
          throw new Error(
            `El estudiante líder ya cuenta con una reserva activa en el bloque ${TIME_BLOCK_MAP[bId].label}.`
          );
        }
      }

      const advisoryId = crypto.randomUUID();
      const reservationId = crypto.randomUUID();

      const advSeq = db.sequences.advisory;
      db.sequences.advisory += 1;
      const advisoryCode = `ASE-2026-${String(advSeq).padStart(4, '0')}`;

      const resSeq = db.sequences.reservation;
      db.sequences.reservation += 1;
      const reservationCode = `RES-2026-${String(resSeq).padStart(4, '0')}`;

      const finalLabId = assignedLabId as any;

      // 1. Crear reserva de laboratorio vinculada (origin: 'ASESORIA')
      const createdReservation: LabReservation = {
        id: reservationId,
        code: reservationCode,
        origin: 'ASESORIA',
        linkedAdvisoryId: advisoryId,
        labId: finalLabId,
        date: payload.date,
        blockIds: payload.blockIds,
        leadStudent,
        participants: payload.students.slice(1).map((s) => ({
          fullName: s.fullName.trim(),
          upnCode: s.upnCode.trim().toUpperCase(),
        })),
        projectName: payload.projectName.trim(),
        career: 'Ingeniería UPN',
        course: payload.course.trim(),
        nrc: payload.nrc.trim(),
        status: 'ACTIVA',
        createdAt: new Date().toISOString(),
        googleSynced: false,
      };

      // 2. Crear solicitud de asesoría
      const createdAdvisory: AdvisoryRequest = {
        id: advisoryId,
        code: advisoryCode,
        advisorId: advisor.id,
        advisorName: advisor.fullName,
        advisorEmail: advisor.email,
        labId: finalLabId,
        date: payload.date,
        blockIds: payload.blockIds,
        projectName: payload.projectName.trim(),
        course: payload.course.trim(),
        nrc: payload.nrc.trim(),
        topicNotes: payload.topicNotes?.trim(),
        students: payload.students.map((s) => ({
          fullName: s.fullName.trim(),
          upnCode: s.upnCode.trim().toUpperCase(),
        })),
        linkedReservationId: reservationId,
        linkedReservationCode: reservationCode,
        status: 'PROGRAMADA',
        calendarEventUrl: '',
        icsDownloadUrl: `/api/advisories/${advisoryId}/ics`,
        calendarNotified: false,
        createdAt: new Date().toISOString(),
      };

      // Generar enlaces Google Calendar
      const calDetails = buildAdvisoryCalendarDetails(createdAdvisory);
      createdAdvisory.calendarEventUrl = buildGoogleCalendarUrl(calDetails);
      createdReservation.calendarEventUrl = createdAdvisory.calendarEventUrl;

      db.advisories.push(createdAdvisory);
      db.reservations.push(createdReservation);

      return {
        advisory: createdAdvisory,
        reservation: createdReservation,
      };
    });

    // Disparar sincronización asíncrona hacia Google Calendar y Sheets
    googleBridge.syncAdvisory(result.advisory);
    googleBridge.syncReservation(result.reservation, 'CREATE');

    return NextResponse.json(
      {
        advisory: result.advisory,
        reservation: result.reservation,
        message: 'Asesoría agendada con éxito.',
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al solicitar asesoría';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { id: string; status: AdvisoryRequest['status'] };
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: 'Los campos "id" y "status" son obligatorios.' },
        { status: 400 }
      );
    }

    const updatedAdvisory = await dbRepository.updateDatabase(async (db) => {
      const advisory = db.advisories.find((a) => a.id === id);
      if (!advisory) {
        throw new Error('Asesoría no encontrada.');
      }

      advisory.status = status;

      // Si se cancela la asesoría, cancelar también la reserva vinculada
      if (status === 'CANCELADA' && advisory.linkedReservationId) {
        const linkedRes = db.reservations.find(
          (r) => r.id === advisory.linkedReservationId
        );
        if (linkedRes) {
          linkedRes.status = 'CANCELADA';
        }
      }

      return advisory;
    });

    return NextResponse.json({ advisory: updatedAdvisory });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al actualizar asesoría';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
