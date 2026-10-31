'use client';

import React from 'react';
import Link from 'next/link';
import {
  CalendarClock,
  GraduationCap,
  Wrench,
  Printer,
  ArrowUpRight,
} from 'lucide-react';

interface OptionItem {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const OPTIONS: OptionItem[] = [
  {
    href: '/reservas',
    title: 'Reservar Laboratorio',
    description:
      'Consulta la disponibilidad semanal y reserva bloques horarios en Automatización, Electrónica o Mecatrónica.',
    icon: CalendarClock,
  },
  {
    href: '/asesorias',
    title: 'Solicitar Asesorías',
    description:
      'Agenda sesiones de asesoría para tu proyecto con cualquiera de los 4 asesores según su horario de atención.',
    icon: GraduationCap,
  },
  {
    href: '/prestamos',
    title: 'Préstamo de Equipos',
    description:
      'Registra el formato de entrega de materiales y/o equipos de laboratorio con firma digital del responsable.',
    icon: Wrench,
  },
  {
    href: '/impresion-3d',
    title: 'Impresión 3D',
    description:
      'Envía tus archivos .stl para manufactura aditiva o realiza el seguimiento del estado de tus solicitudes.',
    icon: Printer,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-8.5rem)] flex flex-col justify-center bg-[#f8f9fa] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto w-full space-y-10">
        {/* Encabezado Minimalista con Identidad UPN */}
        <header className="text-center space-y-3 max-w-2xl mx-auto">
          <div className="inline-block px-3.5 py-1 rounded-full bg-[#fdba30] text-black text-xs font-extrabold uppercase tracking-wider">
            Automatización • Electrónica • Mecatrónica
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-black">
            Plataforma de Servicios de Laboratorio
          </h1>
          <p className="text-sm text-[#6c757d] leading-relaxed">
            Selecciona una opción para continuar.
          </p>
        </header>

        {/* Grilla Minimalista de Opciones */}
        <section aria-label="Opciones del Sistema">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {OPTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group bg-white rounded-2xl p-6 sm:p-7 border border-[#dee2e6] hover:border-[#fdba30] hover:ring-2 hover:ring-[#fdba30]/40 transition-all duration-200 flex flex-col justify-between gap-6 shadow-2xs hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#fdba30]"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-11 h-11 rounded-xl bg-[#fdba30] group-hover:bg-black text-black group-hover:text-[#fdba30] flex items-center justify-center transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>
                      <ArrowUpRight className="w-5 h-5 text-[#adb5bd] group-hover:text-black group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                    </div>

                    <div className="space-y-1.5">
                      <h2 className="text-base sm:text-lg font-bold text-black">
                        {item.title}
                      </h2>
                      <p className="text-xs sm:text-sm text-[#6c757d] leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs font-bold text-black group-hover:text-[#d39e00] transition-colors">
                    Ingresar →
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
