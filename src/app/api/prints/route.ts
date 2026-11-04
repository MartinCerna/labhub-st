import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import {
  Print3DRequest,
  Print3DStatus,
  StlFileMetadata,
} from '@/types/labhub';
import { OBSERVATION_WINDOW_HOURS, PRINT_3D_STATUSES } from '@/constants/schedule';
import { dbRepository } from '@/lib/storage/db';
import { parseStlBuffer, validateStlFileName } from '@/lib/stl-parser';
import { getAdminSessionFromRequest, requireAdminSession } from '@/lib/auth';
import { googleBridge } from '@/lib/google/bridge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query')?.trim().toUpperCase() || '';

    const db = await dbRepository.getDatabase();

    if (!query || query.length < 3) {
      const adminSession = getAdminSessionFromRequest(request);
      if (adminSession) {
        return NextResponse.json({ results: db.prints });
      }
      return NextResponse.json({ results: [] });
    }

    const filtered = db.prints.filter(
      (p) =>
        p.code.toUpperCase().includes(query) ||
        p.upnCode.toUpperCase().includes(query) ||
        p.studentFullName.toUpperCase().includes(query)
    );

    return NextResponse.json({ results: filtered });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al buscar solicitudes 3D';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const studentFullName = formData.get('studentFullName')?.toString().trim();
    const upnCode = formData.get('upnCode')?.toString().trim().toUpperCase();
    const teacherName = formData.get('teacherName')?.toString().trim();
    const course = formData.get('course')?.toString().trim();
    const nrc = formData.get('nrc')?.toString().trim();

    if (!studentFullName || !upnCode || !teacherName || !course || !nrc) {
      return NextResponse.json(
        { error: 'Todos los campos informativos del estudiante y curso son obligatorios.' },
        { status: 400 }
      );
    }

    // Extraer archivos .stl del FormData
    const uploadedFiles: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (value && typeof value === 'object' && 'name' in value && 'arrayBuffer' in value) {
        uploadedFiles.push(value as File);
      }
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json(
        { error: 'Debe adjuntar al menos un archivo con formato .stl.' },
        { status: 400 }
      );
    }

    for (const f of uploadedFiles) {
      if (!validateStlFileName(f.name)) {
        return NextResponse.json(
          { error: `El archivo "${f.name}" no cuenta con la extensión requerida .stl.` },
          { status: 400 }
        );
      }
    }

    // Generar código antes de guardar archivos para organizar en carpeta específica
    const code = await dbRepository.getNextPrintCode();
    const stlMetadataList: StlFileMetadata[] = [];

    for (let i = 0; i < uploadedFiles.length; i++) {
      const f = uploadedFiles[i];
      const arrayBuffer = await f.arrayBuffer();
      const nodeBuffer = Buffer.from(arrayBuffer);

      // Validación geométrica real (binario o ASCII)
      const geometry = parseStlBuffer(arrayBuffer);

      // Guardar archivo en disco seguro
      const { storedFileName } = await dbRepository.saveStlFile(
        code,
        f.name,
        nodeBuffer
      );

      stlMetadataList.push({
        id: crypto.randomUUID(),
        originalName: f.name,
        storedFileName,
        sizeBytes: nodeBuffer.length,
        format: geometry.format,
        triangleCount: geometry.triangleCount,
        dimensionsMm: geometry.dimensionsMm,
        estimatedVolumeCm3: geometry.estimatedVolumeCm3,
        version: 1,
        uploadedAt: new Date().toISOString(),
        downloadUrl: `/api/prints/files/${code}/${encodeURIComponent(storedFileName)}`,
      });
    }

    const createdRequest = await dbRepository.updateDatabase(async (db) => {
      const now = new Date().toISOString();
      const newPrint: Print3DRequest = {
        id: crypto.randomUUID(),
        code,
        studentFullName,
        upnCode,
        teacherName,
        course,
        nrc,
        files: stlMetadataList,
        status: 'ENVIADO',
        statusHistory: [
          {
            status: 'ENVIADO',
            timestamp: now,
            actor: studentFullName,
          },
        ],
        googleSynced: false,
        createdAt: now,
        updatedAt: now,
      };

      db.prints.push(newPrint);
      return newPrint;
    });

    // Disparar sincronización asíncrona hacia Google Drive
    googleBridge.syncPrint3D(createdRequest);

    return NextResponse.json(
      {
        printRequest: createdRequest,
        message: 'Solicitud de impresión 3D recibida con éxito.',
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al registrar solicitud 3D';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const adminUser = requireAdminSession(request);
    const body = (await request.json()) as {
      id: string;
      status: Print3DStatus;
      observationComment?: string;
    };

    if (!body.id || !body.status) {
      return NextResponse.json(
        { error: 'Los parámetros "id" y "status" son obligatorios.' },
        { status: 400 }
      );
    }

    if (!PRINT_3D_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `El estado "${body.status}" no es válido.` },
        { status: 400 }
      );
    }

    if (body.status === 'OBSERVADO' && !body.observationComment?.trim()) {
      return NextResponse.json(
        {
          error:
            'Para cambiar a estado OBSERVADO es obligatorio detallar el motivo de observación para el estudiante.',
        },
        { status: 400 }
      );
    }

    const updatedPrint = await dbRepository.updateDatabase(async (db) => {
      const printItem = db.prints.find((p) => p.id === body.id);
      if (!printItem) {
        throw new Error('Solicitud de impresión 3D no encontrada.');
      }

      const now = new Date();
      printItem.status = body.status;
      printItem.updatedAt = now.toISOString();

      if (body.status === 'OBSERVADO') {
        printItem.observationComment = body.observationComment?.trim();
        printItem.observedAt = now.toISOString();
        // Vencimiento exacto de 48 horas para subsanación
        printItem.observationExpiresAt = new Date(
          now.getTime() + OBSERVATION_WINDOW_HOURS * 3600 * 1000
        ).toISOString();
      }

      printItem.statusHistory.push({
        status: body.status,
        timestamp: now.toISOString(),
        actor: adminUser.fullName,
        comment: body.observationComment?.trim(),
      });

      return printItem;
    });

    // Sincronizar estado en Google Sheets
    googleBridge.syncPrintStatus(updatedPrint);

    return NextResponse.json({ printRequest: updatedPrint });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al actualizar estado 3D';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}
