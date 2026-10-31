'use client';

import React, { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Print3DPortalView } from '@/components/student/Print3DPortalView';

function Print3DContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const trackQuery = searchParams.get('track');

  useEffect(() => {
    if (trackQuery) {
      router.replace(`/impresion-3d/seguimiento?track=${encodeURIComponent(trackQuery)}`);
    }
  }, [trackQuery, router]);

  if (trackQuery) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-slate-500 text-sm">
        Redirigiendo a seguimiento de solicitud...
      </div>
    );
  }

  return <Print3DPortalView mode="form" />;
}

export default function Print3DPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-4">
      <Suspense
        fallback={
          <div className="max-w-5xl mx-auto px-4 py-16 text-center text-slate-500 text-sm">
            Cargando portal de manufactura 3D...
          </div>
        }
      >
        <Print3DContent />
      </Suspense>
    </div>
  );
}
