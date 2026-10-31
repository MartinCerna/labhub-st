import { NextRequest, NextResponse } from 'next/server';
import {
  AdvisorSlotState,
  AdvisorWeeklyScheduleResponse,
  ComputedAdvisorSlot,
} from '@/types/labhub';
import { TIME_BLOCK_MAP, TIME_BLOCKS, getWeekDaysForOffset } from '@/constants/schedule';
import { dbRepository } from '@/lib/storage/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const advisorId = searchParams.get('advisorId');
    const weekOffsetParam = searchParams.get('weekOffset');
    const weekOffset: 0 | 1 = weekOffsetParam === '1' ? 1 : 0;

    const db = await dbRepository.getDatabase();
    const allAdvisors = db.advisors.filter((a) => a.active);

    const targetAdvisorId = advisorId || allAdvisors[0]?.id;
    const advisor = db.advisors.find((a) => a.id === targetAdvisorId);

    if (!advisor) {
      return NextResponse.json(
        { error: `Asesor con ID "${targetAdvisorId}" no encontrado.` },
        { status: 404 }
      );
    }

    const weekData = getWeekDaysForOffset(weekOffset);
    const now = new Date();
    const nowIsoDate = now.toLocaleDateString('sv-SE');
    const nowTimeStr = now.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const slots: ComputedAdvisorSlot[] = [];

    for (const day of weekData.days) {
      for (const block of TIME_BLOCKS) {
        const isPastDate = day.date < nowIsoDate;
        const isPastToday = day.date === nowIsoDate && nowTimeStr >= block.endTime;
        const isPast = isPastDate || isPastToday;

        // Verificar si el asesor atiende en este día y bloque
        const avail = advisor.weeklyAvailability.find(
          (av) => av.dayOfWeek === day.dayOfWeek && av.blockId === block.id
        );

        if (!avail) {
          slots.push({
            date: day.date,
            dayOfWeek: day.dayOfWeek,
            blockId: block.id,
            state: 'NO_ATIENDE',
          });
          continue;
        }

        const lab = db.labs.find((l) => l.id === avail.labId);
        const labName = lab ? lab.name : avail.labId;

        // Calcular cupos del laboratorio en ese bloque
        const labActiveReservations = db.reservations.filter(
          (r) =>
            r.labId === avail.labId &&
            r.date === day.date &&
            r.status === 'ACTIVA' &&
            r.blockIds.includes(block.id)
        );
        const maxGroups = lab ? lab.maxSimultaneousGroups : 4;
        const availableGroups = Math.max(0, maxGroups - labActiveReservations.length);

        // Verificar si el laboratorio tiene clase regular en ese horario
        const labHasClass = db.recurringClasses.some(
          (c) =>
            c.labId === avail.labId &&
            c.dayOfWeek === day.dayOfWeek &&
            c.blockId === block.id
        );

        // Verificar bloqueo manual (del asesor o del laboratorio asignado)
        const manualBlock = db.slotBlocks.find(
          (sb) =>
            ((sb.targetType === 'ADVISOR' && sb.targetId === advisor.id) ||
              (sb.targetType === 'LAB' && sb.targetId === avail.labId)) &&
            sb.date === day.date &&
            sb.blockId === block.id
        );

        // Verificar si el asesor ya tiene una asesoría programada
        const existingAdvisory = db.advisories.find(
          (a) =>
            a.advisorId === advisor.id &&
            a.date === day.date &&
            a.status === 'PROGRAMADA' &&
            a.blockIds.includes(block.id)
        );

        let state: AdvisorSlotState = 'DISPONIBLE';

        if (manualBlock) {
          state = 'BLOQUEADO';
        } else if (existingAdvisory) {
          state = 'OCUPADO';
        } else if (isPast) {
          state = 'NO_ATIENDE'; // Bloque pasado no admite agendamiento
        } else if (labHasClass || availableGroups <= 0) {
          state = 'LAB_SIN_CUPO';
        } else {
          state = 'DISPONIBLE';
        }

        const slotItem: ComputedAdvisorSlot = {
          date: day.date,
          dayOfWeek: day.dayOfWeek,
          blockId: block.id,
          state,
          labId: avail.labId,
          labName,
          labAvailableGroups: availableGroups,
        };

        if (manualBlock) {
          slotItem.blockReason = manualBlock.reason;
          slotItem.blockRecordId = manualBlock.id;
        }

        if (existingAdvisory) {
          slotItem.advisoryBooking = {
            id: existingAdvisory.id,
            code: existingAdvisory.code,
            projectName: existingAdvisory.projectName,
            course: existingAdvisory.course,
            leadStudentName: existingAdvisory.students[0]?.fullName || 'Estudiante UPN',
          };
        }

        slots.push(slotItem);
      }
    }

    const response: AdvisorWeeklyScheduleResponse = {
      advisor,
      allAdvisors,
      weekOffset,
      weekStartDate: weekData.weekStartDate,
      weekEndDate: weekData.weekEndDate,
      days: weekData.days,
      slots,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al consultar horario del asesor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
