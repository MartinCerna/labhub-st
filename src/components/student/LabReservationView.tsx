'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  CalendarPlus,
  Printer,
  Sparkles,
  Zap,
  Cpu,
  Bot,
  MapPin,
  Info,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  LabId,
  LaboratoryConfig,
  TimeBlockId,
  ComputedLabSlot,
  LabWeeklyScheduleResponse,
  StudentParticipant,
  CreateLabReservationPayload,
  LabReservation,
} from '@/types/labhub';
import {
  DEFAULT_LABORATORIES,
  TIME_BLOCKS,
  UPN_CAREERS,
  TIME_BLOCK_MAP,
} from '@/constants/schedule';
import { useToast } from '@/components/shared/ToastProvider';
import { StatusBadge } from '@/components/shared/StatusBadge';

interface LabReservationViewProps {
  initialLabId?: LabId;
}

export function LabReservationView({ initialLabId = 'automatizacion' }: LabReservationViewProps) {
  const { showToast } = useToast();

  // Estados de catálogo y laboratorio seleccionado
  const [labs, setLabs] = useState<LaboratoryConfig[]>(DEFAULT_LABORATORIES);
  const [selectedLabId, setSelectedLabId] = useState<LabId>(initialLabId);

  // Navegación semanal (0 = semana actual, 1 = semana siguiente; máx 2 semanas)
  const [weekOffset, setWeekOffset] = useState<0 | 1>(0);

  // Horario semanal cargado
  const [scheduleData, setScheduleData] = useState<LabWeeklyScheduleResponse | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState<boolean>(true);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Selección de bloques del estudiante
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<TimeBlockId[]>([]);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);

  // Datos del formulario
  const [leadStudent, setLeadStudent] = useState<StudentParticipant>({
    fullName: '',
    upnCode: '',
  });
  const [participants, setParticipants] = useState<StudentParticipant[]>([]);
  const [projectName, setProjectName] = useState<string>('');
  const [career, setCareer] = useState<string>(UPN_CAREERS[0] || 'Ingeniería Mecatrónica');
  const [course, setCourse] = useState<string>('');
  const [nrc, setNrc] = useState<string>('');

  // Estado de envío y comprobante de reserva creada
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [createdReservation, setCreatedReservation] = useState<LabReservation | null>(null);

  // Carga inicial de catálogo de laboratorios
  useEffect(() => {
    apiClient
      .getCatalog()
      .then((cat) => {
        if (cat.labs && cat.labs.length > 0) {
          setLabs(cat.labs);
        }
      })
      .catch((err) => {
        console.warn('Catálogo fallback de labs:', err);
      });
  }, []);

  // Carga de la grilla de disponibilidad para el lab y semana seleccionados
  const fetchSchedule = useCallback(() => {
    setLoadingSchedule(true);
    apiClient
      .getLabSchedule(selectedLabId, weekOffset)
      .then((data) => {
        setScheduleData(data);
      })
      .catch((err) => {
        console.error('Error al cargar horario del laboratorio:', err);
        showToast('No se pudo cargar la disponibilidad del laboratorio.', 'error');
      })
      .finally(() => {
        setLoadingSchedule(false);
      });
  }, [selectedLabId, weekOffset, showToast]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule, refreshKey]);

  // Laboratorio activo en la interfaz
  const currentLab = useMemo(() => {
    return labs.find((l) => l.id === selectedLabId) || labs[0] || DEFAULT_LABORATORIES[0];
  }, [labs, selectedLabId]);

  // Mapa rápido de slots por clave: `${date}_${blockId}`
  const slotsMap = useMemo(() => {
    const map = new Map<string, ComputedLabSlot>();
    if (scheduleData && scheduleData.slots) {
      scheduleData.slots.forEach((slot) => {
        map.set(`${slot.date}_${slot.blockId}`, slot);
      });
    }
    return map;
  }, [scheduleData]);

  // Manejo de clic en un bloque
  const handleSlotClick = (date: string, blockId: TimeBlockId, state: ComputedLabSlot['state']) => {
    if (state !== 'DISPONIBLE') {
      if (state === 'CLASE') {
        showToast('Este bloque horario está reservado para una clase lectiva regular.', 'warning');
      } else if (state === 'BLOQUEADO') {
        showToast('Este turno se encuentra reservado por mantenimiento o evento.', 'warning');
      } else if (state === 'COMPLETO') {
        showToast('Agotado: Se alcanzó el límite máximo de grupos simultáneos.', 'warning');
      } else if (state === 'PASADO') {
        showToast('Este horario ya ha concluido.', 'info');
      }
      return;
    }

    // Si ya había una fecha seleccionada distinta a la actual, reiniciamos la selección a la nueva fecha
    if (selectedDate && selectedDate !== date) {
      setSelectedDate(date);
      setSelectedBlockIds([blockId]);
      setIsFormOpen(true);
      return;
    }

    // Misma fecha o primera selección
    setSelectedDate(date);
    setSelectedBlockIds((prev) => {
      const exists = prev.includes(blockId);
      const updated = exists ? prev.filter((id) => id !== blockId) : [...prev, blockId];
      if (updated.length === 0) {
        setIsFormOpen(false);
        setSelectedDate(null);
      } else {
        setIsFormOpen(true);
      }
      return updated;
    });
  };

  // Participantes adicionales dinámicos
  const handleAddParticipant = () => {
    setParticipants((prev) => [...prev, { fullName: '', upnCode: '' }]);
  };

  const handleUpdateParticipant = (index: number, field: keyof StudentParticipant, value: string) => {
    setParticipants((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveParticipant = (index: number) => {
    setParticipants((prev) => prev.filter((_, i) => i !== index));
  };

  // Envío del formulario
  const handleSubmitReservation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDate || selectedBlockIds.length === 0) {
      showToast('Por favor, selecciona al menos un bloque horario disponible.', 'warning');
      return;
    }

    if (!leadStudent.fullName.trim() || !leadStudent.upnCode.trim()) {
      showToast('Completa los nombres y código UPN del estudiante principal.', 'warning');
      return;
    }

    if (!projectName.trim() || !course.trim() || !nrc.trim()) {
      showToast('Completa el proyecto, curso y NRC.', 'warning');
      return;
    }

    // Validar participantes adicionales si los hay
    for (let i = 0; i < participants.length; i++) {
      if (!participants[i].fullName.trim() || !participants[i].upnCode.trim()) {
        showToast(`Completa los datos del participante #${i + 2} o elimínalo.`, 'warning');
        return;
      }
    }

    const payload: CreateLabReservationPayload = {
      labId: selectedLabId,
      date: selectedDate,
      blockIds: selectedBlockIds,
      leadStudent: {
        fullName: leadStudent.fullName.trim(),
        upnCode: leadStudent.upnCode.trim().toUpperCase(),
      },
      participants: participants.map((p) => ({
        fullName: p.fullName.trim(),
        upnCode: p.upnCode.trim().toUpperCase(),
      })),
      projectName: projectName.trim(),
      career,
      course: course.trim(),
      nrc: nrc.trim(),
    };

    setSubmitting(true);
    try {
      const res = await apiClient.createLabReservation(payload);
      setCreatedReservation(res.reservation);
      showToast(`¡Reserva ${res.reservation.code} creada con éxito!`, 'success');
      // Limpiar selección de bloques
      setSelectedBlockIds([]);
      setSelectedDate(null);
      setIsFormOpen(false);
      // Refrescar grilla
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al procesar la reserva';
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getLabIcon = (labId: LabId) => {
    switch (labId) {
      case 'automatizacion':
        return <Zap className="w-5 h-5 text-amber-500" />;
      case 'electronica':
        return <Cpu className="w-5 h-5 text-sky-500" />;
      case 'mecatronica':
      default:
        return <Bot className="w-5 h-5 text-emerald-500" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* ===================================================================== */}
      {/* ENCABEZADO Y SELECTOR DE LABORATORIOS                                 */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold mb-2">
              <Calendar className="w-3.5 h-3.5 text-amber-600" />
              <span>Reserva de Turnos</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Reserva de Laboratorio Especializado
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Selecciona el laboratorio, navega en las 2 semanas disponibles y escoge los bloques para tu equipo de trabajo.
            </p>
          </div>
        </div>

        {/* Tarjetas rápidas de los 3 Laboratorios */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {labs.map((lab) => {
            const isSelected = selectedLabId === lab.id;
            return (
              <button
                key={lab.id}
                type="button"
                onClick={() => {
                  setSelectedLabId(lab.id);
                  setSelectedBlockIds([]);
                  setSelectedDate(null);
                  setIsFormOpen(false);
                }}
                className={`text-left p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                  isSelected
                    ? 'border-amber-500 bg-amber-50/40 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-2xs shrink-0">
                  {getLabIcon(lab.id)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {lab.shortName}
                    </span>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {lab.location}
                  </p>
                  <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-semibold text-slate-700">
                    <Users className="w-3 h-3 text-slate-500" />
                    <span>Capacidad: {lab.maxSimultaneousGroups} grupos simultáneos</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* BARRA DE NAVEGACIÓN SEMANAL (MÁXIMO 2 SEMANAS: 0 Y 1)                 */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">
                {weekOffset === 0 ? 'Semana 1 de 2 (Actual)' : 'Semana 2 de 2 (Siguiente)'}
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {scheduleData ? `${scheduleData.weekStartDate} al ${scheduleData.weekEndDate}` : 'Cargando fechas...'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Rango máximo permitido de 2 semanas para planificación estudiantil.
            </p>
          </div>
        </div>

        {/* Controles Flecha Izquierda / Derecha */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={weekOffset === 0}
            onClick={() => {
              setWeekOffset(0);
              setSelectedBlockIds([]);
              setSelectedDate(null);
              setIsFormOpen(false);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
              weekOffset === 0
                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 cursor-pointer shadow-2xs'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Semana Anterior</span>
          </button>

          <button
            type="button"
            disabled={weekOffset === 1}
            onClick={() => {
              setWeekOffset(1);
              setSelectedBlockIds([]);
              setSelectedDate(null);
              setIsFormOpen(false);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
              weekOffset === 1
                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 cursor-pointer shadow-2xs'
            }`}
          >
            <span>Siguiente Semana</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="Refrescar disponibilidad en vivo"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-4 h-4 ${loadingSchedule ? 'animate-spin text-amber-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* GRILLA SEMANAL DE LOS 9 BLOQUES HORARIOS                              */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Leyenda explicativa de estados */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-bold text-slate-700">Leyenda de Estados de Bloque:</span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
              <span>Disponible (con cupos)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300" />
              <span>Clase Lectiva Regular</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded bg-slate-200 border border-slate-300" />
              <span>Bloqueado / Evento</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded bg-orange-100 border border-orange-300" />
              <span>Agotado (0 cupos)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded bg-amber-400 border border-amber-600" />
              <span className="font-semibold text-slate-800">Seleccionado por ti</span>
            </span>
          </div>
        </div>

        {/* Tabla Responsiva con Scroll Horizontal */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[840px] text-left">
            <thead>
              <tr className="bg-slate-900 text-white text-xs">
                <th className="py-3 px-3 font-semibold uppercase tracking-wider w-36 border-r border-slate-800">
                  Bloque Horario
                </th>
                {scheduleData?.days.map((day) => (
                  <th key={day.date} className="py-3 px-3 font-semibold border-r border-slate-800 last:border-r-0 text-center">
                    <div className="text-amber-400 uppercase tracking-wider text-[11px] font-bold">
                      {day.dayName}
                    </div>
                    <div className="text-white text-xs font-medium">
                      {day.date.split('-').reverse().slice(0, 2).join('/')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {TIME_BLOCKS.map((tb) => (
                <tr key={tb.id} className="hover:bg-slate-50/50 transition-colors">
                  {/* Celda del Bloque Horario */}
                  <td className="py-3 px-3 bg-slate-50 font-medium text-slate-700 border-r border-slate-200 align-middle">
                    <div className="font-bold text-slate-900">{tb.id}</div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">{tb.label}</div>
                  </td>

                  {/* Celdas para cada uno de los 6 días (Lunes a Sábado) */}
                  {scheduleData?.days.map((day) => {
                    const slotKey = `${day.date}_${tb.id}`;
                    const slot = slotsMap.get(slotKey);
                    const state = slot ? slot.state : 'PASADO';
                    const isSelected = selectedDate === day.date && selectedBlockIds.includes(tb.id);
                    const isAvailable = state === 'DISPONIBLE';

                    return (
                      <td
                        key={slotKey}
                        onClick={() => handleSlotClick(day.date, tb.id, state)}
                        className={`p-2 border-r border-slate-200 last:border-r-0 transition-all align-top ${
                          isSelected
                            ? 'bg-amber-100/90 ring-2 ring-inset ring-amber-500 shadow-inner'
                            : isAvailable
                            ? 'hover:bg-emerald-50/80 cursor-pointer'
                            : 'cursor-not-allowed'
                        }`}
                      >
                        {isSelected ? (
                          <div className="p-2 rounded-lg bg-amber-500 text-slate-950 font-bold flex flex-col items-center justify-center gap-1 shadow-xs">
                            <div className="flex items-center gap-1 text-[11px]">
                              <Check className="w-3.5 h-3.5" />
                              <span>Elegido</span>
                            </div>
                            <span className="text-[10px] font-medium opacity-90">
                              {slot?.availableGroups} libres
                            </span>
                          </div>
                        ) : state === 'DISPONIBLE' ? (
                          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 hover:border-emerald-400 text-emerald-800 transition-colors">
                            <div className="flex items-center justify-between font-bold text-[11px]">
                              <span>Disponible</span>
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            </div>
                            <div className="text-[10px] text-emerald-700 font-medium mt-1">
                              {slot?.availableGroups} de {slot?.maxGroups} grupos libres
                            </div>
                          </div>
                        ) : state === 'CLASE' ? (
                          <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
                            <div className="font-bold text-[10px] truncate uppercase tracking-tight">
                              {slot?.classInfo?.courseName || 'Clase Lectiva'}
                            </div>
                            <div className="text-[10px] text-blue-700 truncate mt-0.5">
                              {slot?.classInfo?.teacherName || 'Docente UPN'}
                            </div>
                            {slot?.classInfo?.nrc && (
                              <div className="text-[9px] font-mono text-blue-600 mt-0.5">
                                NRC: {slot.classInfo.nrc}
                              </div>
                            )}
                          </div>
                        ) : state === 'BLOQUEADO' ? (
                          <div className="p-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-600">
                            <div className="font-semibold text-[10px] text-slate-700 truncate">
                              Bloqueado
                            </div>
                            <div className="text-[9px] text-slate-500 truncate mt-0.5">
                              {slot?.blockReason || 'Mantenimiento / Evento'}
                            </div>
                          </div>
                        ) : state === 'COMPLETO' ? (
                          <div className="p-2 rounded-lg bg-orange-50 border border-orange-200 text-orange-800">
                            <div className="font-bold text-[10px]">Agotado</div>
                            <div className="text-[9px] text-orange-700 mt-0.5">
                              0/{slot?.maxGroups} cupos libres
                            </div>
                          </div>
                        ) : (
                          <div className="p-2 rounded-lg bg-slate-50 text-slate-400 text-center">
                            <span className="text-[10px]">Pasado</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* PANEL FLOTANTE / FORMULARIO DE RESERVA DE TURNOS                      */}
      {/* ===================================================================== */}
      {isFormOpen && selectedDate && selectedBlockIds.length > 0 && (
        <div className="bg-white rounded-3xl border-2 border-amber-500 p-6 sm:p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4 transition-all">
          <div className="flex items-start justify-between pb-6 border-b border-slate-200">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold mb-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Paso 2 • Confirmación de Datos del Grupo</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                Formulario de Reserva — {currentLab.shortName}
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Fecha seleccionada: <strong>{selectedDate}</strong> • Bloques horarios:{' '}
                <strong className="text-amber-600">
                  {selectedBlockIds
                    .sort()
                    .map((id) => `${id} (${TIME_BLOCK_MAP[id]?.startTime || ''})`)
                    .join(', ')}
                </strong>
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setSelectedBlockIds([]);
                setSelectedDate(null);
              }}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              title="Cancelar selección"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmitReservation} className="mt-6 space-y-6">
            {/* Datos Académicos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nombre del Proyecto <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Ej. Brazo SCARA con PLC"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Carrera Profesional <span className="text-rose-500">*</span>
                </label>
                <select
                  value={career}
                  onChange={(e) => setCareer(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                >
                  {UPN_CAREERS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Curso <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  placeholder="Ej. Automatización Industrial"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  NRC <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nrc}
                  onChange={(e) => setNrc(e.target.value)}
                  placeholder="Ej. 4589"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Estudiante Principal (Líder del Grupo) */}
            <div className="bg-slate-50/80 rounded-2xl p-4 sm:p-5 border border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Estudiante Responsable (Líder del Turno)
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Nombres y Apellidos Completos <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={leadStudent.fullName}
                    onChange={(e) =>
                      setLeadStudent((prev) => ({ ...prev, fullName: e.target.value }))
                    }
                    placeholder="Ej. Martín Sánchez Vega"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Código UPN <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={leadStudent.upnCode}
                    onChange={(e) =>
                      setLeadStudent((prev) => ({
                        ...prev,
                        upnCode: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="Ej. N00123456"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Integrantes Adicionales */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Participantes Adicionales del Grupo ({participants.length})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Opcional: puedes sumar a tus compañeros de equipo de laboratorio.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddParticipant}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir participante</span>
                </button>
              </div>

              {participants.length > 0 && (
                <div className="space-y-2.5">
                  {participants.map((p, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row items-center gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200"
                    >
                      <span className="text-xs font-bold text-slate-400 w-6 text-center">
                        #{idx + 2}
                      </span>
                      <input
                        type="text"
                        required
                        value={p.fullName}
                        onChange={(e) =>
                          handleUpdateParticipant(idx, 'fullName', e.target.value)
                        }
                        placeholder="Nombres y Apellidos del compañero"
                        className="flex-1 w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                      <input
                        type="text"
                        required
                        value={p.upnCode}
                        onChange={(e) =>
                          handleUpdateParticipant(idx, 'upnCode', e.target.value.toUpperCase())
                        }
                        placeholder="Código UPN (N00...)"
                        className="w-full sm:w-40 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveParticipant(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Eliminar participante"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Botones de Acción */}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setSelectedBlockIds([]);
                  setSelectedDate(null);
                }}
                className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Confirmando reserva...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar y Generar Reserva</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL / COMPROBANTE DE RESERVA CREADA EXITOSAMENTE                    */}
      {/* ===================================================================== */}
      {createdReservation && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-6">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-extrabold text-slate-900">
                ¡Reserva de Laboratorio Confirmada!
              </h3>
              <p className="text-xs text-slate-500">
                Tu cupo ha sido asegurado en el laboratorio correspondiente. Conserva el código para el ingreso.
              </p>
            </div>

            {/* Ficha resumen */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500">Código de Reserva:</span>
                <span className="font-mono font-extrabold text-sm text-amber-600">
                  {createdReservation.code}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Laboratorio:</span>
                <span className="font-bold text-slate-900">
                  {currentLab.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Fecha del Turno:</span>
                <span className="font-semibold text-slate-900">
                  {createdReservation.date}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Bloques Seleccionados:</span>
                <span className="font-mono text-slate-800">
                  {createdReservation.blockIds.join(', ')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Estudiante Responsable:</span>
                <span className="font-semibold text-slate-900">
                  {createdReservation.leadStudent.fullName} ({createdReservation.leadStudent.upnCode})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Proyecto:</span>
                <span className="text-slate-800">{createdReservation.projectName}</span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-500">Estado:</span>
                <StatusBadge status={createdReservation.status} size="sm" />
              </div>
            </div>

            {/* Acciones */}
            <div className="space-y-2.5">
              {createdReservation.calendarEventUrl && (
                <a
                  href={createdReservation.calendarEventUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
                >
                  <CalendarPlus className="w-4 h-4 text-amber-400" />
                  <span>Añadir a mi Google Calendar</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => setCreatedReservation(null)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cerrar comprobante
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
