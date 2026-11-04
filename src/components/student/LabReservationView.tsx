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
  Sparkles,
  Zap,
  Cpu,
  Bot,
  Check,
  X,
  RefreshCw,
  Search,
  Download,
  ExternalLink,
  Video,
  ShieldCheck,
  BookmarkCheck,
  XCircle,
  FileText,
  AlertTriangle,
  RotateCcw,
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
  UPN_LAB_COURSES,
  DEFAULT_TEACHERS_CATALOG,
  SAFETY_PROTOCOL_YOUTUBE_URL,
  LAB_MAP,
} from '@/constants/schedule';
import {
  loadSavedStudentProfile,
  saveStudentProfile,
  lookupStudentByUpnCode,
  clearSavedStudentProfile,
} from '@/lib/student-profile-storage';
import { useToast } from '@/components/shared/ToastProvider';
import { StatusBadge } from '@/components/shared/StatusBadge';

interface LabReservationViewProps {
  initialLabId?: LabId;
}

export function LabReservationView({ initialLabId = 'automatizacion' }: LabReservationViewProps) {
  const { showToast } = useToast();

  // Pestaña activa: Reservar Turno vs Mis Reservas / Cancelar Turno (M4)
  const [activeTab, setActiveTab] = useState<'reserve' | 'my-reservations'>('reserve');

  // Estados de catálogo y laboratorio seleccionado
  const [labs, setLabs] = useState<LaboratoryConfig[]>(DEFAULT_LABORATORIES);
  const [selectedLabId, setSelectedLabId] = useState<LabId>(initialLabId);

  // Catálogo de docentes (M2)
  const [teachersCatalog, setTeachersCatalog] = useState<string[]>(DEFAULT_TEACHERS_CATALOG);

  // Navegación semanal (0 = semana actual, 1 = semana siguiente; máx 2 semanas)
  const [weekOffset, setWeekOffset] = useState<0 | 1>(0);

  // Horario semanal cargado
  const [scheduleData, setScheduleData] = useState<LabWeeklyScheduleResponse | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState<boolean>(true);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Vista Móvil por Día (0 = Lunes, 5 = Sábado) (M16)
  const [mobileDayIdx, setMobileDayIdx] = useState<number>(0);

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

  // Curso: Selector de catálogo o entrada manual (M2)
  const [selectedCourse, setSelectedCourse] = useState<string>(UPN_LAB_COURSES[0] || '');
  const [isCustomCourse, setIsCustomCourse] = useState<boolean>(false);
  const [customCourse, setCustomCourse] = useState<string>('');

  // Docente a cargo: Selector de catálogo o entrada manual (M2)
  const [selectedTeacher, setSelectedTeacher] = useState<string>(DEFAULT_TEACHERS_CATALOG[0] || '');
  const [isCustomTeacher, setIsCustomTeacher] = useState<boolean>(false);
  const [customTeacher, setCustomTeacher] = useState<string>('');

  const [nrc, setNrc] = useState<string>('');

  // Check obligatorio de capacitación de protocolo de seguridad (M3)
  const [safetyProtocolChecked, setSafetyProtocolChecked] = useState<boolean>(false);
  // Modal informativo del protocolo de seguridad y pasos de evaluación (A3)
  const [showSafetyGuideModal, setShowSafetyGuideModal] = useState<boolean>(false);

  // Recordatorio de datos en navegador (M18)
  const [hasRememberedProfile, setHasRememberedProfile] = useState<boolean>(false);

  // Estado de envío y comprobante de reserva creada
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [createdReservation, setCreatedReservation] = useState<LabReservation | null>(null);

  // --------------------------------------------------------------------------
  // Estados para M4: Mis Reservas / Cancelar Turno
  // --------------------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchingReservations, setSearchingReservations] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<LabReservation[]>([]);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // Modal de cancelación de reserva
  const [reservationToCancel, setReservationToCancel] = useState<LabReservation | null>(null);
  const [cancelUpnConfirm, setCancelUpnConfirm] = useState<string>('');
  const [cancelling, setCancelling] = useState<boolean>(false);

  // Carga inicial de catálogo de laboratorios y docentes
  useEffect(() => {
    apiClient
      .getCatalog()
      .then((cat) => {
        if (cat.labs && cat.labs.length > 0) {
          setLabs(cat.labs);
        }
        if (cat.teachers && cat.teachers.length > 0) {
          setTeachersCatalog(cat.teachers);
          setSelectedTeacher(cat.teachers[0]);
        }
      })
      .catch((err) => {
        console.warn('Catálogo fallback de labs/docentes:', err);
      });
  }, []);

  // M18: Cargar perfil recordado al montar
  useEffect(() => {
    const saved = loadSavedStudentProfile();
    if (saved && (saved.fullName || saved.upnCode)) {
      setLeadStudent({
        fullName: saved.fullName || '',
        upnCode: saved.upnCode || '',
      });
      if (saved.career && UPN_CAREERS.includes(saved.career)) {
        setCareer(saved.career);
      }
      if (saved.course) {
        if (UPN_LAB_COURSES.includes(saved.course)) {
          setSelectedCourse(saved.course);
          setIsCustomCourse(false);
        } else {
          setSelectedCourse('__OTHER__');
          setIsCustomCourse(true);
          setCustomCourse(saved.course);
        }
      }
      if (saved.nrc) {
        setNrc(saved.nrc);
      }
      if (saved.teacherName) {
        if (DEFAULT_TEACHERS_CATALOG.includes(saved.teacherName)) {
          setSelectedTeacher(saved.teacherName);
          setIsCustomTeacher(false);
        } else {
          setSelectedTeacher('__OTHER__');
          setIsCustomTeacher(true);
          setCustomTeacher(saved.teacherName);
        }
      }
      setHasRememberedProfile(true);
      // Prellenar también la búsqueda de mis reservas si hay código
      if (saved.upnCode && !searchQuery) {
        setSearchQuery(saved.upnCode);
      }
    }
  }, []);

  const handleForgetProfile = () => {
    clearSavedStudentProfile();
    setHasRememberedProfile(false);
    showToast('Datos locales del estudiante olvidados en este navegador.', 'info');
  };

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

  // M18: Manejo de cambios en el estudiante líder con autocompletado por Código UPN
  const handleLeadUpnChange = (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    setLeadStudent((prev) => ({ ...prev, upnCode: code }));
    if (code.length >= 6) {
      const match = lookupStudentByUpnCode(code);
      if (match && match.fullName) {
        setLeadStudent((prev) => ({
          ...prev,
          fullName: prev.fullName ? prev.fullName : match.fullName,
        }));
      }
    }
  };

  // Participantes adicionales dinámicos con autocompletado (M18)
  const handleAddParticipant = () => {
    setParticipants((prev) => [...prev, { fullName: '', upnCode: '' }]);
  };

  const handleUpdateParticipant = (
    index: number,
    field: keyof StudentParticipant,
    value: string
  ) => {
    setParticipants((prev) => {
      const copy = [...prev];
      const nextVal = field === 'upnCode' ? value.toUpperCase() : value;
      copy[index] = { ...copy[index], [field]: nextVal };

      // Si se escribe el código UPN, buscar en el directorio local
      if (field === 'upnCode' && nextVal.length >= 6) {
        const match = lookupStudentByUpnCode(nextVal);
        if (match && match.fullName && !copy[index].fullName) {
          copy[index].fullName = match.fullName;
        }
      }

      return copy;
    });
  };

  const handleRemoveParticipant = (index: number) => {
    setParticipants((prev) => prev.filter((_, i) => i !== index));
  };

  // Obtener nombre final de curso y docente
  const finalCourse = isCustomCourse ? customCourse.trim() : selectedCourse.trim();
  const finalTeacher = isCustomTeacher ? customTeacher.trim() : selectedTeacher.trim();

  // Envío del formulario de reserva
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

    if (!projectName.trim() || !finalCourse || !nrc.trim()) {
      showToast('Completa el proyecto, curso y NRC.', 'warning');
      return;
    }

    if (!finalTeacher) {
      showToast('Selecciona o especifica el docente a cargo.', 'warning');
      return;
    }

    // M3: Check obligatorio de Protocolo de Seguridad
    if (!safetyProtocolChecked) {
      showToast(
        'Debes confirmar que aprobaste la capacitación del Protocolo de Seguridad para continuar.',
        'warning'
      );
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
      course: finalCourse,
      nrc: nrc.trim(),
      teacherName: finalTeacher,
      safetyProtocolConfirmed: true,
    };

    setSubmitting(true);
    try {
      const res = await apiClient.createLabReservation(payload);
      setCreatedReservation(res.reservation);
      showToast(`¡Reserva ${res.reservation.code} creada con éxito!`, 'success');

      // M18: Guardar datos en localStorage para futuras visitas
      saveStudentProfile({
        fullName: leadStudent.fullName.trim(),
        upnCode: leadStudent.upnCode.trim().toUpperCase(),
        career,
        course: finalCourse,
        nrc: nrc.trim(),
        teacherName: finalTeacher,
      });

      // Guardar participantes en el directorio local
      participants.forEach((p) => {
        if (p.upnCode && p.fullName) {
          saveStudentProfile({
            fullName: p.fullName.trim(),
            upnCode: p.upnCode.trim().toUpperCase(),
          });
        }
      });
      setHasRememberedProfile(true);

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

  // --------------------------------------------------------------------------
  // M4: Búsqueda y Cancelación de Reservas del Estudiante
  // --------------------------------------------------------------------------
  const handleSearchReservations = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim().toUpperCase();
    if (!q) {
      showToast('Ingresa tu Código UPN (N00...) o Código de Reserva (RES-...)', 'info');
      return;
    }

    setSearchingReservations(true);
    setHasSearched(true);
    try {
      const res = await apiClient.searchStudentReservations(q);
      setSearchResults(res.reservations || []);
      if (!res.reservations || res.reservations.length === 0) {
        showToast('No se encontraron reservas con ese criterio.', 'info');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al buscar reservas';
      showToast(msg, 'error');
      setSearchResults([]);
    } finally {
      setSearchingReservations(false);
    }
  };

  const handleOpenCancelModal = (res: LabReservation) => {
    setReservationToCancel(res);
    // Prellenar código si la búsqueda actual parece un código UPN
    if (searchQuery.trim().toUpperCase().startsWith('N00')) {
      setCancelUpnConfirm(searchQuery.trim().toUpperCase());
    } else if (leadStudent.upnCode) {
      setCancelUpnConfirm(leadStudent.upnCode);
    } else {
      setCancelUpnConfirm('');
    }
  };

  const handleConfirmCancelReservation = async () => {
    if (!reservationToCancel) return;
    const upn = cancelUpnConfirm.trim().toUpperCase();
    if (!upn) {
      showToast('Debes ingresar tu Código UPN para confirmar la cancelación.', 'warning');
      return;
    }

    setCancelling(true);
    try {
      const res = await apiClient.cancelStudentReservation(reservationToCancel.code, upn);
      showToast(res.message || 'Reserva cancelada correctamente.', 'success');
      setReservationToCancel(null);
      setCancelUpnConfirm('');
      // Refrescar lista de búsqueda y grilla
      handleSearchReservations();
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cancelar la reserva';
      showToast(msg, 'error');
    } finally {
      setCancelling(false);
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
      {/* ENCABEZADO Y SELECTOR DE PESTAÑAS (M4)                                */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold mb-2">
              <Calendar className="w-3.5 h-3.5 text-amber-600" />
              <span>Módulo 1 • Reservas de Laboratorio</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {activeTab === 'reserve'
                ? 'Reserva de Laboratorio Especializado'
                : 'Mis Reservas y Cancelación de Turno'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
              {activeTab === 'reserve'
                ? 'Selecciona el laboratorio, navega en las 2 semanas disponibles y escoge los bloques para tu equipo de trabajo.'
                : 'Consulta tus reservas registradas, descarga la invitación de calendario o cancela un turno si no podrás asistir.'}
            </p>
          </div>

          {/* Selector de Pestañas Superior (M4) */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start md:self-auto border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('reserve')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'reserve'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-4 h-4 text-amber-600" />
              <span>Reservar Turno</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('my-reservations');
                if (searchQuery && !hasSearched) {
                  handleSearchReservations();
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'my-reservations'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Search className="w-4 h-4 text-amber-600" />
              <span>Mis Reservas / Cancelar Turno</span>
            </button>
          </div>
        </div>

        {/* Tarjetas rápidas de los 3 Laboratorios (solo en pestaña 'reserve') */}
        {activeTab === 'reserve' && (
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
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{lab.location}</p>
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-semibold text-slate-700">
                      <Users className="w-3 h-3 text-slate-500" />
                      <span>Capacidad: {lab.maxSimultaneousGroups} grupos simultáneos</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* PESTAÑA 2: MIS RESERVAS / CANCELAR TURNO (M4)                          */}
      {/* ===================================================================== */}
      {activeTab === 'my-reservations' && (
        <div className="space-y-6">
          {/* Barra de Búsqueda */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              Buscar Reservas de Laboratorio
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Ingresa tu Código UPN (ej. <span className="font-mono font-semibold">N00123456</span>) o
              el Código de Reserva generado (ej.{' '}
              <span className="font-mono font-semibold">RES-2026-0001</span>).
            </p>

            <form onSubmit={handleSearchReservations} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                  placeholder="Ej. N00213456 o RES-2026-0001"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={searchingReservations}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
              >
                {searchingReservations ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Buscando...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Buscar Reservas</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Resultados de la Búsqueda */}
          {hasSearched && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">
                  Resultados encontrados ({searchResults.length})
                </h3>
                {searchResults.length > 0 && (
                  <span className="text-[11px] text-slate-500">
                    Mostrando reservas asociadas a tu búsqueda
                  </span>
                )}
              </div>

              {searchResults.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">
                    No se encontraron reservas registradas
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    No existe ninguna reserva con el código o UPN ingresado. Verifica que el código
                    sea correcto o programa un nuevo turno en la pestaña &quot;Reservar Turno&quot;.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {searchResults.map((res) => {
                    const labCfg = LAB_MAP[res.labId];
                    const isActive = res.status === 'ACTIVA';

                    return (
                      <div
                        key={res.id}
                        className={`bg-white rounded-2xl border p-5 shadow-xs transition-all flex flex-col justify-between ${
                          isActive
                            ? 'border-slate-200 hover:border-amber-400'
                            : 'border-slate-200 bg-slate-50/60 opacity-80'
                        }`}
                      >
                        <div className="space-y-3">
                          {/* Cabecera de la Reserva */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-extrabold text-sm text-slate-900">
                                  {res.code}
                                </span>
                                {res.origin === 'ASESORIA' && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-100 text-sky-800">
                                    Vía Asesoría
                                  </span>
                                )}
                              </div>
                              <span className="text-xs font-semibold text-slate-700 block mt-0.5">
                                {labCfg?.name || res.labId}
                              </span>
                            </div>
                            <StatusBadge status={res.status} size="sm" />
                          </div>

                          {/* Datos Principales */}
                          <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 rounded-xl p-3 border border-slate-100">
                            <div>
                              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                Fecha y Bloques
                              </span>
                              <span className="font-semibold text-slate-800">
                                {res.date}
                              </span>
                              <div className="text-[10px] font-mono text-amber-700 mt-0.5">
                                {res.blockIds.map((b) => `${b} (${TIME_BLOCK_MAP[b]?.startTime || ''})`).join(', ')}
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                Docente a Cargo
                              </span>
                              <span className="font-medium text-slate-700 truncate block">
                                {res.teacherName || 'No especificado'}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                                NRC: {res.nrc}
                              </span>
                            </div>
                          </div>

                          {/* Proyecto y Curso */}
                          <div className="text-xs space-y-1">
                            <div>
                              <strong className="text-slate-600 font-medium">Proyecto: </strong>
                              <span className="text-slate-900 font-semibold">{res.projectName}</span>
                            </div>
                            <div>
                              <strong className="text-slate-600 font-medium">Curso: </strong>
                              <span className="text-slate-700">{res.course}</span>
                            </div>
                            <div>
                              <strong className="text-slate-600 font-medium">Líder: </strong>
                              <span className="text-slate-800">
                                {res.leadStudent.fullName} ({res.leadStudent.upnCode})
                              </span>
                            </div>
                            {res.participants && res.participants.length > 0 && (
                              <div className="text-[11px] text-slate-500 pt-1">
                                Integrantes (+{res.participants.length}):{' '}
                                {res.participants.map((p) => p.fullName).join(', ')}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Botones de Acción */}
                        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {/* Descarga de Calendario .ics */}
                            <a
                              href={`/api/reservations/${res.id}/ics`}
                              download={`Reserva_${res.code}.ics`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
                              title="Descargar invitación para Outlook o Calendar (.ics)"
                            >
                              <Download className="w-3.5 h-3.5 text-slate-500" />
                              <span>Descargar .ics</span>
                            </a>

                            {res.calendarEventUrl && (
                              <a
                                href={res.calendarEventUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                                title="Abrir en Google Calendar"
                              >
                                <CalendarPlus className="w-3.5 h-3.5 text-amber-600" />
                                <ExternalLink className="w-3 h-3 text-slate-400" />
                              </a>
                            )}
                          </div>

                          {/* Botón Cancelar Turno si está ACTIVA */}
                          {isActive && (
                            <button
                              type="button"
                              onClick={() => handleOpenCancelModal(res)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>Cancelar Turno</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* PESTAÑA 1: RESERVAR TURNO DE LABORATORIO                              */}
      {/* ===================================================================== */}
      {activeTab === 'reserve' && (
        <>
          {/* ================================================================= */}
          {/* BARRA DE NAVEGACIÓN SEMANAL (MÁXIMO 2 SEMANAS: 0 Y 1)             */}
          {/* ================================================================= */}
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
                    {scheduleData
                      ? `${scheduleData.weekStartDate} al ${scheduleData.weekEndDate}`
                      : 'Cargando fechas...'}
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
                <RefreshCw
                  className={`w-4 h-4 ${loadingSchedule ? 'animate-spin text-amber-500' : ''}`}
                />
              </button>
            </div>
          </div>

          {/* ================================================================= */}
          {/* GRILLA SEMANAL DE LOS 9 BLOQUES HORARIOS                          */}
          {/* ================================================================= */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Leyenda explicativa de estados */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="font-bold text-slate-700">Leyenda de Estados de Bloque:</span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-slate-600">
                  <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
                  <span>Disponible</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-600">
                  <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300" />
                  <span>Clase Lectiva</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-600">
                  <span className="w-3 h-3 rounded bg-slate-200 border border-slate-300" />
                  <span>Bloqueado</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-600">
                  <span className="w-3 h-3 rounded bg-orange-100 border border-orange-300" />
                  <span>Agotado</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-600">
                  <span className="w-3 h-3 rounded bg-amber-400 border border-amber-600" />
                  <span className="font-semibold text-slate-800">Seleccionado por ti</span>
                </span>
              </div>
            </div>

            {/* M16: VISTA MÓVIL POR DÍA (< 640px) */}
            <div className="block sm:hidden p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Elige el día a consultar:
                </span>
                {scheduleData?.days[mobileDayIdx] && (
                  <span className="text-xs font-extrabold text-amber-600">
                    {scheduleData.days[mobileDayIdx].dayName}
                  </span>
                )}
              </div>

              {/* Selector de 6 botones de días */}
              <div className="grid grid-cols-6 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                {scheduleData?.days.map((day, idx) => {
                  const isCurrent = mobileDayIdx === idx;
                  const dateParts = day.date.split('-');
                  const shortDate = `${dateParts[2]}/${dateParts[1]}`;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => setMobileDayIdx(idx)}
                      className={`py-2 px-1 rounded-lg text-center transition-all cursor-pointer flex flex-col items-center ${
                        isCurrent
                          ? 'bg-amber-500 text-slate-950 font-extrabold shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 font-semibold'
                      }`}
                    >
                      <span className="text-[11px] leading-tight uppercase">
                        {day.dayName.slice(0, 3)}
                      </span>
                      <span className="text-[9px] font-mono leading-tight mt-0.5 opacity-90">
                        {shortDate}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Lista vertical de los 9 bloques del día seleccionado */}
              <div className="space-y-2 pt-1">
                {scheduleData?.days[mobileDayIdx] &&
                  TIME_BLOCKS.map((tb) => {
                    const currentDay = scheduleData.days[mobileDayIdx];
                    const slotKey = `${currentDay.date}_${tb.id}`;
                    const slot = slotsMap.get(slotKey);
                    const state = slot ? slot.state : 'PASADO';
                    const isSelected =
                      selectedDate === currentDay.date && selectedBlockIds.includes(tb.id);
                    const isAvailable = state === 'DISPONIBLE';

                    return (
                      <div
                        key={tb.id}
                        onClick={() => handleSlotClick(currentDay.date, tb.id, state)}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-amber-100 border-amber-500 ring-2 ring-amber-500 shadow-sm cursor-pointer'
                            : isAvailable
                            ? 'bg-white hover:bg-emerald-50/60 border-slate-200 hover:border-emerald-400 cursor-pointer shadow-2xs'
                            : 'bg-slate-50/80 border-slate-200 cursor-not-allowed opacity-85'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center font-extrabold text-xs shrink-0 ${
                              isSelected
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {tb.id}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-mono font-bold text-slate-800 block">
                              {tb.label}
                            </span>
                            {state === 'CLASE' && (
                              <p className="text-[11px] text-blue-700 truncate mt-0.5">
                                {slot?.classInfo?.courseName} • {slot?.classInfo?.teacherName}
                              </p>
                            )}
                            {state === 'BLOQUEADO' && (
                              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                {slot?.blockReason || 'Turno bloqueado'}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          {isSelected ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500 text-slate-950 text-xs font-bold">
                              <Check className="w-3.5 h-3.5" />
                              <span>Elegido</span>
                            </span>
                          ) : state === 'DISPONIBLE' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-xs font-bold">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span>{slot?.availableGroups}/{slot?.maxGroups} libres</span>
                            </span>
                          ) : state === 'CLASE' ? (
                            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[11px] font-bold">
                              Clase
                            </span>
                          ) : state === 'COMPLETO' ? (
                            <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 text-[11px] font-bold">
                              Agotado
                            </span>
                          ) : state === 'BLOQUEADO' ? (
                            <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[11px] font-medium">
                              Bloqueado
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Pasado</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* VISTA DESKTOP / TABLET (>= 640px) */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full border-collapse table-fixed text-left min-w-[700px] sm:min-w-full">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs">
                    <th className="py-2.5 px-1.5 sm:px-2 font-semibold uppercase tracking-wider w-[12%] sm:w-[10%] border-r border-slate-800 text-center">
                      <span className="text-[10px] sm:text-xs">Bloque</span>
                    </th>
                    {scheduleData?.days.map((day) => (
                      <th
                        key={day.date}
                        className="py-2.5 px-1 sm:px-1.5 font-semibold border-r border-slate-800 last:border-r-0 text-center w-[14.66%] sm:w-[15%]"
                      >
                        <div className="text-amber-400 uppercase tracking-wider text-[10px] sm:text-[11px] font-extrabold truncate">
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
                      {/* Celda del Bloque Horario */}
                      <td className="py-2 px-1 sm:px-1.5 bg-slate-50/90 font-medium text-slate-700 border-r border-slate-200 text-center align-middle">
                        <div className="font-extrabold text-xs sm:text-sm text-slate-900 leading-tight">
                          {tb.id}
                        </div>
                        <div className="text-[8.5px] sm:text-[9.5px] text-slate-500 font-mono leading-tight mt-0.5 whitespace-nowrap">
                          {tb.label}
                        </div>
                      </td>

                      {/* Celdas para cada uno de los 6 días (Lunes a Sábado) */}
                      {scheduleData?.days.map((day) => {
                        const slotKey = `${day.date}_${tb.id}`;
                        const slot = slotsMap.get(slotKey);
                        const state = slot ? slot.state : 'PASADO';
                        const isSelected =
                          selectedDate === day.date && selectedBlockIds.includes(tb.id);
                        const isAvailable = state === 'DISPONIBLE';

                        return (
                          <td
                            key={slotKey}
                            onClick={() => handleSlotClick(day.date, tb.id, state)}
                            className={`p-1 sm:p-1.5 border-r border-slate-200 last:border-r-0 transition-all align-top ${
                              isSelected
                                ? 'bg-amber-100/90 ring-2 ring-inset ring-amber-500 shadow-inner'
                                : isAvailable
                                ? 'hover:bg-emerald-50/80 cursor-pointer'
                                : 'cursor-not-allowed'
                            }`}
                          >
                            {isSelected ? (
                              <div className="p-1 sm:p-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold flex flex-col items-center justify-center gap-0.5 shadow-xs h-full min-h-[46px]">
                                <div className="flex items-center gap-1 text-[9.5px] sm:text-[10px]">
                                  <Check className="w-3 h-3" />
                                  <span>Elegido</span>
                                </div>
                                <span className="text-[8px] sm:text-[8.5px] font-medium opacity-90">
                                  {slot?.availableGroups} libres
                                </span>
                              </div>
                            ) : state === 'DISPONIBLE' ? (
                              <div className="p-1 sm:p-1.5 rounded-lg bg-emerald-50/90 border border-emerald-200 hover:border-emerald-400 text-emerald-800 transition-colors h-full min-h-[46px] flex flex-col justify-between">
                                <div className="flex items-center justify-between font-bold text-[9.5px] sm:text-[10.5px] leading-tight">
                                  <span className="truncate">Disponible</span>
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 ml-1" />
                                </div>
                                <div className="text-[8.5px] sm:text-[9.5px] text-emerald-700 font-semibold mt-1 leading-tight">
                                  {slot?.availableGroups}/{slot?.maxGroups} libres
                                </div>
                              </div>
                            ) : state === 'CLASE' ? (
                              <div
                                className="p-1 sm:p-1.5 rounded-lg bg-blue-50/95 border border-blue-200 text-blue-900 h-full min-h-[46px] flex flex-col justify-between"
                                title={`${slot?.classInfo?.courseName} - ${slot?.classInfo?.teacherName}`}
                              >
                                <div>
                                  <div className="font-bold text-[8.5px] sm:text-[9.5px] leading-tight line-clamp-2 uppercase tracking-tight text-blue-950">
                                    {slot?.classInfo?.courseName || 'Clase Lectiva'}
                                  </div>
                                  <div className="text-[8px] sm:text-[8.5px] text-blue-800 leading-tight truncate mt-0.5 font-medium">
                                    {slot?.classInfo?.teacherName || 'Docente UPN'}
                                  </div>
                                </div>
                                {slot?.classInfo?.nrc && (
                                  <div className="text-[7.5px] sm:text-[8px] font-mono text-blue-600 mt-0.5">
                                    NRC: {slot.classInfo.nrc}
                                  </div>
                                )}
                              </div>
                            ) : state === 'BLOQUEADO' ? (
                              <div className="p-1 sm:p-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 h-full min-h-[46px] flex flex-col justify-between">
                                <div className="font-semibold text-[8.5px] sm:text-[9.5px] text-slate-700 truncate">
                                  Bloqueado
                                </div>
                                <div className="text-[8px] sm:text-[8.5px] text-slate-500 truncate mt-0.5">
                                  {slot?.blockReason || 'Evento'}
                                </div>
                              </div>
                            ) : state === 'COMPLETO' ? (
                              <div className="p-1 sm:p-1.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 h-full min-h-[46px] flex flex-col justify-between">
                                <div className="font-bold text-[8.5px] sm:text-[9.5px]">Agotado</div>
                                <div className="text-[8px] sm:text-[8.5px] text-orange-700 mt-0.5">
                                  0/{slot?.maxGroups} libres
                                </div>
                              </div>
                            ) : (
                              <div className="py-2.5 px-1 rounded-lg bg-slate-50 text-slate-400 text-center h-full min-h-[46px] flex items-center justify-center">
                                <span className="text-[8.5px] sm:text-[9.5px]">Pasado</span>
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

          {/* ================================================================= */}
          {/* PANEL FLOTANTE / FORMULARIO DE RESERVA DE TURNOS                  */}
          {/* ================================================================= */}
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
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  title="Cancelar selección"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Banner M18: Datos recordados */}
              {hasRememberedProfile && (
                <div className="mt-4 p-3 rounded-xl bg-amber-50/70 border border-amber-200 flex items-center justify-between text-xs text-amber-900">
                  <div className="flex items-center gap-2">
                    <BookmarkCheck className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Tus datos académicos han sido autocompletados desde este navegador.</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleForgetProfile}
                    className="text-[11px] font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer shrink-0 ml-2"
                  >
                    Olvidar datos
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmitReservation} className="mt-6 space-y-6">
                {/* Datos del Proyecto y Carrera */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Nombre del Proyecto / Práctica <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="Ej. Sincronización de Brazo SCARA y PLC"
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
                </div>

                {/* M2: Selector de Curso y Docente a Cargo con opción manual */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Curso UPN con select oficial + manual */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Curso Oficial <span className="text-rose-500">*</span>
                    </label>
                    {!isCustomCourse ? (
                      <select
                        value={selectedCourse}
                        onChange={(e) => {
                          if (e.target.value === '__OTHER__') {
                            setIsCustomCourse(true);
                          } else {
                            setSelectedCourse(e.target.value);
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                      >
                        {UPN_LAB_COURSES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value="__OTHER__">+ Otro curso (escribir manual)...</option>
                      </select>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          required
                          value={customCourse}
                          onChange={(e) => setCustomCourse(e.target.value)}
                          placeholder="Escribe el nombre del curso"
                          className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomCourse(false);
                            setSelectedCourse(UPN_LAB_COURSES[0] || '');
                          }}
                          className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer shrink-0"
                          title="Volver a lista oficial"
                        >
                          Lista
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Docente a Cargo (M2) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Docente a Cargo <span className="text-rose-500">*</span>
                    </label>
                    {!isCustomTeacher ? (
                      <select
                        value={selectedTeacher}
                        onChange={(e) => {
                          if (e.target.value === '__OTHER__') {
                            setIsCustomTeacher(true);
                          } else {
                            setSelectedTeacher(e.target.value);
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                      >
                        {teachersCatalog.map((t) => (
                          <option key={t} value={t}>
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
                          value={customTeacher}
                          onChange={(e) => setCustomTeacher(e.target.value)}
                          placeholder="Nombre del Docente"
                          className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomTeacher(false);
                            setSelectedTeacher(teachersCatalog[0] || DEFAULT_TEACHERS_CATALOG[0]);
                          }}
                          className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer shrink-0"
                          title="Volver a lista oficial"
                        >
                          Lista
                        </button>
                      </div>
                    )}
                  </div>

                  {/* NRC */}
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

                {/* Estudiante Principal (Líder del Grupo) con Autocompletado M18 */}
                <div className="bg-slate-50/80 rounded-2xl p-4 sm:p-5 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-amber-600" />
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Estudiante Responsable (Líder del Turno)
                      </h3>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Autocompleta nombre al escribir tu código
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Código UPN <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={leadStudent.upnCode}
                        onChange={(e) => handleLeadUpnChange(e.target.value)}
                        placeholder="Ej. N00123456"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
                      />
                    </div>
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
                            value={p.upnCode}
                            onChange={(e) =>
                              handleUpdateParticipant(idx, 'upnCode', e.target.value)
                            }
                            placeholder="Código UPN (N00...)"
                            className="w-full sm:w-44 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
                          />
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
                          <button
                            type="button"
                            onClick={() => handleRemoveParticipant(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="Eliminar participante"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* M3: CHECK OBLIGATORIO DE PROTOCOLO DE SEGURIDAD + ENLACE A YOUTUBE */}
                <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/70 border-2 border-amber-300/80 space-y-3">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                        Capacitación Obligatoria de Protocolo de Seguridad UPN
                      </h4>
                      <p className="text-xs text-amber-900 leading-relaxed">
                        Es requisito institucional que todos los estudiantes que ingresan a los
                        laboratorios hayan visualizado la inducción de seguridad, registrado sus
                        datos y aprobado la evaluación oficial.
                      </p>
                    </div>
                  </div>

                  {/* Enlace destacado a YouTube y botón de Guía del Protocolo (A3) */}
                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    <a
                      href={SAFETY_PROTOCOL_YOUTUBE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs transition-colors"
                    >
                      <Video className="w-4 h-4" />
                      <span>Ver vídeo de capacitación en YouTube</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setShowSafetyGuideModal(true)}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-amber-100/70 text-amber-950 border border-amber-300 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4 text-amber-600" />
                      <span>Ver pasos del protocolo y evaluación</span>
                    </button>
                    <span className="text-[11px] text-amber-800">
                      (Al concluir el vídeo, no olvides registrar tus datos en el enlace de evaluación)
                    </span>
                  </div>

                  {/* Checkbox de confirmación */}
                  <label className="flex items-start gap-3 pt-2 cursor-pointer border-t border-amber-200/80">
                    <input
                      type="checkbox"
                      checked={safetyProtocolChecked}
                      onChange={(e) => setSafetyProtocolChecked(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-amber-600 border-amber-400 focus:ring-amber-500 cursor-pointer"
                    />
                    <span className="text-xs text-amber-950 font-medium select-none leading-snug">
                      Confirmo que he realizado la capacitación del{' '}
                      <strong>Protocolo de Seguridad de Laboratorios Especializados</strong>, he
                      registrado mis datos y he aprobado la evaluación correspondiente.{' '}
                      <span className="text-rose-600 font-bold">*</span>
                    </span>
                  </label>
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
                    className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
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
        </>
      )}

      {/* ===================================================================== */}
      {/* MODAL / CONFIRMACIÓN DE CANCELACIÓN DE RESERVA (M4)                   */}
      {/* ===================================================================== */}
      {reservationToCancel && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ¿Cancelar Turno de Laboratorio?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Esta acción liberará de inmediato los cupos para otros compañeros de ingeniería.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Reserva:</span>
                <span className="font-mono font-bold text-slate-900">
                  {reservationToCancel.code}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fecha y Bloques:</span>
                <span className="font-semibold text-slate-800">
                  {reservationToCancel.date} ({reservationToCancel.blockIds.join(', ')})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Proyecto:</span>
                <span className="text-slate-800 truncate max-w-[200px]">
                  {reservationToCancel.projectName}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Ingresa tu Código UPN del Estudiante Líder para confirmar <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={cancelUpnConfirm}
                onChange={(e) => setCancelUpnConfirm(e.target.value.toUpperCase())}
                placeholder="Ej. N00123456"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Por seguridad, solo el estudiante responsable puede cancelar la reserva.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setReservationToCancel(null);
                  setCancelUpnConfirm('');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleConfirmCancelReservation}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {cancelling ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Cancelando...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Sí, Cancelar Turno</span>
                  </>
                )}
              </button>
            </div>
          </div>
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
                <span className="font-bold text-slate-900">{currentLab.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Fecha del Turno:</span>
                <span className="font-semibold text-slate-900">{createdReservation.date}</span>
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
                <span className="text-slate-500">Docente a Cargo:</span>
                <span className="font-semibold text-slate-900">
                  {createdReservation.teacherName || 'Docente UPN'}
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
              <a
                href={`/api/reservations/${createdReservation.id}/ics`}
                download={`Reserva_${createdReservation.code}.ics`}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
              >
                <Download className="w-4 h-4 text-slate-600" />
                <span>Descargar archivo de Calendario (.ics)</span>
              </a>

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

      {/* ===================================================================== */}
      {/* MODAL INFORMATIVO: GUÍA DEL PROTOCOLO DE SEGURIDAD Y EVALUACIÓN (A3)  */}
      {/* ===================================================================== */}
      {showSafetyGuideModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 leading-snug">
                    Protocolo de Seguridad de Laboratorios UPN
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cumplimiento normativo institucional ISO 21001 y bioseguridad
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSafetyGuideModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Para garantizar la integridad y el buen uso del equipamiento especializado, todo estudiante debe completar estos <strong className="text-slate-900">3 pasos obligatorios</strong> antes de ingresar a los laboratorios:
              </p>

              {/* Paso 1 */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80">
                <div className="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 font-extrabold text-xs flex items-center justify-center shrink-0">
                  1
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 text-xs">
                    1. Visualizar el vídeo de inducción de seguridad del laboratorio
                  </h4>
                  <p className="text-slate-600 leading-relaxed text-[11.5px]">
                    Revisa detalladamente las normas de bioseguridad, uso obligatorio de EPP (guardapolvo, lentes y calzado cerrado), señalización de rutas de evacuación y uso de extintores en las instalaciones UPN.
                  </p>
                </div>
              </div>

              {/* Paso 2 */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-sky-50/60 border border-sky-200/80">
                <div className="w-7 h-7 rounded-lg bg-sky-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                  2
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 text-xs">
                    2. Registrar sus datos académicos, docente y NRC en el registro en línea
                  </h4>
                  <p className="text-slate-600 leading-relaxed text-[11.5px]">
                    Al inicio o conclusión del vídeo, ingresa tus datos (Código UPN, Carrera, Asignatura y NRC) para certificar tu asistencia y vincular la constancia a tu expediente estudiantil.
                  </p>
                </div>
              </div>

              {/* Paso 3 */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                  3
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 text-xs">
                    3. Aprobar la evaluación del protocolo ISO 21001
                  </h4>
                  <p className="text-slate-600 leading-relaxed text-[11.5px]">
                    Responde el breve cuestionario en línea de verificación de conocimientos de seguridad y buenas prácticas de laboratorio para habilitar tu pase de ingreso a las prácticas libres.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <a
                href={SAFETY_PROTOCOL_YOUTUBE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-2xs"
              >
                <Video className="w-4 h-4" />
                <span>Ir al vídeo en YouTube</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSafetyGuideModal(false)}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSafetyProtocolChecked(true);
                    setShowSafetyGuideModal(false);
                    showToast('Capacitación y evaluación marcadas como completadas.', 'success');
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Ya completé la capacitación y evaluación (Marcar casilla)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
