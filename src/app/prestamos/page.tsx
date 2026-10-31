'use client';

import React from 'react';
import { EquipmentLoanForm } from '@/components/student/EquipmentLoanForm';

export default function LoansPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-4">
      <EquipmentLoanForm mode="form" />
    </div>
  );
}
