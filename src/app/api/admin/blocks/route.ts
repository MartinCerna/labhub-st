import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { SlotBlock } from '@/types/labhub';
import { dbRepository } from '@/lib/storage/db';
import { requireAdminSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const adminUser = requireAdminSession(request);
    const body = (await request.json()) as Omit<
      SlotBlock,
      'id' | 'createdAt' | 'createdBy'
    >;

    if (
      !body.targetType ||
      !body.targetId ||
      !body.date ||
      !body.blockId ||
      !body.reason?.trim()
    ) {
      return NextResponse.json(
        { error: 'Todos los campos del bloqueo horario son obligatorios.' },
        { status: 400 }
      );
    }

    const createdBlock = await dbRepository.updateDatabase(async (db) => {
      const exists = db.slotBlocks.some(
        (sb) =>
          sb.targetType === body.targetType &&
          sb.targetId === body.targetId &&
          sb.date === body.date &&
          sb.blockId === body.blockId
      );

      if (exists) {
        throw new Error('Ya existe un bloqueo registrado para este turno específico.');
      }

      const newBlock: SlotBlock = {
        id: crypto.randomUUID(),
        targetType: body.targetType,
        targetId: body.targetId,
        date: body.date,
        blockId: body.blockId,
        reason: body.reason.trim(),
        createdBy: adminUser.fullName,
        createdAt: new Date().toISOString(),
      };

      db.slotBlocks.push(newBlock);
      return newBlock;
    });

    return NextResponse.json({ slotBlock: createdBlock }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al registrar bloqueo';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireAdminSession(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'El parámetro "id" es obligatorio.' },
        { status: 400 }
      );
    }

    await dbRepository.updateDatabase(async (db) => {
      const idx = db.slotBlocks.findIndex((b) => b.id === id);
      if (idx === -1) {
        throw new Error('Bloqueo no encontrado.');
      }
      db.slotBlocks.splice(idx, 1);
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al eliminar bloqueo';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}
