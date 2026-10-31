import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { RecurringClassSlot } from '@/types/labhub';
import { dbRepository } from '@/lib/storage/db';
import { requireAdminSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    requireAdminSession(request);
    const body = (await request.json()) as Omit<RecurringClassSlot, 'id'>;

    if (
      !body.labId ||
      !body.dayOfWeek ||
      !body.blockId ||
      !body.courseName?.trim() ||
      !body.teacherName?.trim() ||
      !body.nrc?.trim()
    ) {
      return NextResponse.json(
        { error: 'Todos los campos de la clase regular son obligatorios.' },
        { status: 400 }
      );
    }

    const createdSlot = await dbRepository.updateDatabase(async (db) => {
      // Verificar si ya existe clase para ese mismo bloque y lab
      const conflict = db.recurringClasses.some(
        (c) =>
          c.labId === body.labId &&
          c.dayOfWeek === body.dayOfWeek &&
          c.blockId === body.blockId
      );
      if (conflict) {
        throw new Error('Ya existe una clase registrada para este laboratorio en el bloque seleccionado.');
      }

      const newSlot: RecurringClassSlot = {
        id: crypto.randomUUID(),
        labId: body.labId,
        dayOfWeek: body.dayOfWeek,
        blockId: body.blockId,
        courseName: body.courseName.trim(),
        teacherName: body.teacherName.trim(),
        nrc: body.nrc.trim(),
      };

      db.recurringClasses.push(newSlot);
      return newSlot;
    });

    return NextResponse.json({ recurringClass: createdSlot }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al registrar clase';
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
      const idx = db.recurringClasses.findIndex((c) => c.id === id);
      if (idx === -1) {
        throw new Error('Clase no encontrada.');
      }
      db.recurringClasses.splice(idx, 1);
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al eliminar clase';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}
