import { NextResponse } from 'next/server';
import { dbRepository } from '@/lib/storage/db';

export async function GET() {
  try {
    const db = await dbRepository.getDatabase();
    return NextResponse.json({
      labs: db.labs,
      advisors: db.advisors.filter((a) => a.active),
      teachers: db.teachersCatalog,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al cargar catálogo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
