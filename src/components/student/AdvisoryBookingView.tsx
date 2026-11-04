'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Users,
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar,
  CheckCircle2,
  CalendarPlus,
  Download,
  AlertCircle,
  Plus,
  Trash2,
  Sparkles,
  Mail,
  GraduationCap,
  MapPin,
  Check,
  X,
  RefreshCw,
  Info,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  AdvisorProfile,
  TimeBlockId,
  AdvisorSlotState,
  ComputedAdvisorSlot,
  AdvisorWeeklyScheduleResponse,
  StudentParticipant,
  CreateAdvisoryPayload,
  AdvisoryRequest,
  LabReservation,
} from '@/types/labhub';
import { TIME_BLOCKS, TIME_BLOCK_MAP, LAB_MAP } from '@/constants/schedule';
import { useToast } from '@/components/shared/ToastProvider';
import { StatusBadge } from '@/components/shared/StatusBadge';

export function AdvisoryBookingView() {
  const { showToast } = useToast();

  // Asesores
  const [advisors, setAdvisors] = useState<AdvisorProfile[]>([]);
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>('adv-1');

  // Navegación semanal (0 o 1)
  const [weekOffset, setWeekOffset] = useState<0 | 1>(0);

  // Estado del horario del asesor
  const [scheduleData, setScheduleData] = useState<AdvisorWeeklyScheduleResponse | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState<boolean>(true);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Selección de bloques para asesoría
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<TimeBlockId[]>([]);
  const [selectedSlotLabId, setSelectedSlotLabId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);

  // Datos del formulario de asesoría
  const [projectName, setProjectName] = useState<string>('');
  const [course, setCourse] = useState<string>('');
  const [nrc, setNrc] = useState<string>('');
  const [topicNotes, setTopicNotes] = useState<string>('');
  // De base 1 estudiante, y botón "+ Añadir estudiante"
  const [students, setStudents] = useState<StudentParticipant[]>([
    { fullName: '', upnCode: '' },
  ]);

  // Estado de envío y comprobante
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [createdAdvisory, setCreatedAdvisory] = useState<{
    advisory: AdvisoryRequest;
    reservation: LabReservation;
  } | null>(null);

  // Carga inicial del catálogo de asesores
  useEffect(() => {
    apiClient
      .getCatalog()
      .then((cat) => {
        if (cat.advisors && cat.advisors.length > 0) {
          setAdvisors(cat.advisors);
          if (!selectedAdvisorId) {
            setSelectedAdvisorId(cat.advisors[0].id);
          }
        }
      })
      .catch((err) => {
        console.warn('Error al cargar catálogo de asesores:', err);
      });
  }, [selectedAdvisorId]);

  // Carga del horario semanal del asesor seleccionado
  const fetchAdvisorSchedule = useCallback(() => {
    if (!selectedAdvisorId) return;
    setLoadingSchedule(true);
    apiClient
      .getAdvisorSchedule(selectedAdvisorId, weekOffset)
      .then((data) => {
        setScheduleData(data);
        if (data.allAdvisors && data.allAdvisors.length > 0) {
          setAdvisors(data.allAdvisors);
        }
      })
      .catch((err) => {
        console.error('Error al cargar agenda del asesor:', err);
        showToast('No se pudo cargar la agenda del asesor seleccionado.', 'error');
      })
      .finally(() => {
        setLoadingSchedule(false);
      });
  }, [selectedAdvisorId, weekOffset, showToast]);

  useEffect(() => {
    fetchAdvisorSchedule();
  }, [fetchAdvisorSchedule, refreshKey]);

  // Asesor activo
  const currentAdvisor = useMemo(() => {
    return (
      scheduleData?.advisor ||
      advisors.find((a) => a.id === selectedAdvisorId) ||
      advisors[0]
    );
  }, [scheduleData, advisors, selectedAdvisorId]);

  // Mapa rápido de slots del asesor
  const slotsMap = useMemo(() => {
    const map = new Map<string, ComputedAdvisorSlot>();
    if (scheduleData && scheduleData.slots) {
      scheduleData.slots.forEach((s) => {
        map.set(`${s.date}_${s.blockId}`, s);
      });
    }
    return map;
  }, [scheduleData]);

  // Manejo de clic en un bloque
  const handleSlotClick = (date: string, blockId: TimeBlockId, slot?: ComputedAdvisorSlot) => {
    if (!slot || slot.state !== 'DISPONIBLE') {
      if (slot?.state === 'NO_ATIENDE') {
        showToast('El asesor no tiene programada atención en este bloque horario.', 'info');
      } else if (slot?.state === 'OCUPADO') {
        showToast('Este turno ya ha sido reservado para otra asesoría.', 'warning');
      } else if (slot?.state === 'BLOQUEADO') {
        showToast('El turno está bloqueado por motivos institucionales o reunión.', 'warning');
      } else if (slot?.state === 'LAB_SIN_CUPO') {
        showToast('El laboratorio asignado para esta asesoría no cuenta con cupos libres en este horario.', 'warning');
      }
      return;
    }

    // Si cambia de fecha o laboratorio de atención, reiniciamos a la nueva selección
    if ((selectedDate && selectedDate !== date) || (selectedSlotLabId && selectedSlotLabId !== slot.labId)) {
      setSelectedDate(date);
      setSelectedBlockIds([blockId]);
      setSelectedSlotLabId(slot.labId || null);
      setIsFormOpen(true);
      return;
    }

    setSelectedDate(date);
    setSelectedSlotLabId(slot.labId || null);
    setSelectedBlockIds((prev) => {
      const exists = prev.includes(blockId);
      const updated = exists ? prev.filter((id) => id !== blockId) : [...prev, blockId];
      if (updated.length === 0) {
        setIsFormOpen(false);
        setSelectedDate(null);
        setSelectedSlotLabId(null);
      } else {
        setIsFormOpen(true);
      }
      return updated;
    });
  };

  // Manejo de la lista dinámica de estudiantes
  const handleAddStudent = () => {
    setStudents((prev) => [...prev, { fullName: '', upnCode: '' }]);
  };

  const handleUpdateStudent = (index: number, field: keyof StudentParticipant, value: string) => {
    setStudents((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveStudent = (index: number) => {
    if (students.length <= 1) {
      showToast('Debe haber al menos 1 estudiante solicitante.', 'info');
      return;
    }
    setStudents((prev) => prev.filter((_, i) => i !== index));
  };

  // Envío de asesoría
  const handleSubmitAdvisory = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDate || selectedBlockIds.length === 0) {
      showToast('Selecciona al menos un turno disponible en el calendario.', 'warning');
      return;
    }

    if (!projectName.trim() || !course.trim() || !nrc.trim()) {
      showToast('Por favor, completa el nombre del proyecto, curso y NRC.', 'warning');
      return;
    }

    // Validar estudiantes
    for (let i = 0; i < students.length; i++) {
      if (!students[i].fullName.trim() || !students[i].upnCode.trim()) {
        showToast(`Completa los nombres y código UPN del estudiante #${i + 1}.`, 'warning');
        return;
      }
    }

    const payload: CreateAdvisoryPayload = {
      advisorId: selectedAdvisorId,
      date: selectedDate,
      blockIds: selectedBlockIds,
      projectName: projectName.trim(),
      course: course.trim(),
      nrc: nrc.trim(),
      topicNotes: topicNotes.trim() || undefined,
      students: students.map((s) => ({
        fullName: s.fullName.trim(),
        upnCode: s.upnCode.trim().toUpperCase(),
      })),
    };

    setSubmitting(true);
    try {
      const res = await apiClient.createAdvisory(payload);
      setCreatedAdvisory({ advisory: res.advisory, reservation: res.reservation });
      showToast(`¡Asesoría ${res.advisory.code} agendada con éxito!`, 'success');
      // Limpiar selección
      setSelectedBlockIds([]);
      setSelectedDate(null);
      setSelectedSlotLabId(null);
      setIsFormOpen(false);
      // Refrescar grilla
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al agendar la asesoría';
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* ===================================================================== */}
      {/* ENCABEZADO Y SELECTOR VISUAL DE LOS 4 ASESORES                        */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200 text-xs font-semibold mb-2">
            <Users className="w-3.5 h-3.5 text-sky-600" />
            <span>Módulo 2 • Asesorías Técnicas Especializadas</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Solicitar Asesoría con Asistente o Docente
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl">
            Selecciona al asesor técnico especializado. La asesoría reservará automáticamente 1 cupo en el laboratorio asignado y enviará la invitación a su Google Calendar.
          </p>
        </div>

        {/* Tarjetas de los Asesores */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {advisors.map((adv) => {
            const isSelected = selectedAdvisorId === adv.id;
            return (
              <button
                key={adv.id}
                type="button"
                onClick={() => {
                  setSelectedAdvisorId(adv.id);
                  setSelectedBlockIds([]);
                  setSelectedDate(null);
                  setSelectedSlotLabId(null);
                  setIsFormOpen(false);
                }}
                className={`text-left p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50/50 shadow-sm ring-2 ring-sky-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="space-y-3">
                  {/* Fila superior: Avatar + Estado Activo */}
                  <div className="flex items-center justify-between">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm text-white shadow-xs"
                      style={{ backgroundColor: adv.badgeColor || '#0284c7' }}
                    >
                      {adv.avatarInitials}
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500 text-white">
                        Activo
                      </span>
                    )}
                  </div>

                  {/* Nombre y Cargo */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug">
                      {adv.fullName}
                    </h3>
                    <span className="text-[11px] font-semibold text-slate-500 block mt-0.5">
                      {adv.roleTitle}
                    </span>

                    {/* Insignia de Carrera Profesional */}
                    {adv.career && (
                      <div className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/80">
                        <GraduationCap className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>{adv.career}</span>
                      </div>
                    )}
                  </div>

                  {/* Especialidad Principal */}
                  <div className="text-xs text-slate-600">
                    <p className="line-clamp-2">
                      <strong className="text-slate-700 font-semibold">Especialidad: </strong>
                      {adv.specialty}
                    </p>
                  </div>

                  {/* Temas de Asesoría */}
                  {adv.advisoryTopics && adv.advisoryTopics.length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        Temas de asesoría:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {adv.advisoryTopics.map((topic, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200/60"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer: Correo Electrónico */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate font-mono">{adv.email}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* BARRA DE NAVEGACIÓN SEMANAL (0 O 1)                                   */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">
                Agenda de {currentAdvisor?.fullName || 'Asesor'}
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {weekOffset === 0 ? 'Semana 1 de 2' : 'Semana 2 de 2'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {scheduleData ? `${scheduleData.weekStartDate} al ${scheduleData.weekEndDate}` : 'Cargando fechas...'}
            </p>
          </div>
        </div>

        {/* Flechas izquierda y derecha */}
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
            title="Refrescar agenda"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-4 h-4 ${loadingSchedule ? 'animate-spin text-sky-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* GRILLA SEMANAL DE LOS 9 BLOQUES                                       */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Leyenda */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-bold text-slate-700">Disponibilidad del Asesor:</span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
              <span>Disponible en Laboratorio</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
              <span>Turno Ocupado</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300" />
              <span>Lab sin cupo</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded bg-slate-200 border border-slate-300" />
              <span>No atiende / Bloqueado</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded bg-sky-500 border border-sky-600" />
              <span className="font-semibold text-slate-800">Seleccionado por ti</span>
            </span>
          </div>
        </div>

        {/* Tabla Responsiva y Compacta (Lunes a Sábado visible sin scroll forzado) */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse table-fixed text-left min-w-[700px] sm:min-w-full">
            <thead>
              <tr className="bg-slate-900 text-white text-xs">
                <th className="py-2.5 px-1.5 sm:px-2 font-semibold uppercase tracking-wider w-[12%] sm:w-[10%] border-r border-slate-800 text-center">
                  <span className="text-[10px] sm:text-xs">Bloque</span>
                </th>
                {scheduleData?.days.map((day) => (
                  <th key={day.date} className="py-2.5 px-1 sm:px-1.5 font-semibold border-r border-slate-800 last:border-r-0 text-center w-[14.66%] sm:w-[15%]">
                    <div className="text-sky-400 uppercase tracking-wider text-[10px] sm:text-[11px] font-extrabold truncate">
                      {day.dayName}
                    </div>
                    <div className="text-white text-[9.5px] sm:text-[11px] font-medium">
                      {day.date.split('-').reverse().slice(0, 2).join('/')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {TIME_BLOCKS.map((tb) => (
                <tr key={tb.id} className="hover:bg-slate-50/50 transition-colors">
                  {/* Celda del Bloque */}
                  <td className="py-2 px-1 sm:px-1.5 bg-slate-50/90 font-medium text-slate-700 border-r border-slate-200 text-center align-middle">
                    <div className="font-extrabold text-xs sm:text-sm text-slate-900 leading-tight">{tb.id}</div>
                    <div className="text-[8.5px] sm:text-[9.5px] text-slate-500 font-mono leading-tight mt-0.5 whitespace-nowrap">{tb.label}</div>
                  </td>

                  {/* Celdas de Días */}
                  {scheduleData?.days.map((day) => {
                    const slotKey = `${day.date}_${tb.id}`;
                    const slot = slotsMap.get(slotKey);
                    const state = slot ? slot.state : 'NO_ATIENDE';
                    const isSelected = selectedDate === day.date && selectedBlockIds.includes(tb.id);
                    const isAvailable = state === 'DISPONIBLE';

                    return (
                      <td
                        key={slotKey}
                        onClick={() => handleSlotClick(day.date, tb.id, slot)}
                        className={`p-1 sm:p-1.5 border-r border-slate-200 last:border-r-0 transition-all align-top ${
                          isSelected
                            ? 'bg-sky-100 ring-2 ring-inset ring-sky-500 shadow-inner'
                            : isAvailable
                            ? 'hover:bg-emerald-50/80 cursor-pointer'
                            : 'cursor-not-allowed'
                        }`}
                      >
                        {isSelected ? (
                          <div className="p-1 sm:p-1.5 rounded-lg bg-sky-500 text-white font-bold flex flex-col items-center justify-center gap-0.5 shadow-xs h-full min-h-[46px]">
                            <div className="flex items-center gap-1 text-[9.5px] sm:text-[10px]">
                              <Check className="w-3 h-3" />
                              <span>Elegido</span>
                            </div>
                            <span className="text-[8px] sm:text-[8.5px] font-medium opacity-95 truncate max-w-full">
                              {slot?.labName || 'Laboratorio'}
                            </span>
                          </div>
                        ) : state === 'DISPONIBLE' ? (
                          <div className="p-1 sm:p-1.5 rounded-lg bg-emerald-50/90 border border-emerald-200 hover:border-emerald-400 text-emerald-800 transition-colors h-full min-h-[46px] flex flex-col justify-between">
                            <div className="flex items-center justify-between font-bold text-[9.5px] sm:text-[10.5px] leading-tight">
                              <span className="truncate">Disponible</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 ml-1" />
                            </div>
                            <div className="text-[8.5px] sm:text-[9.5px] text-emerald-700 font-semibold mt-1 truncate">
                              • {slot?.labName}
                            </div>
                          </div>
                        ) : state === 'OCUPADO' ? (
                          <div className="p-1 sm:p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 h-full min-h-[46px] flex flex-col justify-between">
                            <div className="font-bold text-[8.5px] sm:text-[9.5px]">Ocupado</div>
                            <div className="text-[8px] sm:text-[8.5px] text-amber-700 truncate mt-0.5" title={slot?.advisoryBooking?.projectName}>
                              {slot?.advisoryBooking?.projectName || 'Asesoría Agendada'}
                            </div>
                          </div>
                        ) : state === 'LAB_SIN_CUPO' ? (
                          <div className="p-1 sm:p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 h-full min-h-[46px] flex flex-col justify-between">
                            <div className="font-bold text-[8.5px] sm:text-[9.5px]">Sin Cupo</div>
                            <div className="text-[8px] sm:text-[8.5px] text-rose-700 truncate mt-0.5">
                              {slot?.labName}
                            </div>
                          </div>
                        ) : state === 'BLOQUEADO' ? (
                          <div className="p-1 sm:p-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 h-full min-h-[46px] flex items-center justify-center">
                            <span className="text-[8.5px] sm:text-[9px] font-medium">Bloqueado</span>
                          </div>
                        ) : (
                          <div className="py-2.5 px-1 rounded-lg bg-slate-50 text-slate-400 text-center h-full min-h-[46px] flex items-center justify-center">
                            <span className="text-[8.5px] sm:text-[9.5px]">No atiende</span>
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
      {/* FORMULARIO DE ASESORÍA CON AVISO DE VINCULACIÓN                       */}
      {/* ===================================================================== */}
      {isFormOpen && selectedDate && selectedBlockIds.length > 0 && (
        <div className="bg-white rounded-3xl border-2 border-sky-500 p-6 sm:p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4 transition-all">
          <div className="flex items-start justify-between pb-6 border-b border-slate-200">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100 text-sky-900 text-xs font-bold mb-2">
                <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                <span>Paso 2 • Agendar Asesoría Técnica</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                Detalles de Asesoría — {currentAdvisor?.fullName}
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Fecha: <strong>{selectedDate}</strong> • Bloques:{' '}
                <strong className="text-sky-600">
                  {selectedBlockIds.sort().join(', ')}
                </strong>{' '}
                • Laboratorio asignado:{' '}
                <strong className="text-slate-800">
                  {selectedSlotLabId && LAB_MAP[selectedSlotLabId as keyof typeof LAB_MAP]?.name || 'Laboratorio UPN'}
                </strong>
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setSelectedBlockIds([]);
                setSelectedDate(null);
                setSelectedSlotLabId(null);
              }}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Aviso informativo de doble impacto (Asesoría + Cupo en Lab) */}
          <div className="mt-6 p-4 rounded-2xl bg-sky-50 border border-sky-200 flex items-start gap-3">
            <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
            <div className="text-xs text-sky-900 leading-relaxed">
              <strong>Importante:</strong> Al confirmar esta asesoría, el sistema registrará de forma automática un cupo de reserva a tu nombre en el laboratorio asignado (<strong>{selectedSlotLabId && LAB_MAP[selectedSlotLabId as keyof typeof LAB_MAP]?.name}</strong>) y enviará una invitación oficial al Google Calendar del asesor y de tu equipo.
            </div>
          </div>

          <form onSubmit={handleSubmitAdvisory} className="mt-6 space-y-6">
            {/* Campos de Proyecto */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nombre del Proyecto <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Ej. Diseño de Celda de Clasificación"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
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
                  placeholder="Ej. Robótica Industrial"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
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
                  placeholder="Ej. 1823"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Notas opcionales de consulta */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Temas o Dudas Específicas a Tratar en la Asesoría (Opcional)
              </label>
              <textarea
                rows={2}
                value={topicNotes}
                onChange={(e) => setTopicNotes(e.target.value)}
                placeholder="Ej. Revisión del diagrama de escalera PLC y sincronización del servomotor Festo..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>

            {/* Sección de Estudiantes (De base 1, con botón '+ Añadir estudiante') */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-sky-600" />
                    <span>Estudiantes Participantes ({students.length})</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Ingresa a los integrantes que asistirán a la sesión técnica.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddStudent}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir estudiante</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {students.map((st, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row items-center gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200"
                  >
                    <span className="text-xs font-bold text-slate-400 w-6 text-center">
                      #{idx + 1}
                    </span>
                    <input
                      type="text"
                      required
                      value={st.fullName}
                      onChange={(e) => handleUpdateStudent(idx, 'fullName', e.target.value)}
                      placeholder="Nombres y Apellidos del Estudiante"
                      className="flex-1 w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      required
                      value={st.upnCode}
                      onChange={(e) => handleUpdateStudent(idx, 'upnCode', e.target.value.toUpperCase())}
                      placeholder="Código UPN (N00...)"
                      className="w-full sm:w-44 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none font-mono"
                    />
                    {students.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveStudent(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Eliminar estudiante"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Botones de Acción */}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setSelectedBlockIds([]);
                  setSelectedDate(null);
                  setSelectedSlotLabId(null);
                }}
                className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Agendando asesoría...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmar Asesoría y Cupo</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL / COMPROBANTE DE ASESORÍA AGENDADA                              */}
      {/* ===================================================================== */}
      {createdAdvisory && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-6">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-extrabold text-slate-900">
                ¡Asesoría Agendada Exitosamente!
              </h3>
              <p className="text-xs text-slate-500">
                Se ha enviado la invitación al Google Calendar del asesor y se ha bloqueado 1 cupo en el laboratorio.
              </p>
            </div>

            {/* Resumen */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500">Código de Asesoría:</span>
                <span className="font-mono font-extrabold text-sm text-sky-600">
                  {createdAdvisory.advisory.code}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Reserva de Lab Vinculada:</span>
                <span className="font-mono font-bold text-amber-600">
                  {createdAdvisory.advisory.linkedReservationCode}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Asesor Asignado:</span>
                <span className="font-bold text-slate-900">
                  {createdAdvisory.advisory.advisorName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Fecha y Bloques:</span>
                <span className="font-semibold text-slate-900">
                  {createdAdvisory.advisory.date} ({createdAdvisory.advisory.blockIds.join(', ')})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Proyecto:</span>
                <span className="text-slate-800">{createdAdvisory.advisory.projectName}</span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-500">Estado:</span>
                <StatusBadge status={createdAdvisory.advisory.status} size="sm" />
              </div>
            </div>

            {/* Acciones de Google Calendar y .ics */}
            <div className="space-y-2.5">
              {createdAdvisory.advisory.calendarEventUrl && (
                <a
                  href={createdAdvisory.advisory.calendarEventUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
                >
                  <CalendarPlus className="w-4 h-4 text-sky-400" />
                  <span>Abrir en Google Calendar</span>
                </a>
              )}

              {createdAdvisory.advisory.icsDownloadUrl && (
                <a
                  href={createdAdvisory.advisory.icsDownloadUrl}
                  download={`Asesoria_${createdAdvisory.advisory.code}.ics`}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shadow-2xs"
                >
                  <Download className="w-4 h-4 text-slate-500" />
                  <span>Descargar invitación .ics</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => setCreatedAdvisory(null)}
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
