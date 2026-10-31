'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  AdminDashboardSummary,
  LabId,
  LaboratoryConfig,
  LabWeeklyScheduleResponse,
  TimeBlockId,
  DayOfWeek,
  ComputedLabSlot,
} from '@/types/labhub';
import { TIME_BLOCKS, DAYS_OF_WEEK } from '@/constants/schedule';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/shared/ToastProvider';
import {
  Settings,
  Calendar,
  Lock,
  Plus,
  Trash2,
  Users,
  AlertTriangle,
  Layers,
  Cpu,
  Wrench,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle,
} from 'lucide-react';

interface AdminLabsConfigTabProps {
  dashboard: AdminDashboardSummary;
  onRefresh: () => Promise<void>;
}

export function AdminLabsConfigTab({ dashboard, onRefresh }: AdminLabsConfigTabProps) {
  const { showToast } = useToast();

  const [selectedLabId, setSelectedLabId] = useState<LabId>('automatizacion');
  const [weekOffset, setWeekOffset] = useState<0 | 1>(0);
  const [scheduleData, setScheduleData] = useState<LabWeeklyScheduleResponse | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  // Estados de edición de capacidad
  const [customCapacity, setCustomCapacity] = useState<number>(4);
  const [savingCapacity, setSavingCapacity] = useState(false);

  // Modales
  const [showClassModal, setShowClassModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [selectedSlotDetails, setSelectedSlotDetails] = useState<ComputedLabSlot | null>(null);

  // Formulario de Nueva Clase
  const [newClassDay, setNewClassDay] = useState<DayOfWeek>(1);
  const [newClassBlock, setNewClassBlock] = useState<TimeBlockId>('B1');
  const [newClassCourse, setNewClassCourse] = useState('');
  const [newClassTeacher, setNewClassTeacher] = useState('');
  const [newClassNrc, setNewClassNrc] = useState('');
  const [savingClass, setSavingClass] = useState(false);

  // Formulario de Bloqueo de Turno
  const [blockDate, setBlockDate] = useState<string>('');
  const [blockTimeBlock, setBlockTimeBlock] = useState<TimeBlockId>('B1');
  const [blockReason, setBlockReason] = useState<string>('');
  const [savingBlock, setSavingBlock] = useState(false);

  const selectedLab = dashboard.labs.find((l) => l.id === selectedLabId) || dashboard.labs[0];

  // Sincronizar capacidad local con el laboratorio seleccionado
  useEffect(() => {
    if (selectedLab) {
      setCustomCapacity(selectedLab.maxSimultaneousGroups);
    }
  }, [selectedLabId, selectedLab]);

  // Cargar horario semanal del laboratorio
  const loadSchedule = useCallback(async () => {
    try {
      setLoadingSchedule(true);
      const res = await apiClient.getLabSchedule(selectedLabId, weekOffset);
      setScheduleData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar el horario del laboratorio.';
      showToast(msg, 'error');
    } finally {
      setLoadingSchedule(false);
    }
  }, [selectedLabId, weekOffset, showToast]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // Guardar nueva capacidad máxima de grupos
  const handleSaveCapacity = async () => {
    if (customCapacity < 1 || customCapacity > 20) {
      showToast('La capacidad debe estar entre 1 y 20 grupos.', 'warning');
      return;
    }
    try {
      setSavingCapacity(true);
      await apiClient.updateLabConfig(selectedLabId, {
        maxSimultaneousGroups: Number(customCapacity),
      });
      showToast(
        `Capacidad de ${selectedLab.name} actualizada a ${customCapacity} grupos simultáneos.`,
        'success'
      );
      await onRefresh();
      await loadSchedule();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar capacidad.';
      showToast(msg, 'error');
    } finally {
      setSavingCapacity(false);
    }
  };

  // Crear clase regular
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassCourse.trim() || !newClassTeacher.trim() || !newClassNrc.trim()) {
      showToast('Por favor completa todos los campos de la clase.', 'warning');
      return;
    }

    try {
      setSavingClass(true);
      await apiClient.saveRecurringClass({
        labId: selectedLabId,
        dayOfWeek: newClassDay,
        blockId: newClassBlock,
        courseName: newClassCourse.trim(),
        teacherName: newClassTeacher.trim(),
        nrc: newClassNrc.trim(),
      });
      showToast('Clase regular guardada exitosamente.', 'success');
      setShowClassModal(false);
      setNewClassCourse('');
      setNewClassTeacher('');
      setNewClassNrc('');
      await onRefresh();
      await loadSchedule();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar la clase regular.';
      showToast(msg, 'error');
    } finally {
      setSavingClass(false);
    }
  };

  // Eliminar clase regular
  const handleDeleteClass = async (id: string) => {
    if (!confirm('¿Deseas eliminar esta clase regular? El turno volverá a estar disponible para reservas.')) {
      return;
    }
    try {
      await apiClient.deleteRecurringClass(id);
      showToast('Clase regular eliminada.', 'success');
      await onRefresh();
      await loadSchedule();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar clase regular.';
      showToast(msg, 'error');
    }
  };

  // Crear bloqueo de turno
  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockDate || !blockReason.trim()) {
      showToast('Ingresa la fecha y el motivo del bloqueo.', 'warning');
      return;
    }

    try {
      setSavingBlock(true);
      await apiClient.createSlotBlock({
        targetType: 'LAB',
        targetId: selectedLabId,
        date: blockDate,
        blockId: blockTimeBlock,
        reason: blockReason.trim(),
      });
      showToast('Turno bloqueado exitosamente.', 'success');
      setShowBlockModal(false);
      setBlockReason('');
      await onRefresh();
      await loadSchedule();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al bloquear turno.';
      showToast(msg, 'error');
    } finally {
      setSavingBlock(false);
    }
  };

  // Eliminar bloqueo de turno
  const handleDeleteBlock = async (id: string) => {
    if (!confirm('¿Deseas desbloquear este turno?')) return;
    try {
      await apiClient.deleteSlotBlock(id);
      showToast('Bloqueo eliminado exitosamente.', 'success');
      await onRefresh();
      await loadSchedule();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al desbloquear turno.';
      showToast(msg, 'error');
    }
  };

  // Cancelar reserva de estudiante
  const handleCancelReservation = async (reservationId: string) => {
    if (!confirm('¿Deseas cancelar esta reserva registrada por el estudiante?')) return;
    try {
      await apiClient.cancelReservation(reservationId);
      showToast('Reserva cancelada exitosamente.', 'success');
      setSelectedSlotDetails(null);
      await onRefresh();
      await loadSchedule();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cancelar la reserva.';
      showToast(msg, 'error');
    }
  };

  // Clases y bloqueos filtrados por el laboratorio activo
  const labClasses = dashboard.recurringClasses.filter((c) => c.labId === selectedLabId);
  const labBlocks = dashboard.slotBlocks.filter(
    (b) => b.targetType === 'LAB' && b.targetId === selectedLabId
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* SELECTOR DE LABORATORIO */}
      <div className="flex flex-wrap items-center gap-3">
        {dashboard.labs.map((lab) => {
          const isSelected = lab.id === selectedLabId;
          const getIcon = () => {
            if (lab.id === 'automatizacion') return <Layers className="w-4 h-4" />;
            if (lab.id === 'electronica') return <Cpu className="w-4 h-4" />;
            return <Wrench className="w-4 h-4" />;
          };
          return (
            <button
              key={lab.id}
              type="button"
              onClick={() => setSelectedLabId(lab.id)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                isSelected
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              {getIcon()}
              <span>{lab.name}</span>
            </button>
          );
        })}
      </div>

      {/* PANEL 1: CONFIGURACIÓN DE CAPACIDAD SIMULTÁNEA */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Capacidad Máxima de Grupos Simultáneos ({selectedLab.shortName})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Define cuántos grupos de estudiantes pueden reservar y trabajar al mismo tiempo en este laboratorio durante un mismo bloque horario. Por ejemplo: <strong>4 grupos</strong> en Automatización y Mecatrónica, o <strong>6 grupos</strong> en Electrónica.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <Users className="w-4 h-4 text-slate-400" />
              <input
                type="number"
                min={1}
                max={20}
                value={customCapacity}
                onChange={(e) => setCustomCapacity(Number(e.target.value))}
                className="w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 text-sm font-bold text-slate-900 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <span className="text-xs text-slate-500 font-medium pr-1">grupos / bloque</span>
            </div>
            <button
              type="button"
              disabled={savingCapacity || customCapacity === selectedLab.maxSimultaneousGroups}
              onClick={handleSaveCapacity}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {savingCapacity ? 'Guardando...' : 'Actualizar Capacidad'}
            </button>
          </div>
        </div>
      </div>

      {/* PANEL 2: GESTOR DEL HORARIO SEMANAL */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6">
        {/* Cabecera del Gestor con Navegación de Semanas y Acciones */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-500" />
              Grilla Semanal y Estado de Cupos
            </h3>
            {scheduleData && (
              <p className="text-xs text-slate-500 mt-0.5">
                Semana {weekOffset === 0 ? 'Actual' : 'Siguiente'} • Del{' '}
                <strong className="text-slate-700 dark:text-slate-300">
                  {scheduleData.weekStartDate}
                </strong>{' '}
                al{' '}
                <strong className="text-slate-700 dark:text-slate-300">
                  {scheduleData.weekEndDate}
                </strong>
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Selector de Semana */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium">
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  weekOffset === 0
                    ? 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-400 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Semana 1 (Actual)
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset(1)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  weekOffset === 1
                    ? 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-400 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Semana 2 (Siguiente)
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Botón Programar Clase */}
            <button
              type="button"
              onClick={() => setShowClassModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              Programar Clase Regular
            </button>

            {/* Botón Bloquear Turno */}
            <button
              type="button"
              onClick={() => setShowBlockModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 border border-rose-200 dark:border-rose-900/50 transition-colors shadow-xs cursor-pointer"
            >
              <Lock className="w-4 h-4 text-rose-500" />
              Bloquear Turno por Fecha
            </button>
          </div>
        </div>

        {/* GRILLA INTERACTIVA 9 BLOQUES x 6 DÍAS */}
        {loadingSchedule ? (
          <div className="py-20 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400">Cargando disponibilidad del laboratorio...</p>
          </div>
        ) : scheduleData ? (
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[760px]">
              {/* Cabecera de días */}
              <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">
                <div className="py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">Bloque Horario</div>
                {scheduleData.days.map((day) => (
                  <div
                    key={day.date}
                    className="py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg flex flex-col items-center"
                  >
                    <span className="text-slate-800 dark:text-slate-200">{day.dayName}</span>
                    <span className="text-[10px] font-mono text-slate-400 font-normal">
                      {day.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Filas por Bloque */}
              <div className="space-y-2">
                {TIME_BLOCKS.map((tb) => (
                  <div key={tb.id} className="grid grid-cols-7 gap-2">
                    {/* Columna Bloque */}
                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex flex-col justify-center items-center text-center">
                      <span className="font-bold text-xs">{tb.id}</span>
                      <span className="text-[10px] text-slate-500 font-mono leading-tight">
                        {tb.label}
                      </span>
                    </div>

                    {/* 6 Columnas de Días */}
                    {scheduleData.days.map((day) => {
                      const slot = scheduleData.slots.find(
                        (s) => s.date === day.date && s.blockId === tb.id
                      );

                      if (!slot) {
                        return (
                          <div
                            key={day.date}
                            className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-center"
                          >
                            -
                          </div>
                        );
                      }

                      // Render según estado del bloque
                      if (slot.state === 'CLASE') {
                        return (
                          <div
                            key={day.date}
                            onClick={() => setSelectedSlotDetails(slot)}
                            className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60 text-purple-900 dark:text-purple-200 cursor-pointer hover:shadow-xs transition-all flex flex-col justify-between"
                          >
                            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                              Clase
                            </span>
                            <p className="text-[11px] font-semibold truncate leading-tight mt-1">
                              {slot.classInfo?.courseName || 'Clase Regular'}
                            </p>
                            <p className="text-[10px] text-purple-700/80 dark:text-purple-300/80 truncate">
                              NRC: {slot.classInfo?.nrc}
                            </p>
                          </div>
                        );
                      }

                      if (slot.state === 'BLOQUEADO') {
                        return (
                          <div
                            key={day.date}
                            onClick={() => setSelectedSlotDetails(slot)}
                            className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200 cursor-pointer hover:shadow-xs transition-all flex flex-col justify-between"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                <Lock className="w-3 h-3" />
                                Bloqueado
                              </span>
                            </div>
                            <p className="text-[10px] text-rose-700 dark:text-rose-300 truncate mt-1">
                              {slot.blockReason || 'Mantenimiento'}
                            </p>
                          </div>
                        );
                      }

                      const hasBookings = slot.occupiedGroups > 0;
                      return (
                        <div
                          key={day.date}
                          onClick={() => setSelectedSlotDetails(slot)}
                          className={`p-2 rounded-xl border cursor-pointer hover:shadow-xs transition-all flex flex-col justify-between ${
                            hasBookings
                              ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200'
                              : 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/70 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider ${
                                hasBookings
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {slot.availableGroups} / {slot.maxGroups} libres
                            </span>
                          </div>

                          <div className="mt-1 flex items-center gap-1">
                            <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  hasBookings ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{
                                  width: `${(slot.occupiedGroups / slot.maxGroups) * 100}%`,
                                }}
                              />
                            </div>
                          </div>

                          <span className="text-[10px] text-slate-500 mt-1 truncate">
                            {hasBookings
                              ? `${slot.occupiedGroups} grupo${slot.occupiedGroups > 1 ? 's' : ''}`
                              : 'Disponible'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* PANEL 3: LISTADO DE CLASES REGULARES Y BLOQUEOS ACTIVOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Clases Regulares Activas */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-purple-500" />
              Clases Semanales del Laboratorio ({labClasses.length})
            </h4>
            <button
              type="button"
              onClick={() => setShowClassModal(true)}
              className="text-xs text-amber-600 font-semibold hover:underline"
            >
              + Agregar
            </button>
          </div>

          <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
            {labClasses.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                No hay clases regulares registradas para este laboratorio.
              </p>
            ) : (
              labClasses.map((cls) => {
                const dayName = DAYS_OF_WEEK.find((d) => d.id === cls.dayOfWeek)?.name || 'Día';
                return (
                  <div
                    key={cls.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {cls.courseName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {dayName} • Bloque {cls.blockId} • Docente: {cls.teacherName} (NRC {cls.nrc})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteClass(cls.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Eliminar clase regular"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Bloqueos por Fecha Activos */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-rose-500" />
              Bloqueos de Turno por Fecha ({labBlocks.length})
            </h4>
            <button
              type="button"
              onClick={() => setShowBlockModal(true)}
              className="text-xs text-amber-600 font-semibold hover:underline"
            >
              + Bloquear
            </button>
          </div>

          <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
            {labBlocks.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                No hay bloqueos extraordinarios registrados para este laboratorio.
              </p>
            ) : (
              labBlocks.map((blk) => (
                <div
                  key={blk.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs"
                >
                  <div>
                    <p className="font-semibold text-rose-900 dark:text-rose-200">
                      {blk.reason}
                    </p>
                    <p className="text-[11px] text-rose-700 dark:text-rose-400">
                      Fecha: {blk.date} • Bloque {blk.blockId}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteBlock(blk.id)}
                    className="p-1.5 text-rose-400 hover:text-rose-700 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                    title="Eliminar bloqueo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* MODAL: PROGRAMAR CLASE REGULAR */}
      {showClassModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-500" />
                Programar Clase Regular ({selectedLab.shortName})
              </h3>
              <button
                type="button"
                onClick={() => setShowClassModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClass} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Día de la semana
                  </label>
                  <select
                    value={newClassDay}
                    onChange={(e) => setNewClassDay(Number(e.target.value) as DayOfWeek)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-amber-500"
                  >
                    {DAYS_OF_WEEK.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Bloque Horario
                  </label>
                  <select
                    value={newClassBlock}
                    onChange={(e) => setNewClassBlock(e.target.value as TimeBlockId)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-amber-500"
                  >
                    {TIME_BLOCKS.map((tb) => (
                      <option key={tb.id} value={tb.id}>
                        {tb.id} ({tb.startTime} - {tb.endTime})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Nombre del Curso
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. Controladores Lógicos Programables"
                  value={newClassCourse}
                  onChange={(e) => setNewClassCourse(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Docente a Cargo
                </label>
                <input
                  type="text"
                  required
                  list="teachers-list"
                  placeholder="ej. Ing. Carlos Mendoza Ríos"
                  value={newClassTeacher}
                  onChange={(e) => setNewClassTeacher(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                />
                <datalist id="teachers-list">
                  {dashboard.teachersCatalog.map((t, idx) => (
                    <option key={idx} value={t} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  NRC de la Clase
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. 4521"
                  value={newClassNrc}
                  onChange={(e) => setNewClassNrc(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowClassModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingClass}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {savingClass ? 'Guardando...' : 'Guardar Clase Regular'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: BLOQUEAR TURNO */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-rose-500" />
                Bloquear Turno por Fecha ({selectedLab.shortName})
              </h3>
              <button
                type="button"
                onClick={() => setShowBlockModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBlock} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Fecha del Bloqueo (YYYY-MM-DD)
                </label>
                <input
                  type="date"
                  required
                  value={blockDate}
                  onChange={(e) => setBlockDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Bloque Horario
                </label>
                <select
                  value={blockTimeBlock}
                  onChange={(e) => setBlockTimeBlock(e.target.value as TimeBlockId)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-amber-500"
                >
                  {TIME_BLOCKS.map((tb) => (
                    <option key={tb.id} value={tb.id}>
                      {tb.id} ({tb.startTime} - {tb.endTime})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Motivo del Bloqueo
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. Mantenimiento preventivo Festo o Examen Parcial"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingBlock}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {savingBlock ? 'Bloqueando...' : 'Confirmar Bloqueo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETALLES DE CELDA / RESERVAS REGISTRADAS */}
      {selectedSlotDetails && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Detalles del Turno: {selectedSlotDetails.date} ({selectedSlotDetails.blockId})
                </h3>
                <p className="text-xs text-slate-500">
                  Laboratorio: {selectedLab.name} • Estado:{' '}
                  <span className="font-bold text-amber-600">{selectedSlotDetails.state}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSlotDetails(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {selectedSlotDetails.state === 'CLASE' && (
                <div className="p-3 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-900 text-xs">
                  <p className="font-bold text-purple-900 dark:text-purple-200">
                    Clase Regular Asignada:
                  </p>
                  <p className="text-purple-800 dark:text-purple-300 mt-1">
                    Curso: {selectedSlotDetails.classInfo?.courseName}
                  </p>
                  <p className="text-purple-800 dark:text-purple-300">
                    Docente: {selectedSlotDetails.classInfo?.teacherName} (NRC: {selectedSlotDetails.classInfo?.nrc})
                  </p>
                </div>
              )}

              {selectedSlotDetails.state === 'BLOQUEADO' && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900 text-xs">
                  <p className="font-bold text-rose-900 dark:text-rose-200">
                    Motivo del Bloqueo:
                  </p>
                  <p className="text-rose-800 dark:text-rose-300 mt-1">
                    {selectedSlotDetails.blockReason}
                  </p>
                  {selectedSlotDetails.blockRecordId && (
                    <button
                      type="button"
                      onClick={() => {
                        handleDeleteBlock(selectedSlotDetails.blockRecordId!);
                        setSelectedSlotDetails(null);
                      }}
                      className="mt-2 text-rose-600 underline font-semibold cursor-pointer"
                    >
                      Desbloquear este turno ahora
                    </button>
                  )}
                </div>
              )}

              {/* Lista de Reservas de Estudiantes en este bloque */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Grupos Registrados ({selectedSlotDetails.bookings?.length || 0} / {selectedSlotDetails.maxGroups}):
                </h4>

                {!selectedSlotDetails.bookings || selectedSlotDetails.bookings.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                    No hay reservas de grupos para este turno.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {selectedSlotDetails.bookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-amber-600">
                              {booking.code}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              {booking.origin}
                            </span>
                          </div>
                          <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                            {booking.projectName}
                          </p>
                          <p className="text-slate-500 text-[11px]">
                            Líder: {booking.leadName} ({booking.upnCode})
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCancelReservation(booking.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg hover:bg-rose-100 transition-colors"
                        >
                          Cancelar Reserva
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedSlotDetails(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
