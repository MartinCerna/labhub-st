'use client';

import React, { useState, useEffect } from 'react';
import {
  AdminDashboardSummary,
  AdvisoryRequest,
  AdvisoryStatus,
} from '@/types/labhub';
import { TIME_BLOCK_MAP, LAB_MAP } from '@/constants/schedule';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/shared/ToastProvider';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { buildAdvisoryCalendarDetails, buildGoogleCalendarUrl } from '@/lib/calendar/ics';
import {
  Calendar,
  Clock,
  UserCheck,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Download,
  Filter,
  Search,
  Users,
  BookOpen,
  MapPin,
  CalendarCheck2,
  Wrench,
  Printer,
  FolderKanban,
  RefreshCw,
} from 'lucide-react';

interface AdminAdvisoriesTabProps {
  dashboard: AdminDashboardSummary;
  onRefresh: () => Promise<void>;
  initialSearchQuery?: string;
}

export function AdminAdvisoriesTab({ dashboard, onRefresh, initialSearchQuery }: AdminAdvisoriesTabProps) {
  const { showToast } = useToast();
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // A5: Filtro contextual instantáneo desde el Buscador Global
  useEffect(() => {
    if (initialSearchQuery && initialSearchQuery.trim()) {
      setSearchQuery(initialSearchQuery);
      setSelectedStatus('ALL');
      setSelectedAdvisorId('ALL');
    }
  }, [initialSearchQuery]);

  const { stats, advisories, advisors } = dashboard;

  // Filtrado de asesorías
  const filteredAdvisories = advisories.filter((adv) => {
    if (selectedAdvisorId !== 'ALL' && adv.advisorId !== selectedAdvisorId) {
      return false;
    }
    if (selectedStatus !== 'ALL' && selectedStatus !== 'TODOS' && adv.status !== selectedStatus) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCode = adv.code.toLowerCase().includes(q);
      const matchProject = adv.projectName.toLowerCase().includes(q);
      const matchCourse = adv.course.toLowerCase().includes(q);
      const matchNrc = adv.nrc.toLowerCase().includes(q);
      const matchAdvisor = adv.advisorName.toLowerCase().includes(q);
      const matchStudent = adv.students.some(
        (s) => s.fullName.toLowerCase().includes(q) || s.upnCode.toLowerCase().includes(q)
      );
      if (!matchCode && !matchProject && !matchCourse && !matchNrc && !matchAdvisor && !matchStudent) {
        return false;
      }
    }
    return true;
  });

  const handleUpdateStatus = async (id: string, newStatus: AdvisoryStatus) => {
    try {
      setActionLoadingId(id);
      await apiClient.updateAdvisoryStatus(id, newStatus);
      showToast(
        newStatus === 'ATENDIDA'
          ? 'Asesoría marcada como ATENDIDA exitosamente.'
          : 'Asesoría marcada como CANCELADA.',
        'success'
      );
      await onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar el estado de la asesoría.';
      showToast(msg, 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSyncCalendar = async (adv: AdvisoryRequest, blocksText: string) => {
    try {
      setSyncingId(adv.id);
      await apiClient.updateAdvisoryStatus(adv.id, adv.status);
      showToast(
        `Horario de asesoría sincronizado con el calendario (${blocksText}).`,
        'success'
      );
      await onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al sincronizar el calendario.';
      showToast(msg, 'error');
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* TARJETAS KPI GLOBALES (4 INDICADORES CONCISOS) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* KPI 1: Reservas Activas */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Reservas Activas
            </span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600">
              <CalendarCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {stats.activeReservationsCount}
            </span>
            <span className="text-xs text-slate-400">laboratorios</span>
          </div>
        </div>

        {/* KPI 2: Asesorías Programadas */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Asesorías Programadas
            </span>
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {stats.scheduledAdvisoriesCount}
            </span>
            <span className="text-xs text-slate-400">en agenda</span>
          </div>
        </div>

        {/* KPI 3: Préstamos Pendientes */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Préstamos Pendientes
            </span>
            <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {stats.pendingLoansCount}
            </span>
            <span className="text-xs text-emerald-600 font-medium">
              +{stats.deliveredLoansCount} devueltos
            </span>
          </div>
        </div>

        {/* KPI 4: Impresiones 3D Activas */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Impresiones 3D Activas
            </span>
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600">
              <Printer className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {stats.active3DPrintsCount}
            </span>
            <span className="text-xs text-slate-400">en taller</span>
          </div>
        </div>
      </div>

      {/* SECCIÓN DE FILTROS Y BÚSQUEDA */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-3.5">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Selector de Asesor */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mr-1">
              <Filter className="w-3.5 h-3.5" />
              Asesor:
            </span>
            <button
              type="button"
              onClick={() => setSelectedAdvisorId('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                selectedAdvisorId === 'ALL'
                  ? 'bg-amber-600 text-white shadow-xs font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Todos ({advisories.length})
            </button>
            {advisors.map((adv) => {
              const count = advisories.filter((a) => a.advisorId === adv.id).length;
              return (
                <button
                  key={adv.id}
                  type="button"
                  onClick={() => setSelectedAdvisorId(adv.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    selectedAdvisorId === adv.id
                      ? 'bg-amber-600 text-white shadow-xs font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: adv.badgeColor || '#f59e0b' }}
                  />
                  <span>{adv.fullName.split(' ')[0]} {adv.fullName.split(' ')[1] || ''}</span>
                  <span className="text-[10px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Filtro de Estado */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Estado:</span>
            <select
              value={selectedStatus === 'TODOS' ? 'ALL' : selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">Todos los Estados</option>
              <option value="PROGRAMADA">PROGRAMADA</option>
              <option value="ATENDIDA">ATENDIDA</option>
              <option value="CANCELADA">CANCELADA</option>
            </select>
          </div>
        </div>

        {/* Buscador de texto */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por código (ADV-...), proyecto, curso, NRC, asesor o estudiante..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* LISTADO DE ASESORÍAS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-amber-500" />
            Asesorías Registradas ({filteredAdvisories.length})
          </h3>
          {filteredAdvisories.length !== advisories.length && (
            <button
              type="button"
              onClick={() => {
                setSelectedAdvisorId('ALL');
                setSelectedStatus('ALL');
                setSearchQuery('');
              }}
              className="text-xs text-amber-600 hover:underline font-medium cursor-pointer"
            >
              Restablecer filtros
            </button>
          )}
        </div>

        {filteredAdvisories.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center">
            <UserCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No se encontraron asesorías
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No hay asesorías que coincidan con los filtros seleccionados o aún no se han registrado solicitudes.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {filteredAdvisories.map((adv) => {
              const labInfo = LAB_MAP[adv.labId];
              const blocksText = adv.blockIds
                .map((b) => TIME_BLOCK_MAP[b]?.label || b)
                .join(', ');
              const isLoading = actionLoadingId === adv.id;
              const calendarUrl = buildGoogleCalendarUrl(buildAdvisoryCalendarDetails(adv));

              return (
                <div
                  key={adv.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 transition-all hover:border-slate-300 dark:hover:border-slate-700"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                        {adv.code}
                      </span>
                      <StatusBadge status={adv.status} size="sm" />
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {adv.date}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {blocksText}
                      </span>
                    </div>

                    {/* Botones de acción de estado */}
                    <div className="flex items-center gap-2 shrink-0">
                      {adv.status === 'PROGRAMADA' && (
                        <>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleUpdateStatus(adv.id, 'ATENDIDA')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Marcar Atendida
                          </button>
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => {
                              if (confirm(`¿Seguro que deseas cancelar la asesoría ${adv.code}?`)) {
                                handleUpdateStatus(adv.id, 'CANCELADA');
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors border border-rose-200 dark:border-rose-900/50 disabled:opacity-50 cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Cancelar
                          </button>
                        </>
                      )}
                      {adv.status !== 'PROGRAMADA' && (
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => handleUpdateStatus(adv.id, 'PROGRAMADA')}
                          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer"
                        >
                          Reabrir como Programada
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Cuerpo con detalles */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    {/* Columna 1: Proyecto y Curso */}
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <BookOpen className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white text-sm">
                            {adv.projectName}
                          </p>
                          <p className="text-slate-500">
                            Curso: <span className="font-semibold text-slate-700 dark:text-slate-300">{adv.course}</span> • NRC: <span className="font-mono font-semibold">{adv.nrc}</span>
                          </p>
                          {adv.topicNotes && (
                            <p className="mt-1 text-[11px] text-slate-500 italic bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                              "{adv.topicNotes}"
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Columna 2: Asesor y Laboratorio */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-sky-500 shrink-0" />
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            {adv.advisorName}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono">
                            {adv.advisorEmail}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>
                          {labInfo ? labInfo.name : adv.labId} • Res. vinculada:{' '}
                          <span className="font-mono font-semibold text-amber-600">
                            {adv.linkedReservationCode || 'N/A'}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Columna 3: Estudiantes e Integración Calendar */}
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <Users className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Estudiantes ({adv.students.length}):
                          </p>
                          <ul className="space-y-1 mt-1 text-[11px]">
                            {adv.students.map((st, idx) => (
                              <li key={idx} className="text-slate-600 dark:text-slate-400">
                                • <span className="font-medium text-slate-800 dark:text-slate-200">{st.fullName}</span> (
                                <span className="font-mono text-amber-700 dark:text-amber-400">{st.upnCode}</span>)
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Enlaces Google Calendar e ICS */}
                      <div className="pt-2 flex items-center gap-2.5 flex-wrap">
                        <a
                          href={calendarUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 hover:text-sky-700 hover:underline cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Ver en Google Calendar
                        </a>
                        {adv.icsDownloadUrl && (
                          <a
                            href={adv.icsDownloadUrl}
                            download={`asesoria-${adv.code}.ics`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 hover:underline cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            Descargar .ics
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={syncingId === adv.id}
                          onClick={() => handleSyncCalendar(adv, blocksText)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 hover:underline disabled:opacity-50 cursor-pointer"
                          title="Sincronizar horario exacto con el calendario externo"
                        >
                          <RefreshCw className={`w-3 h-3 ${syncingId === adv.id ? 'animate-spin' : ''}`} />
                          Sincronizar Calendario
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
