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
  Search,
  BookmarkCheck,
  Filter,
  ExternalLink,
  XCircle,
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
import {
  TIME_BLOCKS,
  TIME_BLOCK_MAP,
  LAB_MAP,
  UPN_LAB_COURSES,
} from '@/constants/schedule';
import {
  loadSavedStudentProfile,
  saveStudentProfile,
  lookupStudentByUpnCode,
  clearSavedStudentProfile,
} from '@/lib/student-profile-storage';
import { useToast } from '@/components/shared/ToastProvider';
import { StatusBadge } from '@/components/shared/StatusBadge';

export function AdvisoryBookingView() {
  const { showToast } = useToast();

  // Pestaña activa: Agendar Asesoría vs Mis Asesorías / Cancelar Turno (A1)
  const [activeTab, setActiveTab] = useState<'book' | 'my-advisories'>('book');

  // Asesores
  const [advisors, setAdvisors] = useState<AdvisorProfile[]>([]);
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>('adv-1');

  // M11: Filtro rápido por especialidad/tema y buscador
  const [advisorSearchQuery, setAdvisorSearchQuery] = useState<string>('');
  const [selectedTopicFilter, setSelectedTopicFilter] = useState<string>('Todos');

  // Navegación semanal (0 o 1)
  const [weekOffset, setWeekOffset] = useState<0 | 1>(0);

  // Estado del horario del asesor
  const [scheduleData, setScheduleData] = useState<AdvisorWeeklyScheduleResponse | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState<boolean>(true);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // M16: Vista móvil por día (0 = Lunes, 5 = Sábado)
  const [mobileDayIdx, setMobileDayIdx] = useState<number>(0);

  // Selección de bloques para asesoría
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<TimeBlockId[]>([]);
  const [selectedSlotLabId, setSelectedSlotLabId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);

  // Datos del formulario de asesoría
  const [projectName, setProjectName] = useState<string>('');

  // M11: Selector desplegable de Cursos con UPN_LAB_COURSES + manual
  const [selectedCourse, setSelectedCourse] = useState<string>(UPN_LAB_COURSES[0] || '');
  const [isCustomCourse, setIsCustomCourse] = useState<boolean>(false);
  const [customCourse, setCustomCourse] = useState<string>('');

  const [nrc, setNrc] = useState<string>('');
  const [topicNotes, setTopicNotes] = useState<string>('');

  // Estudiantes: De base 1 estudiante, y opción de añadir más (M18)
  const [students, setStudents] = useState<StudentParticipant[]>([
    { fullName: '', upnCode: '' },
  ]);

  // Recordatorio de datos en navegador (M18)
  const [hasRememberedProfile, setHasRememberedProfile] = useState<boolean>(false);

  // Estado de envío y comprobante
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [createdAdvisory, setCreatedAdvisory] = useState<{
    advisory: AdvisoryRequest;
    reservation: LabReservation;
  } | null>(null);

  // --------------------------------------------------------------------------
  // Estados para A1: Mis Asesorías / Cancelar Turno
  // --------------------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchingAdvisories, setSearchingAdvisories] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<AdvisoryRequest[]>([]);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // Modal de cancelación de asesoría
  const [advisoryToCancel, setAdvisoryToCancel] = useState<AdvisoryRequest | null>(null);
  const [cancelUpnConfirm, setCancelUpnConfirm] = useState<string>('');
  const [cancelling, setCancelling] = useState<boolean>(false);

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

  // M18: Cargar perfil recordado al montar para prellenar estudiante #1, curso y NRC
  useEffect(() => {
    const saved = loadSavedStudentProfile();
    if (saved && (saved.fullName || saved.upnCode)) {
      setStudents([
        {
          fullName: saved.fullName || '',
          upnCode: saved.upnCode || '',
        },
      ]);
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
      setHasRememberedProfile(true);
      if (saved.upnCode) {
        setSearchQuery(saved.upnCode);
      }
    }
  }, []);

  const handleForgetProfile = () => {
    clearSavedStudentProfile();
    setHasRememberedProfile(false);
    showToast('Datos locales del estudiante olvidados en este navegador.', 'info');
  };

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

  // M11: Píldoras de temas comunes
  const availableTopics = useMemo(() => {
    const topicsSet = new Set<string>();
    advisors.forEach((adv) => {
      if (adv.specialty) {
        // Extraer términos significativos si vienen juntos
        adv.specialty.split(/[,/•y]/).forEach((part) => {
          const t = part.trim();
          if (t.length > 3) topicsSet.add(t);
        });
      }
      if (adv.advisoryTopics) {
        adv.advisoryTopics.forEach((t) => topicsSet.add(t.trim()));
      }
    });

    // Píldoras curadas y más representativas
    const defaults = ['Todos', 'Automatización', 'Electrónica', 'Mecatrónica', 'PLC', 'Robótica', 'Impresión 3D'];
    const dynamicTopics = Array.from(topicsSet).filter((t) => !defaults.includes(t)).slice(0, 3);
    return [...defaults, ...dynamicTopics];
  }, [advisors]);

  // M11: Filtrado de Asesores por texto y píldora de tema
  const filteredAdvisors = useMemo(() => {
    return advisors.filter((adv) => {
      // Filtro por píldora
      if (selectedTopicFilter !== 'Todos') {
        const filterLower = selectedTopicFilter.toLowerCase();
        const matchesTopic =
          adv.specialty.toLowerCase().includes(filterLower) ||
          adv.career?.toLowerCase().includes(filterLower) ||
          adv.advisoryTopics?.some((t) => t.toLowerCase().includes(filterLower));
        if (!matchesTopic) return false;
      }

      // Filtro por texto de búsqueda libre
      if (advisorSearchQuery.trim()) {
        const q = advisorSearchQuery.trim().toLowerCase();
        const matchesQuery =
          adv.fullName.toLowerCase().includes(q) ||
          adv.roleTitle.toLowerCase().includes(q) ||
          adv.specialty.toLowerCase().includes(q) ||
          adv.career?.toLowerCase().includes(q) ||
          adv.advisoryTopics?.some((t) => t.toLowerCase().includes(q));
        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [advisors, selectedTopicFilter, advisorSearchQuery]);

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

  // M18: Manejo de la lista dinámica de estudiantes con autocompletado por Código UPN
  const handleAddStudent = () => {
    setStudents((prev) => [...prev, { fullName: '', upnCode: '' }]);
  };

  const handleUpdateStudent = (
    index: number,
    field: keyof StudentParticipant,
    value: string
  ) => {
    setStudents((prev) => {
      const copy = [...prev];
      const nextVal = field === 'upnCode' ? value.toUpperCase() : value;
      copy[index] = { ...copy[index], [field]: nextVal };

      // Si se digita un código UPN, buscar en el directorio local
      if (field === 'upnCode' && nextVal.length >= 6) {
        const match = lookupStudentByUpnCode(nextVal);
        if (match && match.fullName && !copy[index].fullName) {
          copy[index].fullName = match.fullName;
        }
        // Si es el estudiante principal y curso/nrc están vacíos, autocompletar
        if (index === 0 && match) {
          if (!nrc && match.nrc) {
            setNrc(match.nrc);
          }
          if (match.course && (!selectedCourse || isCustomCourse)) {
            if (UPN_LAB_COURSES.includes(match.course)) {
              setSelectedCourse(match.course);
              setIsCustomCourse(false);
            } else {
              setSelectedCourse('__OTHER__');
              setIsCustomCourse(true);
              setCustomCourse(match.course);
            }
          }
        }
      }

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

  const finalCourse = isCustomCourse ? customCourse.trim() : selectedCourse.trim();

  // Envío de asesoría
  const handleSubmitAdvisory = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedDate || selectedBlockIds.length === 0) {
      showToast('Selecciona al menos un turno disponible en el calendario.', 'warning');
      return;
    }

    if (!projectName.trim() || !finalCourse || !nrc.trim()) {
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
      course: finalCourse,
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

      // M18: Guardar en localStorage para futuras visitas
      if (students[0]) {
        saveStudentProfile({
          fullName: students[0].fullName.trim(),
          upnCode: students[0].upnCode.trim().toUpperCase(),
          course: finalCourse,
          nrc: nrc.trim(),
        });
      }
      students.slice(1).forEach((s) => {
        if (s.upnCode && s.fullName) {
          saveStudentProfile({
            fullName: s.fullName.trim(),
            upnCode: s.upnCode.trim().toUpperCase(),
          });
        }
      });
      setHasRememberedProfile(true);

      // Limpiar selección
      setSelectedBlockIds([]);
      setSelectedDate(null);
      setSelectedSlotLabId(null);
      setIsFormOpen(false);
      // Prellenar búsqueda de asesorías con el código UPN del estudiante
      if (students[0]?.upnCode) {
        setSearchQuery(students[0].upnCode.trim().toUpperCase());
      }
      // Refrescar grilla
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al agendar la asesoría';
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // A1: Búsqueda y Cancelación de Asesorías del Estudiante
  // --------------------------------------------------------------------------
  const handleSearchAdvisories = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const q = (customQuery !== undefined ? customQuery : searchQuery).trim().toUpperCase();
    if (!q) {
      showToast('Ingresa tu Código UPN (N00...) o Código de Asesoría (ASE-...)', 'info');
      return;
    }

    setSearchingAdvisories(true);
    setHasSearched(true);
    try {
      const res = await apiClient.searchStudentAdvisories(q);
      setSearchResults(res.advisories || []);
      if (!res.advisories || res.advisories.length === 0) {
        showToast('No se encontraron asesorías con ese criterio.', 'info');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al buscar asesorías';
      showToast(msg, 'error');
      setSearchResults([]);
    } finally {
      setSearchingAdvisories(false);
    }
  };

  const handleOpenCancelModal = (adv: AdvisoryRequest) => {
    setAdvisoryToCancel(adv);
    if (searchQuery.trim().toUpperCase().startsWith('N00')) {
      setCancelUpnConfirm(searchQuery.trim().toUpperCase());
    } else if (students[0]?.upnCode) {
      setCancelUpnConfirm(students[0].upnCode.trim().toUpperCase());
    } else {
      setCancelUpnConfirm('');
    }
  };

  const handleConfirmCancelAdvisory = async () => {
    if (!advisoryToCancel) return;
    const upn = cancelUpnConfirm.trim().toUpperCase();
    if (!upn) {
      showToast('Debes ingresar tu Código UPN para confirmar la cancelación.', 'warning');
      return;
    }

    setCancelling(true);
    try {
      const res = await apiClient.cancelStudentAdvisory(advisoryToCancel.code, upn);
      showToast(res.message || 'Asesoría cancelada correctamente.', 'success');
      setAdvisoryToCancel(null);
      setCancelUpnConfirm('');
      // Refrescar lista de búsqueda y grilla semanal
      handleSearchAdvisories();
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cancelar la asesoría';
      showToast(msg, 'error');
    } finally {
      setCancelling(false);
    }
  };

  const renderAdvisoryStatusBadge = (status: string) => {
    if (status === 'PROGRAMADA') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Programada</span>
        </span>
      );
    }
    if (status === 'ATENDIDA') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-300 shadow-2xs">
          <Check className="w-3.5 h-3.5 text-blue-600" />
          <span>Atendida</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-rose-600 border border-slate-300 line-through shadow-2xs">
        <XCircle className="w-3.5 h-3.5 text-rose-500" />
        <span>Cancelada</span>
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* ===================================================================== */}
      {/* ENCABEZADO Y SELECTOR VISUAL DE LOS ASESORES CON FILTROS (M11)        */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200 text-xs font-semibold mb-2">
              <Users className="w-3.5 h-3.5 text-sky-600" />
              <span>Módulo 2 • Asesorías Técnicas Especializadas</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {activeTab === 'book'
                ? 'Solicitar Asesoría con Asistente o Docente'
                : 'Mis Asesorías y Cancelación de Turno'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl">
              {activeTab === 'book'
                ? 'Selecciona al asesor técnico especializado. La asesoría reservará automáticamente 1 cupo en el laboratorio asignado y enviará la invitación a su Google Calendar.'
                : 'Consulta tus asesorías registradas, descarga la invitación de calendario (.ics) o cancela un turno si no podrás asistir.'}
            </p>
          </div>

          {/* Selector de Pestañas Superior (A1) */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start md:self-auto border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('book')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'book'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-4 h-4 text-sky-600" />
              <span>Agendar Asesoría Académica</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('my-advisories');
                const q = searchQuery || (loadSavedStudentProfile()?.upnCode ?? '');
                if (q && !hasSearched) {
                  if (!searchQuery) setSearchQuery(q);
                  handleSearchAdvisories(undefined, q);
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'my-advisories'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Search className="w-4 h-4 text-sky-600" />
              <span>Mis Asesorías / Cancelar Turno</span>
            </button>
          </div>
        </div>

        {activeTab === 'book' && (
          <>
            {/* M11: Buscador y Píldoras de Filtro Rápido por Especialidad/Tema */}
            <div className="space-y-3 pt-1 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Buscador por texto */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={advisorSearchQuery}
                onChange={(e) => setAdvisorSearchQuery(e.target.value)}
                placeholder="Buscar asesor por nombre, especialidad o tema..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
              {advisorSearchQuery && (
                <button
                  type="button"
                  onClick={() => setAdvisorSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span>Filtro rápido:</span>
            </div>
          </div>

          {/* Píldoras de especialidades / temas */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {availableTopics.map((topic) => {
              const isSelected = selectedTopicFilter === topic;
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => setSelectedTopicFilter(topic)}
                  className={`px-3 py-1.5 rounded-full font-semibold transition-all shrink-0 cursor-pointer text-xs ${
                    isSelected
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {topic}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tarjetas de los Asesores Filtrados */}
        {filteredAdvisors.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs">
            No se encontraron asesores que coincidan con los filtros aplicados.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            {filteredAdvisors.map((adv) => {
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
                          Seleccionado
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
        )}
          </>
        )}
      </div>

      {/* ===================================================================== */}
      {/* PESTAÑA 2: MIS ASESORÍAS / CANCELAR TURNO (A1)                        */}
      {/* ===================================================================== */}
      {activeTab === 'my-advisories' && (
        <div className="space-y-6">
          {/* Barra de Búsqueda */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              Buscar Asesorías Registradas
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Ingresa tu Código UPN (ej. <span className="font-mono font-semibold">N00123456</span>) o
              el Código de Asesoría generado (ej.{' '}
              <span className="font-mono font-semibold">ASE-2026-0001</span>).
            </p>

            <form onSubmit={handleSearchAdvisories} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                  placeholder="Ej. N00123456 o ASE-2026-0001"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 font-mono focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={searchingAdvisories}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
              >
                {searchingAdvisories ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Buscando...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Buscar Asesorías</span>
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
                    Mostrando asesorías académicas asociadas a tu consulta
                  </span>
                )}
              </div>

              {searchResults.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">
                    No se encontraron asesorías registradas
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    No existe ninguna asesoría con el código o UPN ingresado. Verifica que el dato sea
                    correcto o solicita un nuevo turno en la pestaña &quot;Agendar Asesoría Académica&quot;.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {searchResults.map((adv) => {
                    const labCfg = LAB_MAP[adv.labId];
                    const isScheduled = adv.status === 'PROGRAMADA';

                    return (
                      <div
                        key={adv.id}
                        className={`bg-white rounded-2xl border p-5 shadow-xs transition-all flex flex-col justify-between ${
                          isScheduled
                            ? 'border-slate-200 hover:border-sky-400'
                            : 'border-slate-200 bg-slate-50/60 opacity-85'
                        }`}
                      >
                        <div className="space-y-3">
                          {/* Cabecera de la Asesoría */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-extrabold text-sm text-slate-900">
                                  {adv.code}
                                </span>
                                {adv.linkedReservationCode && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900">
                                    Cupo Lab: {adv.linkedReservationCode}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs font-semibold text-sky-800 block mt-0.5">
                                Asesor: {adv.advisorName}
                              </span>
                            </div>
                            {renderAdvisoryStatusBadge(adv.status)}
                          </div>

                          {/* Ficha rápida de detalles */}
                          <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 rounded-xl p-3 border border-slate-100">
                            <div>
                              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                Fecha y Bloques
                              </span>
                              <span className="font-semibold text-slate-800">
                                {adv.date}
                              </span>
                              <div className="text-[10px] font-mono text-sky-700 mt-0.5">
                                {adv.blockIds
                                  .map(
                                    (b) =>
                                      `${b} (${TIME_BLOCK_MAP[b]?.startTime || ''})`
                                  )
                                  .join(', ')}
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                Laboratorio Asignado
                              </span>
                              <span className="font-medium text-slate-800 truncate block">
                                {labCfg?.name || adv.labId}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                                NRC: {adv.nrc}
                              </span>
                            </div>
                          </div>

                          {/* Proyecto, Curso e Integrantes */}
                          <div className="text-xs space-y-1">
                            <div>
                              <strong className="text-slate-600 font-medium">Proyecto: </strong>
                              <span className="text-slate-900 font-semibold">
                                {adv.projectName}
                              </span>
                            </div>
                            <div>
                              <strong className="text-slate-600 font-medium">Curso: </strong>
                              <span className="text-slate-700">{adv.course}</span>
                            </div>
                            {adv.topicNotes && (
                              <div>
                                <strong className="text-slate-600 font-medium">
                                  Consulta / Tema:{' '}
                                </strong>
                                <span className="text-slate-700 italic">{adv.topicNotes}</span>
                              </div>
                            )}
                            {adv.students && adv.students.length > 0 && (
                              <div className="pt-1">
                                <strong className="text-slate-600 font-medium">
                                  Integrantes ({adv.students.length}):{' '}
                                </strong>
                                <span className="text-slate-800">
                                  {adv.students
                                    .map((s) => `${s.fullName} (${s.upnCode})`)
                                    .join(', ')}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Botones de Acción */}
                        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {/* Descarga de Calendario .ics */}
                            <a
                              href={adv.icsDownloadUrl || `/api/advisories/${adv.id}/ics`}
                              download={`Asesoria_${adv.code}.ics`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
                              title="Descargar invitación para Outlook o Calendar (.ics)"
                            >
                              <Download className="w-3.5 h-3.5 text-slate-500" />
                              <span>Descargar .ics</span>
                            </a>

                            {adv.calendarEventUrl && (
                              <a
                                href={adv.calendarEventUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-semibold transition-colors"
                                title="Abrir en Google Calendar"
                              >
                                <CalendarPlus className="w-3.5 h-3.5 text-sky-600" />
                                <ExternalLink className="w-3 h-3 text-sky-500" />
                              </a>
                            )}
                          </div>

                          {/* Botón Cancelar Asesoría si está PROGRAMADA */}
                          {isScheduled && (
                            <button
                              type="button"
                              onClick={() => handleOpenCancelModal(adv)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>Cancelar Asesoría</span>
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
      {/* PESTAÑA 1: AGENDAR ASESORÍA ACADÉMICA                                 */}
      {/* ===================================================================== */}
      {activeTab === 'book' && (
        <>

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
              {scheduleData
                ? `${scheduleData.weekStartDate} al ${scheduleData.weekEndDate}`
                : 'Cargando fechas...'}
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
            <RefreshCw
              className={`w-4 h-4 ${loadingSchedule ? 'animate-spin text-sky-500' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* AVISO INFORMATIVO DE HORARIO OFICIAL DE ASESORÍAS                     */}
      {/* ===================================================================== */}
      <div className="bg-sky-50/80 border border-sky-200 rounded-2xl p-4 sm:p-5 shadow-xs flex items-start sm:items-center gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 shadow-2xs">
          <Info className="w-5 h-5 text-sky-600" />
        </div>
        <div className="text-xs sm:text-sm text-sky-950 leading-relaxed">
          <strong className="font-extrabold text-sky-900 block sm:inline sm:mr-1">
            Horario de Asesorías:
          </strong>
          <span>
            Las asesorías académicas se reservan exclusivamente entre las <strong className="font-mono text-sky-900">09:10 y las 19:20</strong> (Bloques B2 a B7) en turnos donde se encuentran al menos 2 asistentes en simultáneo.
          </span>
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

        {/* M16: VISTA MÓVIL POR DÍA (< 640px) */}
        <div className="block sm:hidden p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Día seleccionado:
            </span>
            {scheduleData?.days[mobileDayIdx] && (
              <span className="text-xs font-extrabold text-sky-600">
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
                      ? 'bg-sky-600 text-white font-extrabold shadow-xs'
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
                const state = slot ? slot.state : 'NO_ATIENDE';
                const isSelected =
                  selectedDate === currentDay.date && selectedBlockIds.includes(tb.id);
                const isAvailable = state === 'DISPONIBLE';

                return (
                  <div
                    key={tb.id}
                    onClick={() => handleSlotClick(currentDay.date, tb.id, slot)}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-sky-100 border-sky-500 ring-2 ring-sky-500 shadow-sm cursor-pointer'
                        : isAvailable
                        ? 'bg-white hover:bg-emerald-50/60 border-slate-200 hover:border-emerald-400 cursor-pointer shadow-2xs'
                        : 'bg-slate-50/80 border-slate-200 cursor-not-allowed opacity-85'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center font-extrabold text-xs shrink-0 ${
                          isSelected ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {tb.id}
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-mono font-bold text-slate-800 block">
                          {tb.label}
                        </span>
                        {isAvailable && (
                          <p className="text-[11px] text-emerald-700 truncate mt-0.5">
                            {slot?.labName || 'Laboratorio UPN'}
                          </p>
                        )}
                        {state === 'OCUPADO' && (
                          <p className="text-[11px] text-amber-700 truncate mt-0.5">
                            {slot?.advisoryBooking?.projectName || 'Asesoría Agendada'}
                          </p>
                        )}
                        {state === 'LAB_SIN_CUPO' && (
                          <p className="text-[11px] text-rose-700 truncate mt-0.5">
                            Lab sin cupo ({slot?.labName})
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-600 text-white text-xs font-bold">
                          <Check className="w-3.5 h-3.5" />
                          <span>Elegido</span>
                        </span>
                      ) : state === 'DISPONIBLE' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-xs font-bold">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span>Disponible</span>
                        </span>
                      ) : state === 'OCUPADO' ? (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-bold">
                          Ocupado
                        </span>
                      ) : state === 'LAB_SIN_CUPO' ? (
                        <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[11px] font-bold">
                          Sin Cupo
                        </span>
                      ) : state === 'BLOQUEADO' ? (
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[11px] font-medium">
                          Bloqueado
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">No atiende</span>
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
                    <div className="font-extrabold text-xs sm:text-sm text-slate-900 leading-tight">
                      {tb.id}
                    </div>
                    <div className="text-[8.5px] sm:text-[9.5px] text-slate-500 font-mono leading-tight mt-0.5 whitespace-nowrap">
                      {tb.label}
                    </div>
                  </td>

                  {/* Celdas de Días */}
                  {scheduleData?.days.map((day) => {
                    const slotKey = `${day.date}_${tb.id}`;
                    const slot = slotsMap.get(slotKey);
                    const state = slot ? slot.state : 'NO_ATIENDE';
                    const isSelected =
                      selectedDate === day.date && selectedBlockIds.includes(tb.id);
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
                            <div
                              className="text-[8px] sm:text-[8.5px] text-amber-700 truncate mt-0.5"
                              title={slot?.advisoryBooking?.projectName}
                            >
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
                <strong className="text-sky-600">{selectedBlockIds.sort().join(', ')}</strong> •
                Laboratorio asignado:{' '}
                <strong className="text-slate-800">
                  {(selectedSlotLabId && LAB_MAP[selectedSlotLabId as keyof typeof LAB_MAP]?.name) ||
                    'Laboratorio UPN'}
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
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Banner M18: Datos recordados */}
          {hasRememberedProfile && (
            <div className="mt-4 p-3 rounded-xl bg-sky-50/70 border border-sky-200 flex items-center justify-between text-xs text-sky-950">
              <div className="flex items-center gap-2">
                <BookmarkCheck className="w-4 h-4 text-sky-600 shrink-0" />
                <span>Tus datos de estudiante han sido recordados en este navegador.</span>
              </div>
              <button
                type="button"
                onClick={handleForgetProfile}
                className="text-[11px] font-bold text-sky-800 hover:text-sky-950 underline cursor-pointer shrink-0 ml-2"
              >
                Olvidar datos
              </button>
            </div>
          )}

          {/* Aviso informativo de doble impacto (Asesoría + Cupo en Lab) */}
          <div className="mt-4 p-4 rounded-2xl bg-sky-50 border border-sky-200 flex items-start gap-3">
            <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
            <div className="text-xs text-sky-900 leading-relaxed">
              <strong>Importante:</strong> Al confirmar esta asesoría, el sistema registrará de
              forma automática un cupo de reserva a tu nombre en el laboratorio asignado (
              <strong>
                {selectedSlotLabId && LAB_MAP[selectedSlotLabId as keyof typeof LAB_MAP]?.name}
              </strong>
              ) y enviará una invitación oficial al Google Calendar del asesor y de tu equipo.
            </div>
          </div>

          <form onSubmit={handleSubmitAdvisory} className="mt-6 space-y-6">
            {/* Campos de Proyecto y Curso M11 */}
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

              {/* M11: Selector de Curso con catálogo oficial */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Curso <span className="text-rose-500">*</span>
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none cursor-pointer"
                  >
                    {UPN_LAB_COURSES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="__OTHER__">+ Otro curso...</option>
                  </select>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      required
                      value={customCourse}
                      onChange={(e) => setCustomCourse(e.target.value)}
                      placeholder="Escribe el nombre del curso"
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
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

            {/* Sección de Estudiantes con Autocompletado M18 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-sky-600" />
                    <span>Estudiantes Participantes ({students.length})</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Ingresa a los integrantes que asistirán a la sesión técnica (autocompleta por
                    código UPN).
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
                      value={st.upnCode}
                      onChange={(e) => handleUpdateStudent(idx, 'upnCode', e.target.value)}
                      placeholder="Código UPN (N00...)"
                      className="w-full sm:w-44 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none font-mono"
                    />
                    <input
                      type="text"
                      required
                      value={st.fullName}
                      onChange={(e) => handleUpdateStudent(idx, 'fullName', e.target.value)}
                      placeholder="Nombres y Apellidos del Estudiante"
                      className="flex-1 w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 focus:outline-none"
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
                className="w-full sm:w-auto px-5 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
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
        </>
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
                Se ha enviado la invitación al Google Calendar del asesor y se ha bloqueado 1 cupo
                en el laboratorio.
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

      {/* ===================================================================== */}
      {/* MODAL DE CONFIRMACIÓN PARA CANCELAR ASESORÍA (A1)                     */}
      {/* ===================================================================== */}
      {advisoryToCancel && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ¿Cancelar Asesoría Académica?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Esta acción liberará el cupo de laboratorio reservado y cancelará la cita agendada.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Asesoría:</span>
                <span className="font-mono font-bold text-slate-900">
                  {advisoryToCancel.code}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Asesor:</span>
                <span className="font-semibold text-slate-800">
                  {advisoryToCancel.advisorName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fecha y Bloques:</span>
                <span className="font-semibold text-slate-800">
                  {advisoryToCancel.date} ({advisoryToCancel.blockIds.join(', ')})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Proyecto:</span>
                <span className="text-slate-800 truncate max-w-[200px]">
                  {advisoryToCancel.projectName}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Ingresa tu Código UPN de Estudiante para confirmar <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={cancelUpnConfirm}
                onChange={(e) => setCancelUpnConfirm(e.target.value.toUpperCase())}
                placeholder="Ej. N00123456"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-900 focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Por seguridad, solo un estudiante registrado en la asesoría puede cancelarla.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setAdvisoryToCancel(null);
                  setCancelUpnConfirm('');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleConfirmCancelAdvisory}
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
                    <span>Sí, Cancelar Asesoría</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
