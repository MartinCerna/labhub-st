'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  AdminDashboardSummary,
  AdminSessionUser,
} from '@/types/labhub';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/shared/ToastProvider';
import { AdminAdvisoriesTab } from '@/components/admin/AdminAdvisoriesTab';
import { AdminLabsConfigTab } from '@/components/admin/AdminLabsConfigTab';
import { AdminAdvisorsConfigTab } from '@/components/admin/AdminAdvisorsConfigTab';
import { AdminLoansTab } from '@/components/admin/AdminLoansTab';
import { AdminPrints3DTab } from '@/components/admin/AdminPrints3DTab';
import {
  ShieldCheck,
  CalendarCheck2,
  Layers,
  Users,
  Wrench,
  Printer,
  LogOut,
  RefreshCw,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

type TabKey =
  | 'advisories'
  | 'labs'
  | 'advisors'
  | 'loans'
  | 'prints';

export default function AdminPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [currentUser, setCurrentUser] = useState<AdminSessionUser | null>(null);
  const [dashboard, setDashboard] = useState<AdminDashboardSummary | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('advisories');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cargar dashboard
  const loadDashboard = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorMessage(null);

      // Verificar sesión primero
      const sessionRes = await apiClient.getAdminSession();
      if (!sessionRes.user) {
        router.replace('/admin/login');
        return;
      }
      setCurrentUser(sessionRes.user);

      // Cargar resumen
      const dashData = await apiClient.getAdminDashboard();
      setDashboard(dashData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar los datos del panel.';
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router, showToast]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Cerrar sesión
  const handleLogout = async () => {
    try {
      await apiClient.adminLogout();
      showToast('Sesión administrativa cerrada correctamente.', 'info');
      router.push('/admin/login');
    } catch {
      router.push('/admin/login');
    }
  };

  if (loading) {
    return (
      <div className="min-h-[85vh] flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-500">
          Cargando panel de administración UPN...
        </p>
      </div>
    );
  }

  if (errorMessage && !dashboard) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 p-8 rounded-2xl max-w-md w-full text-center shadow-lg">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Error al conectar con el servidor
          </h3>
          <p className="text-xs text-slate-500 mt-2">{errorMessage}</p>
          <div className="mt-5 flex gap-2 justify-center">
            <button
              type="button"
              onClick={() => loadDashboard()}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              Reintentar
            </button>
            <Link
              href="/admin/login"
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200"
            >
              Ir a Iniciar Sesión
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboard || !currentUser) {
    return null;
  }

  // Contadores para pestañas
  const pendingLoansCount = dashboard.stats.pendingLoansCount;
  const activePrintsCount = dashboard.stats.active3DPrintsCount;
  const observedPrintsCount = dashboard.stats.observed3DPrintsCount;

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 pb-20">
      {/* BARRA SUPERIOR DE CABECERA ADMINISTRATIVA */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Logo y Rol */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-white flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-tight">
                  Panel de Administración • LabHub ST
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  {currentUser.role === 'COORDINADOR' ? 'ADMINISTRADOR TOTAL' : 'ADMINISTRADOR'}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Drive Activo
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Sesión activa: <strong className="text-slate-700 dark:text-slate-300">{currentUser.fullName}</strong> ({currentUser.username})
              </p>
            </div>
          </div>

          {/* Botones de acción del header */}
          <div className="flex items-center gap-2 justify-end">
            <Link
              href="/"
              target="_blank"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Abrir portal estudiantil en nueva pestaña"
            >
              <span>Portal Alumnos</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>

            <button
              type="button"
              disabled={refreshing}
              onClick={() => loadDashboard(true)}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Recargar datos del dashboard"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 border border-rose-200 dark:border-rose-900/50 transition-colors cursor-pointer"
              title="Cerrar sesión administrativa"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>

        {/* BARRA DE PESTAÑAS (TABS) */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-x-auto scrollbar-none">
          <nav className="flex space-x-1 sm:space-x-2 py-2 min-w-max">
            {/* Tab 1 */}
            <button
              type="button"
              onClick={() => setActiveTab('advisories')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'advisories'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <CalendarCheck2 className="w-4 h-4" />
              <span>Resumen & Asesorías</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  activeTab === 'advisories'
                    ? 'bg-amber-700 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {dashboard.advisories.length}
              </span>
            </button>

            {/* Tab 2 */}
            <button
              type="button"
              onClick={() => setActiveTab('labs')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'labs'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Laboratorios & Horarios</span>
            </button>

            {/* Tab 3 */}
            <button
              type="button"
              onClick={() => setActiveTab('advisors')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'advisors'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>
                {currentUser.role === 'COORDINADOR'
                  ? 'Tarjetas de Asesoría & Usuarios'
                  : 'Mi Tarjeta de Asesoría & Horario'}
              </span>
            </button>

            {/* Tab 4 */}
            <button
              type="button"
              onClick={() => setActiveTab('loans')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'loans'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>Préstamos de Equipos</span>
              {pendingLoansCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-orange-500 text-white font-bold animate-pulse">
                  {pendingLoansCount} pend.
                </span>
              )}
            </button>

            {/* Tab 5 */}
            <button
              type="button"
              onClick={() => setActiveTab('prints')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'prints'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Impresión 3D</span>
              {observedPrintsCount > 0 ? (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-600 text-white font-bold animate-pulse">
                  {observedPrintsCount} obs.
                </span>
              ) : activePrintsCount > 0 ? (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-600 text-white font-bold">
                  {activePrintsCount}
                </span>
              ) : null}
            </button>
          </nav>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL SEGÚN PESTAÑA ACTIVA */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {activeTab === 'advisories' && (
          <AdminAdvisoriesTab
            dashboard={dashboard}
            onRefresh={() => loadDashboard(true)}
          />
        )}

        {activeTab === 'labs' && (
          <AdminLabsConfigTab
            dashboard={dashboard}
            onRefresh={() => loadDashboard(true)}
          />
        )}

        {activeTab === 'advisors' && (
          <AdminAdvisorsConfigTab
            dashboard={dashboard}
            currentUser={currentUser}
            onRefresh={() => loadDashboard(true)}
          />
        )}

        {activeTab === 'loans' && (
          <AdminLoansTab
            dashboard={dashboard}
            onRefresh={() => loadDashboard(true)}
          />
        )}

        {activeTab === 'prints' && (
          <AdminPrints3DTab
            dashboard={dashboard}
            onRefresh={() => loadDashboard(true)}
          />
        )}
      </main>
    </div>
  );
}
