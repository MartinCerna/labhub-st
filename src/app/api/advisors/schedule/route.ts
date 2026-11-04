import { NextRequest, NextResponse } from 'next/server';
import {
  AdvisorSlotState,
  AdvisorWeeklyScheduleResponse,
  ComputedAdvisorSlot,
  LabId,
} from '@/types/labhub';
import {
  ADVISORY_ALLOWED_BLOCKS,
  TIME_BLOCK_MAP,
  TIME_BLOCKS,
  getWeekDaysForOffset,
} from '@/constants/schedule';
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

        // Restricción de horario (09:10 a 19:20)
        if (!ADVISORY_ALLOWED_BLOCKS.includes(block.id)) {
          slots.push({
            date: day.date,
            dayOfWeek: day.dayOfWeek,
            blockId: block.id,
            state: 'NO_ATIENDE',
          });
          continue;
        }

        // Restricción de mínimo 2 asistentes en turno simultáneo
        const assistantsOnDutyCount = allAdvisors.filter((a) =>
          a.weeklyAvailability.some(
            (av) => av.dayOfWeek === day.dayOfWeek && av.blockId === block.id
          )
        ).length;

        if (assistantsOnDutyCount < 2) {
          slots.push({
            date: day.date,
            dayOfWeek: day.dayOfWeek,
            blockId: block.id,
            state: 'NO_ATIENDE',
          });
          continue;
        }

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

        // Función para evaluar disponibilidad de un ambiente de laboratorio
        const checkLab = (targetLabId: LabId) => {
          const l = db.labs.find((item) => item.id === targetLabId);
          const maxG = l ? l.maxSimultaneousGroups : 4;
          const activeRes = db.reservations.filter(
            (r) =>
              r.labId === targetLabId &&
              r.date === day.date &&
              r.status === 'ACTIVA' &&
              r.blockIds.includes(block.id)
          );
          const availG = Math.max(0, maxG - activeRes.length);
          const hasCl = db.recurringClasses.some(
            (c) =>
              c.labId === targetLabId &&
              c.dayOfWeek === day.dayOfWeek &&
              c.blockId === block.id
          );
          const isManualBlocked = db.slotBlocks.some(
            (sb) =>
              sb.targetType === 'LAB' &&
              sb.targetId === targetLabId &&
              sb.date === day.date &&
              sb.blockId === block.id
          );
          return {
            lab: l,
            labId: targetLabId,
            labName: l ? l.name : targetLabId,
            availableGroups: availG,
            hasClass: hasCl,
            isManualBlocked,
            isFree: !hasCl && availG > 0 && !isManualBlocked,
          };
        };

        // Cruce dinámico: evalúa primero el laboratorio preferido del asistente
        const preferredCheck = checkLab(avail.labId);
        let effectiveLabId: LabId = avail.labId;
        let effectiveLabName = preferredCheck.labName;
        let effectiveAvailableGroups = preferredCheck.availableGroups;
        let allLabsFullOrClass = false;

        if (preferredCheck.isFree) {
          effectiveLabId = preferredCheck.labId;
          effectiveLabName = preferredCheck.labName;
          effectiveAvailableGroups = preferredCheck.availableGroups;
        } else {
          // Si el preferido tiene clase o no tiene cupo, busca en los otros laboratorios
          const otherLabs = db.labs.filter((l) => l.id !== avail.labId);
          let foundAlt = false;
          for (const other of otherLabs) {
            const altCheck = checkLab(other.id);
            if (altCheck.isFree) {
              effectiveLabId = altCheck.labId;
              effectiveLabName = altCheck.labName;
              effectiveAvailableGroups = altCheck.availableGroups;
              foundAlt = true;
              break;
            }
          }
          if (!foundAlt) {
            allLabsFullOrClass = true;
          }
        }

        // Verificar bloqueo manual (del asesor o del laboratorio efectivo asignado)
        const manualBlock = db.slotBlocks.find(
          (sb) =>
            ((sb.targetType === 'ADVISOR' && sb.targetId === advisor.id) ||
              (sb.targetType === 'LAB' && sb.targetId === effectiveLabId)) &&
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
        } else if (allLabsFullOrClass) {
          state = 'LAB_SIN_CUPO';
        } else {
          state = 'DISPONIBLE';
        }

        const slotItem: ComputedAdvisorSlot = {
          date: day.date,
          dayOfWeek: day.dayOfWeek,
          blockId: block.id,
          state,
          labId: effectiveLabId as any,
          labName: effectiveLabName,
          labAvailableGroups: effectiveAvailableGroups,
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
