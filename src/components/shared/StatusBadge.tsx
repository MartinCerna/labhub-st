'use client';

import React from 'react';
import {
  Clock,
  Search,
  AlertTriangle,
  Layers,
  Printer,
  CheckCircle2,
  PackageCheck,
  XCircle,
  CalendarCheck,
  GraduationCap,
  Lock,
  Users,
  History,
  MinusCircle,
  Ban,
  Check,
  CheckCheck,
} from 'lucide-react';

export interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

interface BadgeConfig {
  label: string;
  className: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const normalized = (status || '').trim().toUpperCase();

  const config = getStatusConfig(normalized);
  const Icon = config.icon;

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[11px] gap-1'
      : 'px-2.5 py-1 text-xs gap-1.5';

  const iconSizes = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border shadow-2xs whitespace-nowrap transition-colors ${sizeClasses} ${config.className}`}
    >
      <Icon className={`shrink-0 ${iconSizes}`} />
      <span>{config.label}</span>
    </span>
  );
}

function getStatusConfig(status: string): BadgeConfig {
  switch (status) {
    // ------------------------------------------------------------------------
    // MÓDULO 4: IMPRESIÓN 3D
    // ------------------------------------------------------------------------
    case 'ENVIADO':
      return {
        label: 'Enviado',
        className: 'bg-sky-50 text-sky-700 border-sky-200',
        icon: Clock,
      };
    case 'EN REVISION':
      return {
        label: 'En Revisión',
        className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        icon: Search,
      };
    case 'OBSERVADO':
      return {
        label: 'Observado (72h)',
        className: 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse',
        icon: AlertTriangle,
      };
    case 'RECHAZADA':
      return {
        label: 'Rechazada',
        className: 'bg-rose-50 text-rose-700 border-rose-300 font-bold',
        icon: XCircle,
      };
    case 'EN COLA':
      return {
        label: 'En Cola',
        className: 'bg-purple-50 text-purple-700 border-purple-200',
        icon: Layers,
      };
    case 'IMPRIMIENDO':
      return {
        label: 'Imprimiendo',
        className: 'bg-amber-50 text-amber-800 border-amber-300 font-bold',
        icon: Printer,
      };
    case 'LISTA':
      return {
        label: 'Lista para Retiro',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-300',
        icon: CheckCircle2,
      };
    case 'ENTREGADA':
      return {
        label: 'Pieza Entregada',
        className: 'bg-slate-100 text-slate-700 border-slate-300',
        icon: PackageCheck,
      };

    // ------------------------------------------------------------------------
    // MÓDULO 3: PRÉSTAMO DE EQUIPOS
    // ------------------------------------------------------------------------
    case 'PENDIENTE':
      return {
        label: 'En Préstamo (Pendiente)',
        className: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: Clock,
      };
    case 'ENTREGADO':
      return {
        label: 'Devuelto / Entregado',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-300',
        icon: CheckCircle2,
      };

    // ------------------------------------------------------------------------
    // MÓDULO 1 Y 2: RESERVAS Y ASESORÍAS
    // ------------------------------------------------------------------------
    case 'ACTIVA':
      return {
        label: 'Activa',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: CheckCircle2,
      };
    case 'PROGRAMADA':
      return {
        label: 'Programada',
        className: 'bg-sky-50 text-sky-700 border-sky-200',
        icon: CalendarCheck,
      };
    case 'ATENDIDA':
      return {
        label: 'Atendida',
        className: 'bg-teal-50 text-teal-700 border-teal-200',
        icon: CheckCheck,
      };
    case 'CANCELADA':
      return {
        label: 'Cancelada',
        className: 'bg-rose-50 text-rose-600 border-rose-200 line-through opacity-85',
        icon: XCircle,
      };

    // ------------------------------------------------------------------------
    // ESTADOS DE BLOQUES (LABORATORIOS / ASESORES)
    // ------------------------------------------------------------------------
    case 'DISPONIBLE':
      return {
        label: 'Disponible',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: Check,
      };
    case 'CLASE':
      return {
        label: 'Clase Regular',
        className: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: GraduationCap,
      };
    case 'BLOQUEADO':
      return {
        label: 'Bloqueado',
        className: 'bg-slate-100 text-slate-600 border-slate-300',
        icon: Lock,
      };
    case 'COMPLETO':
      return {
        label: 'Agotado (Sin Cupo)',
        className: 'bg-orange-50 text-orange-700 border-orange-200',
        icon: Users,
      };
    case 'PASADO':
      return {
        label: 'Pasado',
        className: 'bg-slate-100 text-slate-400 border-slate-200 opacity-60',
        icon: History,
      };
    case 'OCUPADO':
      return {
        label: 'Ocupado',
        className: 'bg-amber-50 text-amber-800 border-amber-200',
        icon: Users,
      };
    case 'NO_ATIENDE':
      return {
        label: 'No Atiende',
        className: 'bg-slate-100 text-slate-500 border-slate-200',
        icon: MinusCircle,
      };
    case 'LAB_SIN_CUPO':
      return {
        label: 'Lab sin Cupo',
        className: 'bg-rose-50 text-rose-700 border-rose-200',
        icon: Ban,
      };

    // Fallback general
    default:
      return {
        label: status || 'Estado',
        className: 'bg-slate-100 text-slate-700 border-slate-200',
        icon: Clock,
      };
  }
}
