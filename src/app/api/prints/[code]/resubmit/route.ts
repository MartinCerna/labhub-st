import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { StlFileMetadata } from '@/types/labhub';
import { dbRepository } from '@/lib/storage/db';
import { parseStlBuffer, validateStlFileName } from '@/lib/stl-parser';
import { googleBridge } from '@/lib/google/bridge';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await context.params;

    if (!code) {
      return NextResponse.json(
        { error: 'Código de solicitud no especificado.' },
        { status: 400 }
      );
    }

    const cleanCode = code.trim().toUpperCase();
    const db = await dbRepository.getDatabase();
    const target = db.prints.find((p) => p.code.toUpperCase() === cleanCode);

    if (!target) {
      return NextResponse.json(
        { error: `No se encontró la solicitud con código "${cleanCode}".` },
        { status: 404 }
      );
    }

    if (target.status !== 'OBSERVADO') {
      return NextResponse.json(
        {
          error: `La solicitud se encuentra en estado "${target.status}". Solo se admite subsanación de archivos cuando el estado es OBSERVADO.`,
        },
        { status: 400 }
      );
    }

    // Validar plazo de 48 horas
    const now = new Date();
    if (target.observationExpiresAt && now.getTime() > new Date(target.observationExpiresAt).getTime()) {
      return NextResponse.json(
        {
          error:
            'El plazo máximo de 48 horas para subsanar las observaciones ha expirado. Comuníquese directamente con el coordinador de laboratorios.',
        },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const uploadedFiles: File[] = [];

    for (const [_, value] of formData.entries()) {
      if (value && typeof value === 'object' && 'name' in value && 'arrayBuffer' in value) {
        uploadedFiles.push(value as File);
      }
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json(
        { error: 'Debe adjuntar los nuevos archivos .stl corregidos.' },
        { status: 400 }
      );
    }

    for (const f of uploadedFiles) {
      if (!validateStlFileName(f.name)) {
        return NextResponse.json(
          { error: `El archivo "${f.name}" no cuenta con la extensión .stl requerida.` },
          { status: 400 }
        );
      }
    }

    const currentMaxVersion = target.files.reduce((acc, f) => Math.max(acc, f.version || 1), 1);
    const nextVersion = currentMaxVersion + 1;
    const newFilesMetadata: StlFileMetadata[] = [];

    for (const f of uploadedFiles) {
      const arrayBuffer = await f.arrayBuffer();
      const nodeBuffer = Buffer.from(arrayBuffer);

      // Validación de malla 3D
      const geometry = parseStlBuffer(arrayBuffer);

      const { storedFileName } = await dbRepository.saveStlFile(
        cleanCode,
        `v${nextVersion}_${f.name}`,
        nodeBuffer
      );

      newFilesMetadata.push({
        id: crypto.randomUUID(),
        originalName: f.name,
        storedFileName,
        sizeBytes: nodeBuffer.length,
        format: geometry.format,
        triangleCount: geometry.triangleCount,
        dimensionsMm: geometry.dimensionsMm,
        estimatedVolumeCm3: geometry.estimatedVolumeCm3,
        version: nextVersion,
        uploadedAt: now.toISOString(),
        downloadUrl: `/api/prints/files/${cleanCode}/${encodeURIComponent(storedFileName)}`,
      });
    }

    const updatedPrint = await dbRepository.updateDatabase(async (database) => {
      const printItem = database.prints.find((p) => p.code.toUpperCase() === cleanCode);
      if (!printItem) {
        throw new Error('Solicitud no encontrada al persistir subsanación.');
      }

      printItem.status = 'EN REVISION';
      printItem.updatedAt = now.toISOString();
      // Agregamos los nuevos archivos de la versión subsanada
      printItem.files.push(...newFilesMetadata);

      printItem.statusHistory.push({
        status: 'EN REVISION',
        timestamp: now.toISOString(),
        actor: printItem.studentFullName,
        comment: `Subsanación de archivos enviada (Versión ${nextVersion}) dentro de la ventana de 48 horas.`,
      });

      return printItem;
    });

    // Notificar a Google
    googleBridge.syncPrint3D(updatedPrint);
    googleBridge.syncPrintStatus(updatedPrint);

    return NextResponse.json({
      printRequest: updatedPrint,
      message: 'Archivos subsanados con éxito. La solicitud pasó nuevamente a EN REVISION.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al subsanar archivos STL';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
