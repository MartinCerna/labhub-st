'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LabReservationView } from '@/components/student/LabReservationView';
import { LabId } from '@/types/labhub';

function ReservationsContent() {
  const searchParams = useSearchParams();
  const labParam = searchParams.get('lab') as LabId | null;
  const initialLab: LabId =
    labParam === 'electronica' || labParam === 'mecatronica' || labParam === 'automatizacion'
      ? labParam
      : 'automatizacion';

  return <LabReservationView initialLabId={initialLab} />;
}

export default function ReservationsPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-4">
      <Suspense
        fallback={
          <div className="max-w-7xl mx-auto px-4 py-16 text-center text-slate-500 text-sm">
            Cargando módulo de reservas...
          </div>
        }
      >
        <ReservationsContent />
      </Suspense>
    </div>
  );
}
