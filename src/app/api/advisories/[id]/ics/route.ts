import { NextRequest, NextResponse } from 'next/server';
import { dbRepository } from '@/lib/storage/db';
import { buildAdvisoryCalendarDetails, generateIcsCalendar } from '@/lib/calendar/ics';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: 'ID de asesoría no especificado.' },
        { status: 400 }
      );
    }

    const db = await dbRepository.getDatabase();
    const advisory = db.advisories.find((a) => a.id === id);

    if (!advisory) {
      return NextResponse.json(
        { error: 'Asesoría no encontrada.' },
        { status: 404 }
      );
    }

    const calDetails = buildAdvisoryCalendarDetails(advisory);
    const icsContent = generateIcsCalendar(calDetails);

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="asesoria-${advisory.code}.ics"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al generar archivo .ics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
