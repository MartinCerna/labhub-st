import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { TIME_BLOCKS } from '@/constants/schedule';
import { dbRepository } from '@/lib/storage/db';
import { requireAdminSession } from '@/lib/auth';
import { SlotBlock, TimeBlockId } from '@/types/labhub';

interface BlockRequestBody {
  targetType: 'LAB' | 'ADVISOR';
  targetId: string;
  date?: string;
  dates?: string[];
  blockId?: TimeBlockId;
  blockIds?: TimeBlockId[];
  fullDay?: boolean;
  slots?: Array<{ date: string; blockId: TimeBlockId }>;
  reason: string;
}

export async function POST(request: NextRequest) {
  try {
    const adminUser = requireAdminSession(request);
    const body = (await request.json()) as BlockRequestBody;

    let targetSlots: Array<{ date: string; blockId: TimeBlockId }> = [];

    if (Array.isArray(body.slots) && body.slots.length > 0) {
      targetSlots = body.slots.filter(
        (s) => s && typeof s.date === 'string' && typeof s.blockId === 'string'
      );
    } else {
      const targetDates =
        Array.isArray(body.dates) && body.dates.length > 0
          ? body.dates
          : body.date
          ? [body.date]
          : [];
      const targetBlocks: TimeBlockId[] = body.fullDay
        ? TIME_BLOCKS.map((t) => t.id)
        : Array.isArray(body.blockIds) && body.blockIds.length > 0
        ? body.blockIds
        : body.blockId
        ? [body.blockId]
        : [];

      for (const date of targetDates) {
        for (const blockId of targetBlocks) {
          targetSlots.push({ date, blockId });
        }
      }
    }

    // Deduplicar pares date + blockId para evitar procesar repetidos en el mismo lote
    const uniqueSlotsMap = new Map<string, { date: string; blockId: TimeBlockId }>();
    for (const slot of targetSlots) {
      if (slot?.date && slot?.blockId) {
        uniqueSlotsMap.set(`${slot.date}_${slot.blockId}`, slot);
      }
    }
    const uniqueTargetSlots = Array.from(uniqueSlotsMap.values());

    if (
      !body.targetType ||
      !body.targetId ||
      !body.reason?.trim() ||
      uniqueTargetSlots.length === 0
    ) {
      return NextResponse.json(
        { error: 'Selecciona al menos un horario o día completo e indica el motivo del bloqueo.' },
        { status: 400 }
      );
    }

    const createdBlocks = await dbRepository.updateDatabase(async (db) => {
      if (!Array.isArray(db.slotBlocks)) {
        db.slotBlocks = [];
      }

      const slotsToCreate = uniqueTargetSlots.filter((slot) => {
        return !db.slotBlocks.some(
          (sb) =>
            sb.targetType === body.targetType &&
            sb.targetId === body.targetId &&
            sb.date === slot.date &&
            sb.blockId === slot.blockId
        );
      });

      if (slotsToCreate.length === 0) {
        throw new Error('Los horarios seleccionados ya se encuentran bloqueados.');
      }

      const nowIso = new Date().toISOString();
      const created: SlotBlock[] = slotsToCreate.map((slot) => ({
        id: crypto.randomUUID(),
        targetType: body.targetType,
        targetId: body.targetId,
        date: slot.date,
        blockId: slot.blockId,
        reason: body.reason.trim(),
        createdBy: adminUser.fullName,
        createdAt: nowIso,
      }));

      db.slotBlocks.push(...created);
      return created;
    });

    return NextResponse.json(
      {
        slotBlock: createdBlocks[0],
        slotBlocks: createdBlocks,
        count: createdBlocks.length,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error al registrar bloqueo';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireAdminSession(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const idsParam = searchParams.get('ids');
    const targetType = searchParams.get('targetType');
    const targetId = searchParams.get('targetId');
    const date = searchParams.get('date');

    const ids = idsParam
      ? idsParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const hasDateFilter = Boolean(targetType && targetId && date);

    if (!id && ids.length === 0 && !hasDateFilter) {
      return NextResponse.json(
        {
          error:
            'El parámetro "id", "ids" o la combinación "targetType", "targetId" y "date" es obligatorio.',
        },
        { status: 400 }
      );
    }

    const deletedCount = await dbRepository.updateDatabase(async (db) => {
      if (!Array.isArray(db.slotBlocks)) {
        db.slotBlocks = [];
        return 0;
      }

      const initialCount = db.slotBlocks.length;

      if (id) {
        const idx = db.slotBlocks.findIndex((b) => b.id === id);
        if (idx === -1) {
          throw new Error('Bloqueo no encontrado.');
        }
        db.slotBlocks.splice(idx, 1);
        return 1;
      }

      if (ids.length > 0) {
        const idsSet = new Set(ids);
        db.slotBlocks = db.slotBlocks.filter((b) => !idsSet.has(b.id));
        return initialCount - db.slotBlocks.length;
      }

      if (hasDateFilter) {
        db.slotBlocks = db.slotBlocks.filter(
          (b) =>
            !(
              b.targetType === targetType &&
              b.targetId === targetId &&
              b.date === date
            )
        );
        return initialCount - db.slotBlocks.length;
      }

      return 0;
    });

    return NextResponse.json({ ok: true, deletedCount });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error al eliminar bloqueo';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}
