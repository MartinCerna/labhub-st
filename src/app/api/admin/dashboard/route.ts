import { NextRequest, NextResponse } from 'next/server';
import { AdminDashboardSummary } from '@/types/labhub';
import { dbRepository } from '@/lib/storage/db';
import { requireAdminSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    requireAdminSession(request);

    const db = await dbRepository.getDatabase();

    const activeReservationsCount = db.reservations.filter(
      (r) => r.status === 'ACTIVA'
    ).length;

    const scheduledAdvisoriesCount = db.advisories.filter(
      (a) => a.status === 'PROGRAMADA'
    ).length;

    const pendingLoansCount = db.loans.filter(
      (l) => l.status === 'PENDIENTE'
    ).length;

    const deliveredLoansCount = db.loans.filter(
      (l) => l.status === 'ENTREGADO'
    ).length;

    const active3DPrintsCount = db.prints.filter(
      (p) => p.status !== 'ENTREGADA'
    ).length;

    const observed3DPrintsCount = db.prints.filter(
      (p) => p.status === 'OBSERVADO'
    ).length;

    const summary: AdminDashboardSummary = {
      stats: {
        activeReservationsCount,
        scheduledAdvisoriesCount,
        pendingLoansCount,
        deliveredLoansCount,
        active3DPrintsCount,
        observed3DPrintsCount,
      },
      labs: db.labs,
      advisors: db.advisors,
      recurringClasses: db.recurringClasses,
      slotBlocks: db.slotBlocks,
      recentReservations: [...db.reservations].reverse().slice(0, 50),
      advisories: [...db.advisories].reverse().slice(0, 50),
      loans: [...db.loans].reverse().slice(0, 50),
      printRequests: [...db.prints].reverse().slice(0, 50),
      teachersCatalog: db.teachersCatalog,
      googleConfig: db.googleConfig,
    };

    return NextResponse.json(summary);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al obtener dashboard';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}
