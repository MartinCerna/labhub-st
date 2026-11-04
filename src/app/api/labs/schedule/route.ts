import { NextRequest, NextResponse } from 'next/server';
import {
  ComputedLabSlot,
  LabId,
  LabSlotState,
  LabWeeklyScheduleResponse,
} from '@/types/labhub';
import { TIME_BLOCKS, getWeekDaysForOffset } from '@/constants/schedule';
import { dbRepository } from '@/lib/storage/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const labId = searchParams.get('labId') as LabId;
    const weekOffsetParam = searchParams.get('weekOffset');
    const weekOffset: 0 | 1 = weekOffsetParam === '1' ? 1 : 0;

    if (!labId) {
      return NextResponse.json(
        { error: 'El parámetro "labId" es obligatorio.' },
        { status: 400 }
      );
    }

    const db = await dbRepository.getDatabase();
    const lab = db.labs.find((l) => l.id === labId);

    if (!lab) {
      return NextResponse.json(
        { error: `Laboratorio "${labId}" no encontrado en el sistema.` },
        { status: 404 }
      );
    }

    const weekData = getWeekDaysForOffset(weekOffset);
    const now = new Date();
    // Obtener fecha y hora actual en zona horaria local (Perú UTC-5)
    const nowIsoDate = now.toLocaleDateString('sv-SE'); // YYYY-MM-DD
    const nowTimeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }); // HH:mm

    const slots: ComputedLabSlot[] = [];

    for (const day of weekData.days) {
      for (const block of TIME_BLOCKS) {
        // Evaluar si el bloque ya pasó
        const isPastDate = day.date < nowIsoDate;
        const isPastToday = day.date === nowIsoDate && nowTimeStr >= block.endTime;
        const isPast = isPastDate || isPastToday;

        // Evaluar bloqueo manual
        const manualBlock = db.slotBlocks.find(
          (sb) =>
            sb.targetType === 'LAB' &&
            sb.targetId === labId &&
            sb.date === day.date &&
            sb.blockId === block.id
        );

        // Evaluar clase recurrente
        const classSlot = db.recurringClasses.find(
          (rc) =>
            rc.labId === labId &&
            rc.dayOfWeek === day.dayOfWeek &&
            rc.blockId === block.id
        );

        // Evaluar reservas activas (tanto directas como asesorías)
        const activeReservations = db.reservations.filter(
          (r) =>
            r.labId === labId &&
            r.date === day.date &&
            r.status === 'ACTIVA' &&
            r.blockIds.includes(block.id)
        );

        const occupiedGroups = activeReservations.length;
        const availableGroups = Math.max(0, lab.maxSimultaneousGroups - occupiedGroups);

        // Cruce con turno de asistentes
        const hasAssistantOnDuty = db.advisors.some(
          (adv) =>
            adv.active &&
            adv.weeklyAvailability.some(
              (av) => av.dayOfWeek === day.dayOfWeek && av.blockId === block.id
            )
        );

        let state: LabSlotState = 'DISPONIBLE';

        if (manualBlock) {
          state = 'BLOQUEADO';
        } else if (classSlot) {
          state = 'CLASE';
        } else if (isPast) {
          state = 'PASADO';
        } else if (!hasAssistantOnDuty) {
          state = 'BLOQUEADO';
        } else if (availableGroups <= 0) {
          state = 'COMPLETO';
        } else {
          state = 'DISPONIBLE';
        }

        const slotItem: ComputedLabSlot = {
          date: day.date,
          dayOfWeek: day.dayOfWeek,
          blockId: block.id,
          state,
          maxGroups: lab.maxSimultaneousGroups,
          occupiedGroups,
          availableGroups,
          bookings: activeReservations.map((r) => ({
            id: r.id,
            code: r.code,
            projectName: r.projectName,
            leadName: r.leadStudent.fullName,
            upnCode: r.leadStudent.upnCode,
            origin: r.origin,
          })),
        };

        if (classSlot) {
          slotItem.classInfo = {
            courseName: classSlot.courseName,
            teacherName: classSlot.teacherName,
            nrc: classSlot.nrc,
          };
        }

        if (manualBlock) {
          slotItem.blockReason = manualBlock.reason;
          slotItem.blockRecordId = manualBlock.id;
        } else if (!classSlot && !isPast && !hasAssistantOnDuty) {
          slotItem.blockReason = 'Sin asistente en turno';
        }

        slots.push(slotItem);
      }
    }

    const response: LabWeeklyScheduleResponse = {
      lab,
      weekOffset,
      weekStartDate: weekData.weekStartDate,
      weekEndDate: weekData.weekEndDate,
      days: weekData.days,
      slots,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al consultar disponibilidad del laboratorio';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
