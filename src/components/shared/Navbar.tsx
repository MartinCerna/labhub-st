'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/reservas', label: 'Reservas', shortLabel: 'Reservas' },
  { href: '/asesorias', label: 'Asesorías', shortLabel: 'Asesorías' },
  { href: '/prestamos', label: 'Préstamos', shortLabel: 'Préstamos' },
  { href: '/impresion-3d', label: 'Impresión 3D', shortLabel: 'Impresión 3D' },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 w-full border-b-2 border-[#fdba30] bg-white text-[#212529] shadow-2xs no-print">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-stretch justify-between h-16">
          {/* Enlace al Inicio presionando sobre el Logo UPN o el título */}
          <Link
            href="/"
            className="flex items-center gap-3.5 group focus:outline-none h-full"
            title="Ir a la página de inicio"
          >
            {/* Logo oficial UPN ocupando el 100% de la altura del navbar sin padding */}
            <img
              src="/logo-upn.svg"
              alt="Logo UPN - Universidad Privada del Norte"
              className="h-full w-auto block object-cover shrink-0"
            />
            <div className="flex flex-col text-left">
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-black group-hover:text-[#d39e00] transition-colors">
                Hub de Laboratorios <span className="text-[#d39e00]">UPN</span>
              </span>
              <span className="text-[11px] font-medium text-[#6c757d] hidden sm:inline leading-none">
                Automatización • Electrónica • Mecatrónica
              </span>
            </div>
          </Link>

          {/* Enlaces de navegación directa en desktop/tablet */}
          <div className="hidden md:flex items-center gap-1.5">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                    isActive
                      ? 'bg-[#fdba30] text-black font-bold shadow-2xs'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-black font-medium'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            {pathname.startsWith('/admin') && (
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#fdba30]/20 border border-[#fdba30] text-xs font-bold text-black ml-1">
                Administración
              </span>
            )}
          </div>

          {/* Indicador en barra superior para pantallas móviles si está en /admin */}
          {pathname.startsWith('/admin') && (
            <div className="md:hidden flex items-center">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#fdba30]/20 border border-[#fdba30] text-xs font-bold text-black">
                Administración
              </span>
            </div>
          )}
        </div>

        {/* Fila móvil compacta cuando se navega dentro de los módulos */}
        {pathname !== '/' && !pathname.startsWith('/admin') && (
          <div className="md:hidden border-t border-slate-100 py-1.5 flex items-center justify-around gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors shrink-0 ${
                    isActive
                      ? 'bg-[#fdba30] text-black font-bold shadow-2xs'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-black font-medium'
                  }`}
                >
                  {item.shortLabel}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
