import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { dbRepository } from '@/lib/storage/db';
import { googleBridge } from '@/lib/google/bridge';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string; fileName: string }> }
) {
  try {
    const { code, fileName } = await context.params;

    if (!code || !fileName) {
      return NextResponse.json({ error: 'Parámetros incompletos.' }, { status: 400 });
    }

    // Prevención estricta de Path Traversal
    const safeCode = code.replace(/[^a-zA-Z0-9_-]/g, '');
    const decodedFileName = decodeURIComponent(fileName);
    const safeFileName = path.basename(decodedFileName);

    if (
      decodedFileName.includes('..') ||
      decodedFileName.includes('/') ||
      decodedFileName.includes('\\') ||
      safeFileName !== decodedFileName
    ) {
      return NextResponse.json({ error: 'Nombre de archivo inválido.' }, { status: 400 });
    }

    let fileBuffer = dbRepository.readStlFile(safeCode, safeFileName);

    // Si no está en disco local (ej. Vercel con disco efímero), recuperar desde la nube activa
    if (!fileBuffer) {
      const db = await dbRepository.getDatabase();
      const targetPrint = db.prints.find((p) => p.code.toUpperCase() === safeCode.toUpperCase());
      const targetMeta = targetPrint?.files.find(
        (f) => f.storedFileName === safeFileName || f.originalName === safeFileName
      );

      const remoteBuffer = await googleBridge.fetchRemoteStlBuffer(
        safeCode,
        safeFileName,
        targetMeta?.driveFileId
      );

      if (remoteBuffer && remoteBuffer.length > 0) {
        fileBuffer = remoteBuffer;
      }
    }

    if (!fileBuffer) {
      return NextResponse.json(
        { error: 'Archivo STL no encontrado en el servidor de laboratorios ni en la nube.' },
        { status: 404 }
      );
    }

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'model/stl',
        'Content-Disposition': `inline; filename="${safeFileName}"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al servir archivo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
