'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

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
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar menú al cambiar de ruta
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Cerrar al hacer clic o tap fuera del contenedor
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Obtener nombre de la sección actual
  const currentItem = NAV_ITEMS.find((item) => pathname.startsWith(item.href));
  const currentSectionLabel = currentItem ? currentItem.label : 'Módulos';

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

          {/* Elemento derecho en pantallas móviles */}
          {pathname.startsWith('/admin') ? (
            <div className="md:hidden flex items-center">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#fdba30]/20 border border-[#fdba30] text-xs font-bold text-black">
                Administración
              </span>
            </div>
          ) : (
            <div className="md:hidden flex items-center" ref={dropdownRef}>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsOpen((prev) => !prev)}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  aria-label="Seleccionar módulo"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#fdba30] text-black shadow-2xs border border-[#e0a800]/40 active:scale-95 transition-all"
                >
                  <span>{currentSectionLabel}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>

                {isOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-xl bg-white shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    {pathname !== '/' && (
                      <>
                        <Link
                          href="/"
                          onClick={() => setIsOpen(false)}
                          className="flex items-center px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-100 hover:text-black font-medium transition-colors"
                        >
                          Inicio
                        </Link>
                        <div className="my-1 border-t border-slate-100" />
                      </>
                    )}

                    {NAV_ITEMS.map((item) => {
                      const isActive = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsOpen(false)}
                          className={`flex items-center justify-between px-3.5 py-2 text-xs transition-colors ${
                            isActive
                              ? 'bg-[#fdba30]/20 text-black font-bold'
                              : 'text-slate-700 hover:bg-slate-100 hover:text-black font-medium'
                          }`}
                        >
                          <span>{item.label}</span>
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#d39e00]" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

