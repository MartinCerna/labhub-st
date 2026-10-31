import { NextRequest, NextResponse } from 'next/server';
import { LabId, LaboratoryConfig } from '@/types/labhub';
import { dbRepository } from '@/lib/storage/db';
import { requireAdminSession } from '@/lib/auth';

export async function PATCH(request: NextRequest) {
  try {
    requireAdminSession(request);
    const body = (await request.json()) as { labId: LabId } & Partial<LaboratoryConfig>;

    if (!body.labId) {
      return NextResponse.json(
        { error: 'El campo "labId" es obligatorio.' },
        { status: 400 }
      );
    }

    const updatedLab = await dbRepository.updateDatabase(async (db) => {
      const lab = db.labs.find((l) => l.id === body.labId);
      if (!lab) {
        throw new Error(`Laboratorio "${body.labId}" no encontrado.`);
      }

      if (body.maxSimultaneousGroups !== undefined) {
        const cap = Number(body.maxSimultaneousGroups);
        if (cap > 0 && cap <= 20) {
          lab.maxSimultaneousGroups = cap;
        }
      }
      if (body.name) lab.name = body.name.trim();
      if (body.shortName) lab.shortName = body.shortName.trim();
      if (body.location) lab.location = body.location.trim();
      if (body.description) lab.description = body.description.trim();
      if (body.accentColor) lab.accentColor = body.accentColor.trim();
      if (Array.isArray(body.equipmentHighlights)) {
        lab.equipmentHighlights = body.equipmentHighlights;
      }

      return lab;
    });

    return NextResponse.json({ lab: updatedLab });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al actualizar laboratorio';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}
