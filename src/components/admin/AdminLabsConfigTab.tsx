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
import { TIME_BLOCKS, DAYS_OF_WEEK, DEFAULT_TEACHERS_CATALOG } from '@/constants/schedule';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/shared/ToastProvider';
import {
  Settings,
  Calendar,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Users,
  Layers,
  Cpu,
  Wrench,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle,
  MousePointerClick,
  Sparkles,
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

  // Modo Selección Directa en Grilla para Bloquear
  const [isBlockSelectionMode, setIsBlockSelectionMode] = useState(false);
  const [selectedGridSlots, setSelectedGridSlots] = useState<Array<{ date: string; blockId: TimeBlockId }>>([]);
  const [gridBlockReason, setGridBlockReason] = useState('');
  const [savingGridBlocks, setSavingGridBlocks] = useState(false);

  // Catálogo de docentes con fallback al catálogo oficial
  const teachersList =
    dashboard.teachersCatalog && dashboard.teachersCatalog.length > 0
      ? dashboard.teachersCatalog
      : DEFAULT_TEACHERS_CATALOG;

  // Formulario de Nueva Clase
  const [newClassDay, setNewClassDay] = useState<DayOfWeek>(1);
  const [newClassBlock, setNewClassBlock] = useState<TimeBlockId>('B1');
  const [newClassCourse, setNewClassCourse] = useState('');
  const [newClassTeacher, setNewClassTeacher] = useState(DEFAULT_TEACHERS_CATALOG[0] || '');
  const [isCustomTeacher, setIsCustomTeacher] = useState(false);
  const [customTeacher, setCustomTeacher] = useState('');
  const [newClassNrc, setNewClassNrc] = useState('');
  const [savingClass, setSavingClass] = useState(false);

  // Formulario de Bloqueo de Horarios o Día Completo (Modal)
  const [blockDate, setBlockDate] = useState<string>('');
  const [selectedModalBlocks, setSelectedModalBlocks] = useState<TimeBlockId[]>(TIME_BLOCKS.map((t) => t.id));
  const [blockReason, setBlockReason] = useState<string>('');
  const [savingBlock, setSavingBlock] = useState(false);

  const selectedLab = dashboard.labs.find((l) => l.id === selectedLabId) || dashboard.labs[0];

  // Limpiar selección de bloques al cambiar laboratorio o semana
  useEffect(() => {
    setSelectedGridSlots([]);
  }, [selectedLabId, weekOffset]);

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

  const handleCloseClassModal = () => {
    setShowClassModal(false);
    setIsCustomTeacher(false);
    setCustomTeacher('');
  };

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
    const finalTeacher = isCustomTeacher
      ? customTeacher.trim()
      : (newClassTeacher.trim() || teachersList[0] || '');

    if (!newClassCourse.trim() || !finalTeacher || !newClassNrc.trim()) {
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
        teacherName: finalTeacher,
        nrc: newClassNrc.trim(),
      });
      showToast('Clase regular guardada exitosamente.', 'success');
      setShowClassModal(false);
      setNewClassCourse('');
      setNewClassTeacher(teachersList[0] || '');
      setIsCustomTeacher(false);
      setCustomTeacher('');
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

  // Abrir modal de bloqueo con preselección
  const handleOpenBlockModal = (defaultDate?: string, fullDay: boolean = true) => {
    const targetDate = defaultDate || blockDate || scheduleData?.days?.[0]?.date || '';
    setBlockDate(targetDate);
    if (fullDay) {
      setSelectedModalBlocks(TIME_BLOCKS.map((t) => t.id));
    }
    setShowBlockModal(true);
  };

  // Crear bloqueo de turnos o día completo desde el modal
  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockDate) {
      showToast('Selecciona una fecha para el bloqueo.', 'warning');
      return;
    }
    if (selectedModalBlocks.length === 0) {
      showToast('Selecciona al menos un bloque horario o el día completo.', 'warning');
      return;
    }
    if (!blockReason.trim()) {
      showToast('Ingresa el motivo del bloqueo.', 'warning');
      return;
    }

    try {
      setSavingBlock(true);
      const isFullDay = selectedModalBlocks.length === TIME_BLOCKS.length;
      await apiClient.createSlotBlock({
        targetType: 'LAB',
        targetId: selectedLabId,
        date: blockDate,
        blockIds: selectedModalBlocks,
        fullDay: isFullDay,
        reason: blockReason.trim(),
      });
      showToast(
        isFullDay
          ? `Día completo (${blockDate}) bloqueado exitosamente en ${selectedLab.shortName}.`
          : `${selectedModalBlocks.length} horario(s) bloqueado(s) exitosamente.`,
        'success'
      );
      setShowBlockModal(false);
      setBlockReason('');
      await onRefresh();
      await loadSchedule();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al bloquear turnos.';
      showToast(msg, 'error');
    } finally {
      setSavingBlock(false);
    }
  };

  // Confirmar bloqueos seleccionados directamente en la grilla
  const handleConfirmGridBlocks = async () => {
    if (selectedGridSlots.length === 0) {
      showToast('Selecciona al menos un bloque en la grilla para bloquear.', 'warning');
      return;
    }
    if (!gridBlockReason.trim()) {
      showToast('Ingresa el motivo del bloqueo.', 'warning');
      return;
    }

    try {
      setSavingGridBlocks(true);
      await apiClient.createSlotBlock({
        targetType: 'LAB',
        targetId: selectedLabId,
        slots: selectedGridSlots,
        reason: gridBlockReason.trim(),
      });
      showToast(
        `Se bloquearon exitosamente ${selectedGridSlots.length} horario(s) seleccionados.`,
        'success'
      );
      setSelectedGridSlots([]);
      setGridBlockReason('');
      setIsBlockSelectionMode(false);
      await onRefresh();
      await loadSchedule();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al bloquear horarios seleccionados.';
      showToast(msg, 'error');
    } finally {
      setSavingGridBlocks(false);
    }
  };

  // Seleccionar o deseleccionar todo un día en la grilla interactiva
  const handleToggleWholeDayInGrid = (dayDate: string) => {
    if (!scheduleData) return;
    const lockableDaySlots = scheduleData.slots.filter(
      (s) => s.date === dayDate && s.state !== 'BLOQUEADO'
    );
    if (lockableDaySlots.length === 0) {
      showToast('Todos los bloques de este día ya están bloqueados.', 'info');
      return;
    }

    const isDayFullySelected = lockableDaySlots.every((s) =>
      selectedGridSlots.some((sel) => sel.date === dayDate && sel.blockId === s.blockId)
    );

    if (isDayFullySelected) {
      // Quitar los bloques de este día
      setSelectedGridSlots((prev) => prev.filter((sel) => sel.date !== dayDate));
    } else {
      // Añadir todos los bloques bloqueables de este día
      setSelectedGridSlots((prev) => {
        const remaining = prev.filter((sel) => sel.date !== dayDate);
        const toAdd = lockableDaySlots.map((s) => ({ date: dayDate, blockId: s.blockId }));
        return [...remaining, ...toAdd];
      });
    }
  };

  // Seleccionar toda la semana disponible en la grilla interactiva
  const handleSelectEntireWeek = () => {
    if (!scheduleData) return;
    const availableSlots = scheduleData.slots
      .filter((s) => s.state !== 'BLOQUEADO')
      .map((s) => ({ date: s.date, blockId: s.blockId }));

    if (availableSlots.length === 0) {
      showToast('No hay turnos disponibles para seleccionar en esta semana.', 'info');
      return;
    }
    setSelectedGridSlots(availableSlots);
  };

  // Clic en celda de la grilla horaria
  const handleCellClick = (slot: ComputedLabSlot) => {
    if (isBlockSelectionMode) {
      if (slot.state === 'BLOQUEADO') {
        showToast('Este bloque ya está bloqueado. Desactiva el modo selección para ver detalles.', 'info');
        return;
      }
      setSelectedGridSlots((prev) => {
        const exists = prev.some((sel) => sel.date === slot.date && sel.blockId === slot.blockId);
        if (exists) {
          return prev.filter((sel) => !(sel.date === slot.date && sel.blockId === slot.blockId));
        } else {
          return [...prev, { date: slot.date, blockId: slot.blockId }];
        }
      });
    } else {
      setSelectedSlotDetails(slot);
    }
  };

  // Alternar selección de un bloque en el modal
  const toggleModalBlock = (blockId: TimeBlockId) => {
    setSelectedModalBlocks((prev) =>
      prev.includes(blockId) ? prev.filter((id) => id !== blockId) : [...prev, blockId]
    );
  };

  // Eliminar bloqueo de turno individual
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

  // Desbloquear día completo
  const handleUnlockWholeDay = async (date: string) => {
    if (!confirm(`¿Deseas desbloquear todos los turnos registrados para el día ${date}?`)) return;
    try {
      await apiClient.deleteSlotBlocksBulk({
        targetType: 'LAB',
        targetId: selectedLabId,
        date,
      });
      showToast(`Día ${date} desbloqueado exitosamente.`, 'success');
      await onRefresh();
      await loadSchedule();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al desbloquear el día.';
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

  // Agrupar bloqueos por fecha para visualización y acciones masivas
  const blocksByDate = labBlocks.reduce<Record<string, typeof labBlocks>>((acc, blk) => {
    if (!acc[blk.date]) acc[blk.date] = [];
    acc[blk.date].push(blk);
    return acc;
  }, {});
  const uniqueDatesWithBlocks = Object.keys(blocksByDate).sort();

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

          <div className="flex items-center gap-2.5 flex-wrap">
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
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              Programar Clase Regular
            </button>

            {/* Botón Principal: Seleccionar en Grilla para Bloquear */}
            <button
              type="button"
              onClick={() => {
                setIsBlockSelectionMode((prev) => !prev);
                if (isBlockSelectionMode) {
                  setSelectedGridSlots([]);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                isBlockSelectionMode
                  ? 'bg-rose-600 text-white shadow-rose-600/30 ring-2 ring-rose-400'
                  : 'bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-300 dark:border-rose-900 text-rose-700 dark:text-rose-300'
              }`}
            >
              <MousePointerClick className="w-4 h-4" />
              {isBlockSelectionMode ? 'Modo Selección Activo' : 'Seleccionar en Grilla para Bloquear'}
            </button>

            {/* Botón: Bloquear por Fecha / Día Completo (Modal) */}
            <button
              type="button"
              onClick={() => handleOpenBlockModal(undefined, true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors shadow-xs cursor-pointer"
            >
              <Lock className="w-4 h-4 text-rose-500" />
              Bloquear por Fecha / Día Completo
            </button>
          </div>
        </div>

        {/* BANNER INTERACTIVO DE MODO SELECCIÓN EN GRILLA */}
        {isBlockSelectionMode && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900/80 text-rose-950 dark:text-rose-100 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-rose-600 animate-pulse" />
                <h4 className="font-bold text-sm text-rose-950 dark:text-rose-200 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-rose-500" />
                  Modo Selección de Horarios Activo
                </h4>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-200 dark:bg-rose-900 font-bold text-rose-800 dark:text-rose-200">
                  {selectedGridSlots.length} seleccionado{selectedGridSlots.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed max-w-2xl">
                Haz clic en los bloques horarios que desees bloquear o usa el botón <strong>«+ Día completo»</strong> en la cabecera de cualquier día para seleccionarlo de golpe.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleSelectEntireWeek}
                  className="text-xs font-bold text-rose-700 dark:text-rose-300 hover:text-rose-900 underline cursor-pointer"
                >
                  Seleccionar toda la semana disponible
                </button>
                <span className="text-rose-300 dark:text-rose-700">•</span>
                <button
                  type="button"
                  onClick={() => setSelectedGridSlots([])}
                  className="text-xs font-semibold text-rose-700 dark:text-rose-300 hover:text-rose-900 underline cursor-pointer"
                >
                  Limpiar selección
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full xl:w-auto shrink-0">
              <input
                type="text"
                placeholder="Motivo del bloqueo (ej. Mantenimiento / Feriado)..."
                value={gridBlockReason}
                onChange={(e) => setGridBlockReason(e.target.value)}
                className="px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 w-full sm:w-72"
              />
              <button
                type="button"
                disabled={savingGridBlocks || selectedGridSlots.length === 0}
                onClick={handleConfirmGridBlocks}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                {savingGridBlocks
                  ? 'Bloqueando...'
                  : `Confirmar Bloqueo (${selectedGridSlots.length})`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsBlockSelectionMode(false);
                  setSelectedGridSlots([]);
                }}
                className="px-3 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Salir
              </button>
            </div>
          </div>
        )}

        {/* GRILLA INTERACTIVA 9 BLOQUES x 6 DÍAS */}
        {loadingSchedule ? (
          <div className="py-20 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400">Cargando disponibilidad del laboratorio...</p>
          </div>
        ) : scheduleData ? (
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[760px]">
              {/* Cabecera de días con botones de Día Completo */}
              <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">
                <div className="py-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex items-center justify-center">
                  Bloque Horario
                </div>
                {scheduleData.days.map((day) => {
                  const daySlots = scheduleData.slots.filter((s) => s.date === day.date);
                  const lockableSlots = daySlots.filter((s) => s.state !== 'BLOQUEADO');
                  const allBlocked = daySlots.length > 0 && daySlots.every((s) => s.state === 'BLOQUEADO');
                  const isDayFullySelected =
                    lockableSlots.length > 0 &&
                    lockableSlots.every((s) =>
                      selectedGridSlots.some((sel) => sel.date === day.date && sel.blockId === s.blockId)
                    );

                  return (
                    <div
                      key={day.date}
                      className="py-2 px-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex flex-col items-center justify-between gap-1.5"
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-slate-800 dark:text-slate-200 font-bold">{day.dayName}</span>
                        <span className="text-[10px] font-mono text-slate-400 font-normal">
                          {day.date.slice(5)}
                        </span>
                      </div>

                      {/* Botón Contextual de Día Completo */}
                      {isBlockSelectionMode ? (
                        <button
                          type="button"
                          onClick={() => handleToggleWholeDayInGrid(day.date)}
                          className={`w-full py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                            isDayFullySelected
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 hover:bg-rose-200'
                          }`}
                          title={isDayFullySelected ? 'Deseleccionar día en grilla' : 'Seleccionar día completo en grilla'}
                        >
                          {isDayFullySelected ? (
                            <>
                              <CheckCircle className="w-3 h-3" />
                              <span>✓ Seleccionado</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" />
                              <span>+ Día completo</span>
                            </>
                          )}
                        </button>
                      ) : allBlocked ? (
                        <button
                          type="button"
                          onClick={() => handleUnlockWholeDay(day.date)}
                          className="w-full py-1 px-1.5 rounded-lg text-[10px] font-bold bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 transition-all cursor-pointer flex items-center justify-center gap-1"
                          title="Desbloquear todos los turnos de este día"
                        >
                          <Unlock className="w-3 h-3 text-amber-600" />
                          <span>Desbloquear</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenBlockModal(day.date, true)}
                          className="w-full py-1 px-1.5 rounded-lg text-[10px] font-semibold bg-white dark:bg-slate-700/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-600 dark:text-slate-300 hover:text-rose-600 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer flex items-center justify-center gap-1"
                          title="Bloquear este día completo"
                        >
                          <Lock className="w-3 h-3 text-rose-500" />
                          <span>Bloquear día</span>
                        </button>
                      )}
                    </div>
                  );
                })}
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

                      // Estado de Selección en Grilla
                      const isSelectedInGrid = selectedGridSlots.some(
                        (sel) => sel.date === day.date && sel.blockId === tb.id
                      );

                      if (isSelectedInGrid) {
                        return (
                          <div
                            key={day.date}
                            onClick={() => handleCellClick(slot)}
                            className="p-2 rounded-xl border-2 border-rose-600 ring-2 ring-rose-500/40 bg-rose-100/90 dark:bg-rose-950/80 text-rose-950 dark:text-rose-100 cursor-pointer shadow-md transition-all flex flex-col justify-between"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-300 flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                                A Bloquear
                              </span>
                              <span className="text-[10px] font-mono font-bold text-rose-600">✓</span>
                            </div>
                            <p className="text-[11px] font-bold text-rose-900 dark:text-rose-200 truncate mt-1">
                              Seleccionado
                            </p>
                            <span className="text-[10px] text-rose-700 dark:text-rose-400">
                              Clic para quitar
                            </span>
                          </div>
                        );
                      }

                      // Render según estado del bloque
                      if (slot.state === 'CLASE') {
                        return (
                          <div
                            key={day.date}
                            onClick={() => handleCellClick(slot)}
                            className={`p-2 rounded-xl border text-purple-900 dark:text-purple-200 cursor-pointer hover:shadow-xs transition-all flex flex-col justify-between ${
                              isBlockSelectionMode
                                ? 'bg-purple-50/70 dark:bg-purple-950/30 border-dashed border-rose-300 dark:border-rose-800 hover:ring-2 hover:ring-rose-400'
                                : 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900/60'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                                Clase
                              </span>
                              {isBlockSelectionMode && (
                                <span className="text-[9px] text-rose-600 font-bold bg-rose-100 dark:bg-rose-950 px-1 rounded">
                                  + Bloquear
                                </span>
                              )}
                            </div>
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
                            onClick={() => handleCellClick(slot)}
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
                          onClick={() => handleCellClick(slot)}
                          className={`p-2 rounded-xl border cursor-pointer hover:shadow-xs transition-all flex flex-col justify-between ${
                            isBlockSelectionMode
                              ? 'hover:ring-2 hover:ring-rose-400 hover:border-rose-400 ' +
                                (hasBookings
                                  ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200'
                                  : 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/70')
                              : hasBookings
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
                            {isBlockSelectionMode && (
                              <span className="text-[9px] text-rose-600 font-bold bg-rose-50 dark:bg-rose-950 px-1 rounded border border-rose-200">
                                + Bloquear
                              </span>
                            )}
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
              className="text-xs text-amber-600 font-semibold hover:underline cursor-pointer"
            >
              + Agregar
            </button>
          </div>

          <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
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
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
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

        {/* Bloqueos por Fecha Activos (Agrupados por Fecha con opción de Desbloquear Día Completo) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-rose-500" />
              Bloqueos de Turno por Fecha ({labBlocks.length})
            </h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsBlockSelectionMode(true)}
                className="text-xs text-rose-600 dark:text-rose-400 font-semibold hover:underline cursor-pointer"
              >
                Seleccionar en grilla
              </button>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <button
                type="button"
                onClick={() => handleOpenBlockModal(undefined, true)}
                className="text-xs text-amber-600 font-semibold hover:underline cursor-pointer"
              >
                + Bloquear
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-3 max-h-72 overflow-y-auto pr-1">
            {uniqueDatesWithBlocks.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                No hay bloqueos extraordinarios registrados para este laboratorio.
              </p>
            ) : (
              uniqueDatesWithBlocks.map((date) => {
                const dateBlocks = blocksByDate[date];
                const isFullDay = dateBlocks.length >= TIME_BLOCKS.length;
                return (
                  <div
                    key={date}
                    className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between border-b border-rose-200/60 dark:border-rose-900/40 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-rose-900 dark:text-rose-200">
                          {date}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-200/80 dark:bg-rose-900 text-rose-800 dark:text-rose-200">
                          {isFullDay ? 'Día Completo (9 turnos)' : `${dateBlocks.length} turno(s)`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnlockWholeDay(date)}
                        className="text-[11px] font-bold text-rose-700 dark:text-rose-300 hover:text-rose-900 hover:underline flex items-center gap-1 cursor-pointer"
                        title={`Desbloquear todos los turnos del día ${date}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        Desbloquear día ({date})
                      </button>
                    </div>

                    {/* Desglose de bloques individuales de esta fecha */}
                    <div className="space-y-1.5">
                      {dateBlocks.map((blk) => (
                        <div
                          key={blk.id}
                          className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-rose-100 dark:border-rose-950 text-xs"
                        >
                          <div className="truncate pr-2">
                            <span className="font-bold text-rose-800 dark:text-rose-300 mr-2">
                              {blk.blockId}
                            </span>
                            <span className="text-slate-600 dark:text-slate-300 truncate">
                              {blk.reason}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteBlock(blk.id)}
                            className="p-1 text-rose-400 hover:text-rose-700 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded transition-colors cursor-pointer shrink-0"
                            title="Eliminar este bloqueo individual"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
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
                onClick={handleCloseClassModal}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
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
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-amber-500 cursor-pointer"
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
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-amber-500 cursor-pointer"
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
                {!isCustomTeacher ? (
                  <select
                    value={newClassTeacher || teachersList[0] || ''}
                    onChange={(e) => {
                      if (e.target.value === '__OTHER__') {
                        setIsCustomTeacher(true);
                      } else {
                        setNewClassTeacher(e.target.value);
                      }
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    {teachersList.map((t, idx) => (
                      <option key={idx} value={t}>
                        {t}
                      </option>
                    ))}
                    <option value="__OTHER__">+ Escribir otro docente...</option>
                  </select>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      required
                      placeholder="Nombre del Docente"
                      value={customTeacher}
                      onChange={(e) => setCustomTeacher(e.target.value)}
                      className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setIsCustomTeacher(false)}
                      className="px-2.5 py-2 text-[11px] font-semibold bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                    >
                      Lista
                    </button>
                  </div>
                )}
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
                  onClick={handleCloseClassModal}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingClass}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {savingClass ? 'Guardando...' : 'Guardar Clase Regular'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MEJORADO: BLOQUEAR HORARIOS O DÍA COMPLETO */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Lock className="w-5 h-5 text-rose-500" />
                  Bloquear Horarios o Día Completo ({selectedLab.shortName})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Selecciona la fecha y marca los horarios que deseas bloquear para reservas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBlockModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBlock} className="mt-4 space-y-4">
              {/* Selector de Fecha con píldoras de acceso rápido */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Fecha del Bloqueo (YYYY-MM-DD)
                </label>
                <input
                  type="date"
                  required
                  value={blockDate}
                  onChange={(e) => setBlockDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500"
                />

                {scheduleData?.days && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[10px] text-slate-400 font-medium mr-0.5">
                      Semana visible:
                    </span>
                    {scheduleData.days.map((d) => (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => setBlockDate(d.date)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                          blockDate === d.date
                            ? 'bg-rose-600 text-white font-bold shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {d.dayName} {d.date.slice(5)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selector Multi-Bloque y Botones Rápidos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    Horarios a Bloquear ({selectedModalBlocks.length} de {TIME_BLOCKS.length})
                  </label>
                  {selectedModalBlocks.length === TIME_BLOCKS.length && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Día Completo Seleccionado
                    </span>
                  )}
                </div>

                {/* Acciones Rápidas */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedModalBlocks(TIME_BLOCKS.map((t) => t.id))}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      selectedModalBlocks.length === TIME_BLOCKS.length
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    Día Completo (B1 - B9)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedModalBlocks(['B1', 'B2', 'B3', 'B4'])}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
                  >
                    Mañana (B1 - B4)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedModalBlocks(['B5', 'B6', 'B7', 'B8', 'B9'])}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
                  >
                    Tarde/Noche (B5 - B9)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedModalBlocks([])}
                    className="px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer ml-auto"
                  >
                    Limpiar
                  </button>
                </div>

                {/* Cuadrícula interactiva de 9 bloques en 3 columnas */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {TIME_BLOCKS.map((tb) => {
                    const isSelected = selectedModalBlocks.includes(tb.id);
                    return (
                      <button
                        key={tb.id}
                        type="button"
                        onClick={() => toggleModalBlock(tb.id)}
                        className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-950 dark:text-rose-100 ring-2 ring-rose-500/30'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs">{tb.id}</span>
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold ${
                              isSelected
                                ? 'bg-rose-600 text-white'
                                : 'border border-slate-300 dark:border-slate-600 text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono leading-tight">
                          {tb.startTime} - {tb.endTime}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Motivo del Bloqueo */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Motivo del Bloqueo
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. Mantenimiento preventivo, Feriado o Examen Parcial"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingBlock || selectedModalBlocks.length === 0}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {savingBlock
                    ? 'Bloqueando...'
                    : selectedModalBlocks.length === TIME_BLOCKS.length
                    ? 'Confirmar Bloqueo (Día Completo)'
                    : `Confirmar Bloqueo (${selectedModalBlocks.length} horarios)`}
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
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
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
                  <div className="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t border-rose-200 dark:border-rose-900/60">
                    {selectedSlotDetails.blockRecordId && (
                      <button
                        type="button"
                        onClick={() => {
                          handleDeleteBlock(selectedSlotDetails.blockRecordId!);
                          setSelectedSlotDetails(null);
                        }}
                        className="text-rose-600 underline font-semibold cursor-pointer text-xs"
                      >
                        Desbloquear este turno ahora
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        handleUnlockWholeDay(selectedSlotDetails.date);
                        setSelectedSlotDetails(null);
                      }}
                      className="text-rose-700 dark:text-rose-300 hover:underline font-semibold text-xs cursor-pointer"
                    >
                      Desbloquear todo el día ({selectedSlotDetails.date})
                    </button>
                  </div>
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
                          className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer"
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
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-200 cursor-pointer"
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
