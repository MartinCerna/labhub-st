import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import {
  CreateEquipmentLoanPayload,
  EquipmentLoan,
  EquipmentLoanStatus,
} from '@/types/labhub';
import { dbRepository } from '@/lib/storage/db';
import { getAdminSessionFromRequest, requireAdminSession } from '@/lib/auth';
import { googleBridge } from '@/lib/google/bridge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    const db = await dbRepository.getDatabase();

    if (code) {
      const cleanCode = code.trim().toUpperCase();
      const loan = db.loans.find(
        (l) => l.code.toUpperCase() === cleanCode || l.id === code.trim()
      );

      if (!loan) {
        return NextResponse.json(
          { error: `No se encontró la ficha de préstamo con código "${cleanCode}".` },
          { status: 404 }
        );
      }

      return NextResponse.json({ loan });
    }

    // Si no solicita un código específico, requiere credenciales de administración
    requireAdminSession(request);
    return NextResponse.json({ loans: db.loans });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al consultar préstamo';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as CreateEquipmentLoanPayload;

    if (
      !payload.labId ||
      !payload.teacherName?.trim() ||
      !payload.cycle?.trim() ||
      !payload.courseProgram?.trim() ||
      !payload.attendedByAdvisorId ||
      !Array.isArray(payload.items) ||
      payload.items.length === 0 ||
      !Array.isArray(payload.groupMembers) ||
      payload.groupMembers.length === 0 ||
      !payload.responsibleName?.trim() ||
      !payload.responsibleUpnCode?.trim() ||
      !payload.signatureDataUrl ||
      payload.signatureDataUrl.length < 50
    ) {
      return NextResponse.json(
        {
          error:
            'Todos los campos son obligatorios: debe incluir al menos un material/equipo, los integrantes del grupo y la firma digital del responsable.',
        },
        { status: 400 }
      );
    }

    // Validar ítems
    for (const item of payload.items) {
      if (!item.equipmentName?.trim() || !item.upnCode?.trim() || item.quantity <= 0) {
        return NextResponse.json(
          { error: 'Cada ítem solicitado debe tener cantidad válida, nombre y código patrimonial UPN.' },
          { status: 400 }
        );
      }
    }

    const createdLoan = await dbRepository.updateDatabase(async (db) => {
      const advisor = db.advisors.find((a) => a.id === payload.attendedByAdvisorId);
      const attendedByName = advisor ? advisor.fullName : 'Asistente de Laboratorio';

      const seq = db.sequences.loan;
      db.sequences.loan += 1;
      const code = `EQP-2026-${String(seq).padStart(4, '0')}`;

      const loan: EquipmentLoan = {
        id: crypto.randomUUID(),
        code,
        labId: payload.labId,
        teacherName: payload.teacherName.trim(),
        cycle: payload.cycle.trim(),
        courseProgram: payload.courseProgram.trim(),
        attendedByAdvisorId: payload.attendedByAdvisorId,
        attendedByName,
        items: payload.items.map((it) => ({
          quantity: Number(it.quantity) || 1,
          equipmentName: it.equipmentName.trim(),
          upnCode: it.upnCode.trim().toUpperCase(),
        })),
        groupMembers: payload.groupMembers.map((g) => ({
          fullName: g.fullName.trim(),
          nrc: g.nrc.trim(),
        })),
        responsibleName: payload.responsibleName.trim(),
        responsibleUpnCode: payload.responsibleUpnCode.trim().toUpperCase(),
        signatureDataUrl: payload.signatureDataUrl,
        status: 'PENDIENTE',
        createdAt: new Date().toISOString(),
        googleSynced: false,
      };

      db.loans.push(loan);
      return loan;
    });

    // Disparar sincronización asíncrona hacia Google Drive / Sheets
    googleBridge.syncLoan(createdLoan);

    return NextResponse.json(
      {
        loan: createdLoan,
        message: 'Solicitud de préstamo registrada exitosamente.',
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al registrar préstamo';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const adminUser = requireAdminSession(request);
    const body = (await request.json()) as {
      id: string;
      status: EquipmentLoanStatus;
      adminNotes?: string;
    };

    if (!body.id || !body.status) {
      return NextResponse.json(
        { error: 'Los parámetros "id" y "status" son obligatorios.' },
        { status: 400 }
      );
    }

    const updatedLoan = await dbRepository.updateDatabase(async (db) => {
      const loan = db.loans.find((l) => l.id === body.id);
      if (!loan) {
        throw new Error('Registro de préstamo no encontrado.');
      }

      loan.status = body.status;
      if (body.adminNotes !== undefined) {
        loan.adminNotes = body.adminNotes.trim();
      }

      if (body.status === 'ENTREGADO') {
        loan.deliveredAt = new Date().toISOString();
        loan.deliveredByAdmin = adminUser.fullName;
      }

      return loan;
    });

    // Sincronizar actualización
    googleBridge.syncLoan(updatedLoan);

    return NextResponse.json({ loan: updatedLoan });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al actualizar préstamo';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}
