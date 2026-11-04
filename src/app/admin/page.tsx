'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  AdminDashboardSummary,
  AdminSessionUser,
  Print3DRequest,
  LabReservation,
  EquipmentLoan,
  AdvisoryRequest,
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
  Search,
  X,
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

  // M13: Buscador Global Rápido en el Panel Admin
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [contextualSearchCode, setContextualSearchCode] = useState<string>('');
  const searchContainerRef = useRef<HTMLDivElement>(null);

  interface GlobalSearchResultItem {
    id: string;
    code: string;
    category: 'Préstamos de Equipos' | 'Impresión 3D' | 'Asesorías Especializadas' | 'Reservas de Laboratorio';
    tab: TabKey;
    title: string;
    subtitle: string;
    upnCode?: string;
    badgeText: string;
    badgeColor: string;
    prefix: 'EQP' | '3DP' | 'ASE' | 'RES';
  }

  // Cerrar búsqueda con Escape o clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // M13: Cálculo de resultados en tiempo real cuando la búsqueda tiene al menos 2 caracteres
  const searchResults = useMemo(() => {
    if (!dashboard || globalSearchQuery.trim().length < 2) return [];

    const q = globalSearchQuery.trim().toLowerCase();
    const items: GlobalSearchResultItem[] = [];

    // 1. Préstamos de Equipos (EQP)
    (dashboard.loans || []).forEach((loan) => {
      const matchCode = loan.code?.toLowerCase().includes(q);
      const matchName = loan.responsibleName?.toLowerCase().includes(q);
      const matchUpn = loan.responsibleUpnCode?.toLowerCase().includes(q);
      const matchCourse = loan.courseProgram?.toLowerCase().includes(q);
      const matchEquip = loan.items?.some((it) => it.equipmentName?.toLowerCase().includes(q));

      if (matchCode || matchName || matchUpn || matchCourse || matchEquip) {
        items.push({
          id: loan.id,
          code: loan.code,
          category: 'Préstamos de Equipos',
          tab: 'loans',
          title: loan.responsibleName,
          subtitle: `${loan.courseProgram} • ${loan.items.length} equipo(s)`,
          upnCode: loan.responsibleUpnCode,
          badgeText: loan.status === 'EN_USO' ? 'EN PRÉSTAMO' : loan.status === 'PENDIENTE' ? 'PENDIENTE' : 'DEVUELTO',
          badgeColor: loan.status === 'EN_USO' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' : loan.status === 'PENDIENTE' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
          prefix: 'EQP',
        });
      }
    });

    // 2. Impresión 3D (3DP)
    const prints = ((dashboard as any).prints || dashboard.printRequests || []) as Print3DRequest[];
    prints.forEach((print) => {
      const matchCode = print.code?.toLowerCase().includes(q);
      const matchName = print.studentFullName?.toLowerCase().includes(q);
      const matchUpn = print.upnCode?.toLowerCase().includes(q);
      const matchCourse = print.course?.toLowerCase().includes(q);

      if (matchCode || matchName || matchUpn || matchCourse) {
        items.push({
          id: print.id,
          code: print.code,
          category: 'Impresión 3D',
          tab: 'prints',
          title: print.studentFullName,
          subtitle: `${print.course} • ${print.files?.length || 1} archivo(s) .stl`,
          upnCode: print.upnCode,
          badgeText: print.status,
          badgeColor: print.status === 'OBSERVADO' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' : print.status === 'ENTREGADA' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
          prefix: '3DP',
        });
      }
    });

    // 3. Asesorías Especializadas (ASE)
    (dashboard.advisories || []).forEach((adv) => {
      const matchCode = adv.code?.toLowerCase().includes(q);
      const matchProject = adv.projectName?.toLowerCase().includes(q);
      const matchCourse = adv.course?.toLowerCase().includes(q);
      const matchStudent = adv.students?.some(
        (s) => s.fullName?.toLowerCase().includes(q) || s.upnCode?.toLowerCase().includes(q)
      );

      if (matchCode || matchProject || matchCourse || matchStudent) {
        const lead = adv.students?.[0];
        items.push({
          id: adv.id,
          code: adv.code,
          category: 'Asesorías Especializadas',
          tab: 'advisories',
          title: lead ? `${lead.fullName} (${lead.upnCode})` : adv.projectName,
          subtitle: `${adv.course} • ${adv.projectName}`,
          upnCode: lead?.upnCode,
          badgeText: adv.status,
          badgeColor: adv.status === 'PROGRAMADA' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' : adv.status === 'ATENDIDA' ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
          prefix: 'ASE',
        });
      }
    });

    // 4. Reservas de Laboratorio (RES)
    const reservations = ((dashboard as any).reservations || dashboard.recentReservations || []) as LabReservation[];
    reservations.forEach((res) => {
      const matchCode = res.code?.toLowerCase().includes(q);
      const matchLead = res.leadStudent?.fullName?.toLowerCase().includes(q) || res.leadStudent?.upnCode?.toLowerCase().includes(q);
      const matchCourse = res.course?.toLowerCase().includes(q);
      const matchProject = res.projectName?.toLowerCase().includes(q);

      if (matchCode || matchLead || matchCourse || matchProject) {
        items.push({
          id: res.id,
          code: res.code,
          category: 'Reservas de Laboratorio',
          tab: 'labs',
          title: res.leadStudent ? `${res.leadStudent.fullName} (${res.leadStudent.upnCode})` : res.projectName,
          subtitle: `${res.course} • ${res.projectName}`,
          upnCode: res.leadStudent?.upnCode,
          badgeText: res.status,
          badgeColor: res.status === 'ACTIVA' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
          prefix: 'RES',
        });
      }
    });

    return items.slice(0, 12);
  }, [dashboard, globalSearchQuery]);

  const handleSelectSearchResult = (item: GlobalSearchResultItem) => {
    setActiveTab(item.tab);
    if (item.tab !== 'labs') {
      setContextualSearchCode(item.code);
    }
    setGlobalSearchQuery('');
    setIsSearchFocused(false);
    showToast(`Navegando a ${item.category} (${item.code})...`, 'info');
  };

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
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

          {/* M13: Buscador Global Rápido en el Panel Admin */}
          <div ref={searchContainerRef} className="relative flex-1 max-w-md w-full my-1 md:my-0 mx-0 md:mx-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearchQuery}
                onChange={(e) => {
                  setGlobalSearchQuery(e.target.value);
                  setIsSearchFocused(true);
                }}
                onFocus={() => setIsSearchFocused(true)}
                placeholder="Buscar alumno, código UPN o ticket (RES / 3DP / EQP / ASE)..."
                className="w-full pl-9 pr-8 py-2 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
              />
              {globalSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setGlobalSearchQuery('');
                    setIsSearchFocused(false);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Panel Flotante Desplegable de Resultados */}
            {isSearchFocused && globalSearchQuery.trim().length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-2 z-50 max-h-96 overflow-y-auto animate-in fade-in zoom-in-95">
                <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>Coincidencias en Vivo ({searchResults.length})</span>
                  <span className="text-[10px] text-slate-400">ESC para cerrar</span>
                </div>

                {searchResults.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    No se encontraron registros para &quot;{globalSearchQuery}&quot;
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {searchResults.map((item) => (
                      <button
                        key={`${item.prefix}-${item.id}`}
                        type="button"
                        onClick={() => handleSelectSearchResult(item)}
                        className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                              {item.code}
                            </span>
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                              {item.title}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            <strong className="text-slate-600 dark:text-slate-400">{item.category}</strong> • {item.subtitle}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${item.badgeColor}`}
                        >
                          {item.badgeText}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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
            initialSearchQuery={contextualSearchCode}
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
            initialSearchQuery={contextualSearchCode}
          />
        )}

        {activeTab === 'prints' && (
          <AdminPrints3DTab
            dashboard={dashboard}
            onRefresh={() => loadDashboard(true)}
            initialSearchQuery={contextualSearchCode}
          />
        )}
      </main>
    </div>
  );
}
