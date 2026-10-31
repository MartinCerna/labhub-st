'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function resolveSectionTitle(pathname: string): string | null {
  if (pathname === '/') return null;
  if (pathname.startsWith('/reservas')) return 'Reserva de Laboratorio';
  if (pathname.startsWith('/asesorias')) return 'Solicitud de Asesorías';
  if (pathname.startsWith('/prestamos')) return 'Préstamo de Equipos';
  if (pathname.startsWith('/impresion-3d/seguimiento')) return 'Seguimiento 3D';
  if (pathname.startsWith('/impresion-3d')) return 'Impresión 3D';
  if (pathname.startsWith('/admin')) return 'Administración';
  return null;
}

export function Navbar() {
  const pathname = usePathname();
  const sectionTitle = resolveSectionTitle(pathname);

  return (
    <nav className="sticky top-0 z-40 w-full border-b-2 border-[#fdba30] bg-white text-[#212529] shadow-2xs no-print">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-stretch justify-between h-16">
          {/* Enlace al Inicio presionando sobre el Logo UPN (altura completa sin padding) o el título */}
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
                LabHub <span className="text-[#d39e00]">ST</span>
              </span>
              <span className="text-[11px] font-medium text-[#6c757d] hidden sm:inline leading-none">
                Automatización • Electrónica • Mecatrónica
              </span>
            </div>
          </Link>

          {/* Indicador minimalista de la sección actual cuando se está fuera del inicio */}
          {sectionTitle && (
            <div className="flex items-center">
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#fdba30]/20 border border-[#fdba30] text-xs font-bold text-black">
                {sectionTitle}
              </span>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
