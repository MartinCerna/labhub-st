import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/shared/ToastProvider';
import { Navbar } from '@/components/shared/Navbar';

export const metadata: Metadata = {
  title: 'LabHub ST | Plataforma de Laboratorios de Ingeniería',
  description:
    'Plataforma de gestión de reservas, asesorías, préstamo de equipos e impresión 3D para los Laboratorios de Automatización, Electrónica y Mecatrónica. Desarrollado por Martin Cerna.',
  authors: [{ name: 'Martin Cerna', url: 'mailto:martin.cernaa@gmail.com' }],
  creator: 'Martin Cerna',
  publisher: 'Martin Cerna',
  other: {
    copyright: '© 2026 Martin Cerna. Todos los derechos reservados.',
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

          {/* Footer de Propiedad Intelectual y Copyright */}
          <footer className="border-t border-slate-200 bg-white py-5 text-xs text-slate-500 no-print">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
              <div>
                <span className="font-semibold text-slate-800">
                  © {currentYear} Martin Cerna.
                </span>{' '}
                <span>
                  Todos los derechos reservados. Prohibida su reproducción, distribución o modificación sin autorización expresa del autor.
                </span>
              </div>
              <div className="text-[11px] font-medium text-slate-400 shrink-0">
                Arquitectura y Desarrollo por <span className="text-slate-700 font-semibold">Martin Cerna</span>
              </div>
            </div>
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
