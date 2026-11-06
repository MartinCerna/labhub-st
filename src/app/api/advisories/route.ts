import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { AdvisoryRequest, CreateAdvisoryPayload, LabReservation } from '@/types/labhub';
import {
  ADVISORY_ALLOWED_BLOCKS,
  TIME_BLOCK_MAP,
  getWeekDaysForOffset,
} from '@/constants/schedule';
import { dbRepository } from '@/lib/storage/db';
import { buildAdvisoryCalendarDetails, buildGoogleCalendarUrl } from '@/lib/calendar/ics';
import { googleBridge } from '@/lib/google/bridge';
import { getAdminSessionFromRequest, requireAdminSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query')?.trim().toLowerCase() || '';
    const db = await dbRepository.getDatabase();

    if (!query || query.length < 3) {
      const adminSession = await getAdminSessionFromRequest(request);
      if (adminSession) {
        return NextResponse.json({ advisories: db.advisories });
      }
      return NextResponse.json({ advisories: [] });
    }

    const results = db.advisories.filter((a) => {
      const codeMatch = a.code.toLowerCase().includes(query);
      const resMatch = a.linkedReservationCode?.toLowerCase().includes(query) ?? false;
      const projectMatch = a.projectName.toLowerCase().includes(query);
      const studentMatch = a.students.some(
        (s) =>
          s.upnCode.toLowerCase().includes(query) ||
          s.fullName.toLowerCase().includes(query)
      );
      return codeMatch || resMatch || projectMatch || studentMatch;
    });

    return NextResponse.json({ advisories: results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al consultar asesorías';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
      if (!ADVISORY_ALLOWED_BLOCKS.includes(bId)) {
        return NextResponse.json(
          {
            error:
              'Las asesorías solo pueden reservarse entre las 09:10 y las 19:20 (Bloques B2 a B7).',
          },
          { status: 400 }
        );
      }
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
        // Restricción de mínimo 2 asistentes en turno simultáneo
        const assistantsOnDutyCount = db.advisors
          .filter((a) => a.active)
          .filter((a) =>
            a.weeklyAvailability.some(
              (av) => av.dayOfWeek === dayOfWeek && av.blockId === bId
            )
          ).length;

        if (assistantsOnDutyCount < 2) {
          throw new Error(
            'No se brindan asesorías en turnos donde solo se encuentra un único asistente en laboratorio.'
          );
        }

        // Verificar disponibilidad declarada del asesor
        const avail = advisor.weeklyAvailability.find(
          (av) => av.dayOfWeek === dayOfWeek && av.blockId === bId
        );
        if (!avail) {
          throw new Error(
            `El asesor no atiende en el bloque ${TIME_BLOCK_MAP[bId].label} para el día seleccionado.`
          );
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

        // Verificar si el asesor tiene un bloqueo manual directo
        const advisorBlocked = db.slotBlocks.some(
          (sb) =>
            sb.targetType === 'ADVISOR' &&
            sb.targetId === advisor.id &&
            sb.date === payload.date &&
            sb.blockId === bId
        );
        if (advisorBlocked) {
          throw new Error(
            `El bloque ${TIME_BLOCK_MAP[bId].label} se encuentra bloqueado por la administración para el asesor.`
          );
        }

        // Función para evaluar si un ambiente de laboratorio tiene cupo disponible
        const isLabAvailable = (targetLabId: string) => {
          const labObj = db.labs.find((l) => l.id === targetLabId);
          const maxGroups = labObj ? labObj.maxSimultaneousGroups : 4;

          const hasClass = db.recurringClasses.some(
            (c) =>
              c.labId === targetLabId &&
              c.dayOfWeek === dayOfWeek &&
              c.blockId === bId
          );
          if (hasClass) return false;

          const isBlocked = db.slotBlocks.some(
            (sb) =>
              sb.targetType === 'LAB' &&
              sb.targetId === targetLabId &&
              sb.date === payload.date &&
              sb.blockId === bId
          );
          if (isBlocked) return false;

          const activeCount = db.reservations.filter(
            (r) =>
              r.labId === targetLabId &&
              r.date === payload.date &&
              r.status === 'ACTIVA' &&
              r.blockIds.includes(bId)
          ).length;

          return activeCount < maxGroups;
        };

        // Cruce dinámico: evalúa primero el laboratorio preferido del asistente
        let effectiveBlockLabId: string | undefined;

        if (isLabAvailable(avail.labId)) {
          effectiveBlockLabId = avail.labId;
        } else {
          // Si el preferido tiene clase o no tiene cupo, busca automáticamente otro laboratorio libre
          const otherLabs = db.labs.filter((l) => l.id !== avail.labId);
          for (const other of otherLabs) {
            if (isLabAvailable(other.id)) {
              effectiveBlockLabId = other.id;
              break;
            }
          }
        }

        if (!effectiveBlockLabId) {
          throw new Error(
            `No hay laboratorios con cupo disponible en el bloque ${TIME_BLOCK_MAP[bId].label}.`
          );
        }

        // Asignar el primer effectiveLabId válido para la reserva vinculada
        if (!assignedLabId) {
          assignedLabId = effectiveBlockLabId;
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
    const session = await getAdminSessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado. Sesión de administrador requerida.' },
        { status: 401 }
      );
    }

    const body = (await request.json()) as {
      id: string;
      status?: AdvisoryRequest['status'];
      resyncCalendar?: boolean;
    };
    const { id, status, resyncCalendar } = body;

    if (!id || (!status && !resyncCalendar)) {
      return NextResponse.json(
        { error: 'Debe especificar el id y al menos el nuevo estado o resyncCalendar.' },
        { status: 400 }
      );
    }

    const updatedAdvisory = await dbRepository.updateDatabase(async (db) => {
      const advisory = db.advisories.find((a) => a.id === id);
      if (!advisory) {
        throw new Error('Asesoría no encontrada.');
      }

      if (status) {
        advisory.status = status;
      }

      // Si se cancela la asesoría, cancelar también la reserva vinculada
      if (advisory.status === 'CANCELADA' && advisory.linkedReservationId) {
        const linkedRes = db.reservations.find(
          (r) => r.id === advisory.linkedReservationId
        );
        if (linkedRes) {
          linkedRes.status = 'CANCELADA';
        }
      }

      if (advisory.status === 'PROGRAMADA' || resyncCalendar) {
        try {
          advisory.calendarEventUrl = buildGoogleCalendarUrl(
            buildAdvisoryCalendarDetails(advisory)
          );
        } catch {}
      }

      return advisory;
    });

    let syncResult: { synced: boolean; outdatedAppsScript?: boolean } | undefined;
    if (updatedAdvisory.status === 'PROGRAMADA' || resyncCalendar) {
      syncResult = await googleBridge.syncAdvisory(updatedAdvisory);
    }

    return NextResponse.json({ advisory: updatedAdvisory, syncResult });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al actualizar asesoría';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id')?.trim();
    const code = searchParams.get('code')?.trim().toUpperCase();
    const upnCode = searchParams.get('upnCode')?.trim().toUpperCase();

    if (!id && !code) {
      return NextResponse.json(
        { error: 'Debe especificar el id o código de la asesoría a cancelar.' },
        { status: 400 }
      );
    }

    const adminSession = await getAdminSessionFromRequest(request);

    const updated = await dbRepository.updateDatabase(async (db) => {
      const target = db.advisories.find(
        (a) => (id && a.id === id) || (code && a.code.toUpperCase() === code)
      );

      if (!target) {
        const error: Error & { status?: number } = new Error('Asesoría no encontrada.');
        error.status = 404;
        throw error;
      }

      if (!adminSession) {
        const studentMatches = upnCode
          ? target.students.some((s) => s.upnCode.trim().toUpperCase() === upnCode)
          : false;

        if (!studentMatches) {
          const error: Error & { status?: number } = new Error(
            'El Código UPN ingresado no coincide con los estudiantes registrados en esta asesoría.'
          );
          error.status = 403;
          throw error;
        }
      }

      target.status = 'CANCELADA';

      if (target.linkedReservationId) {
        const linkedRes = db.reservations.find(
          (r) => r.id === target.linkedReservationId
        );
        if (linkedRes) {
          linkedRes.status = 'CANCELADA';
        }
      }

      return target;
    });

    return NextResponse.json({
      ok: true,
      advisory: updated,
      message: 'Asesoría y reserva vinculada canceladas correctamente.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al cancelar asesoría';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}

