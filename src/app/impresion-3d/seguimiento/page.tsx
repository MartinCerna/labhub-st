'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Print3DPortalView } from '@/components/student/Print3DPortalView';

function Print3DTrackingContent() {
  const searchParams = useSearchParams();
  const trackQuery = searchParams.get('track') || undefined;

  return <Print3DPortalView mode="tracking" initialTrackQuery={trackQuery} />;
}

export default function Print3DTrackingPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-4">
      <Suspense
        fallback={
          <div className="max-w-5xl mx-auto px-4 py-16 text-center text-slate-500 text-sm">
            Cargando seguimiento de solicitudes 3D...
          </div>
        }
      >
        <Print3DTrackingContent />
      </Suspense>
    </div>
  );
}
