import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/shared/ToastProvider';
import { Navbar } from '@/components/shared/Navbar';

export const metadata: Metadata = {
  title: 'LabHub ST | Plataforma de Laboratorios de Ingeniería UPN',
  description:
    'Plataforma de gestión de reservas, asesorías, préstamo de equipos e impresión 3D para los Laboratorios de Automatización, Electrónica y Mecatrónica — UPN Campus Trujillo (San Isidro). Desarrollado por Martín Aarón León Cerna.',
  authors: [{ name: 'Martín Aarón León Cerna', url: 'mailto:martin.cernaa@gmail.com' }],
  creator: 'Martín Aarón León Cerna',
  publisher: 'Martín Aarón León Cerna',
  other: {
    copyright: '© 2026 Martín Aarón León Cerna. Todos los derechos reservados.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentYear = new Date().getFullYear();

  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-slate-50/60 text-slate-900 selection:bg-amber-400 selection:text-slate-950">
        <ToastProvider>
          <Navbar />
          <main className="flex-1">{children}</main>

          {/* Footer Institucional de Propiedad Intelectual y Copyright */}
          <footer className="border-t-2 border-[#fdba30] bg-[#212529] py-6 text-xs text-slate-400 no-print">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
              <div className="space-y-1">
                <div>
                  <span className="font-bold text-white">
                    © {currentYear} Martín Aarón León Cerna.
                  </span>{' '}
                  <span className="text-slate-300">
                    Todos los derechos reservados. Prohibida su reproducción, distribución o modificación sin autorización expresa del autor.
                  </span>
                </div>
                <div className="text-[11px] font-semibold text-[#fdba30]">
                  Universidad Privada del Norte (UPN) • Campus Trujillo - San Isidro • Laboratorios de Ingeniería (Automatización, Electrónica y Mecatrónica)
                </div>
              </div>
            </div>
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
