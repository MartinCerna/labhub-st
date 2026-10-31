import { NextRequest, NextResponse } from 'next/server';
import { dbRepository } from '@/lib/storage/db';
import { requireAdminSession } from '@/lib/auth';

export async function PUT(request: NextRequest) {
  try {
    requireAdminSession(request);
    const body = (await request.json()) as { teachers: string[] };

    if (!Array.isArray(body.teachers)) {
      return NextResponse.json(
        { error: 'El campo "teachers" debe ser un arreglo de cadenas.' },
        { status: 400 }
      );
    }

    const cleaned = body.teachers
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const updatedCatalog = await dbRepository.updateDatabase(async (db) => {
      db.teachersCatalog = cleaned;
      return db.teachersCatalog;
    });

    return NextResponse.json({ teachers: updatedCatalog });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al actualizar docentes';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}
