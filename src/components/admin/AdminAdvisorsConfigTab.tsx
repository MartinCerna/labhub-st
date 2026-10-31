'use client';

import React, { useState, useEffect } from 'react';
import {
  AdminDashboardSummary,
  AdminSessionUser,
  AdvisorProfile,
  AdvisorAvailabilitySlot,
  DayOfWeek,
  TimeBlockId,
  LabId,
} from '@/types/labhub';
import { TIME_BLOCKS, DAYS_OF_WEEK, LAB_MAP } from '@/constants/schedule';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/shared/ToastProvider';
import {
  UserCheck,
  Calendar,
  Lock,
  Mail,
  KeyRound,
  Save,
  Trash2,
  Plus,
  GraduationCap,
  X,
  Tag,
  ShieldCheck,
  ShieldAlert,
  Eye,
  UserPlus,
  Briefcase,
  BookOpen,
} from 'lucide-react';

interface AdminAdvisorsConfigTabProps {
  dashboard: AdminDashboardSummary;
  currentUser?: AdminSessionUser;
  onRefresh: () => Promise<void>;
}

export function AdminAdvisorsConfigTab({
  dashboard,
  currentUser,
  onRefresh,
}: AdminAdvisorsConfigTabProps) {
  const { showToast } = useToast();

  const advisors = dashboard.advisors;
  const isCoordinator = currentUser?.role === 'COORDINADOR';

  // Inicializar con advisorId del usuario logueado o primer asesor
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>(
    currentUser?.advisorId || advisors[0]?.id || 'adv-1'
  );

  const selectedAdvisor =
    advisors.find((a) => a.id === selectedAdvisorId) || advisors[0];

  const canEditCurrent =
    isCoordinator || (currentUser?.advisorId && currentUser.advisorId === selectedAdvisorId);

  // Estado del perfil editable
  const [fullName, setFullName] = useState('');
  const [career, setCareer] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [advisoryTopics, setAdvisoryTopics] = useState<string[]>([]);
  const [newTopicInput, setNewTopicInput] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Estado de la disponibilidad semanal (copia editable)
  const [availability, setAvailability] = useState<AdvisorAvailabilitySlot[]>([]);
  const [savingAvailability, setSavingAvailability] = useState(false);

  // Estado de nuevo bloqueo por fecha
  const [blockDate, setBlockDate] = useState('');
  const [blockTimeBlock, setBlockTimeBlock] = useState<TimeBlockId>('B1');
  const [blockReason, setBlockReason] = useState('');
  const [savingBlock, setSavingBlock] = useState(false);

  // Modal para crear nuevo usuario / asesor
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createFullName, setCreateFullName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<'ASISTENTE' | 'COORDINADOR'>('ASISTENTE');
  const [createRoleTitle, setCreateRoleTitle] = useState('Administrador de Laboratorio');
  const [createCareer, setCreateCareer] = useState('');
  const [createSpecialty, setCreateSpecialty] = useState('');
  const [createTopicsInput, setCreateTopicsInput] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);

  // Sincronizar datos al cambiar de asesor seleccionado
  useEffect(() => {
    if (selectedAdvisor) {
      setFullName(selectedAdvisor.fullName || '');
      setCareer(selectedAdvisor.career || '');
      setRoleTitle(selectedAdvisor.roleTitle || '');
      setSpecialty(selectedAdvisor.specialty || '');
      setAdvisoryTopics(selectedAdvisor.advisoryTopics || []);
      setNewTopicInput('');
      setEmail(selectedAdvisor.email || '');
      setNewPassword('');
      setAvailability(selectedAdvisor.weeklyAvailability || []);
    }
  }, [selectedAdvisor]);

  // Manejo de tags de temas de asesoría
  const handleAddTopic = () => {
    const trimmed = newTopicInput.trim();
    if (!trimmed) return;
    if (advisoryTopics.includes(trimmed)) {
      showToast('Ese tema ya está en la lista.', 'info');
      return;
    }
    setAdvisoryTopics([...advisoryTopics, trimmed]);
    setNewTopicInput('');
  };

  const handleRemoveTopic = (topicToRemove: string) => {
    setAdvisoryTopics(advisoryTopics.filter((t) => t !== topicToRemove));
  };

  // Guardar datos de perfil
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditCurrent) {
      showToast('No tienes permisos para modificar el perfil de este asesor.', 'warning');
      return;
    }

    if (!fullName.trim() || !email.trim()) {
      showToast('Nombre y correo de Google Calendar son obligatorios.', 'warning');
      return;
    }

    try {
      setSavingProfile(true);
      await apiClient.updateAdvisorProfile(selectedAdvisorId, {
        fullName: fullName.trim(),
        career: career.trim(),
        roleTitle: roleTitle.trim(),
        specialty: specialty.trim(),
        advisoryTopics: advisoryTopics,
        email: email.trim(),
        ...(newPassword.trim() ? { newPassword: newPassword.trim() } : {}),
      });
      showToast('Datos de la tarjeta de asesoría actualizados exitosamente.', 'success');
      setNewPassword('');
      await onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar el perfil del asesor.';
      showToast(msg, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // Alternar celda de disponibilidad en la matriz
  // Ciclo: Sin atención -> automatizacion -> electronica -> mecatronica -> Sin atención
  const handleToggleCell = (dayOfWeek: DayOfWeek, blockId: TimeBlockId) => {
    if (!canEditCurrent) {
      showToast('No tienes permisos para modificar el horario de este asesor.', 'warning');
      return;
    }

    const existingIndex = availability.findIndex(
      (slot) => slot.dayOfWeek === dayOfWeek && slot.blockId === blockId
    );

    if (existingIndex === -1) {
      setAvailability([...availability, { dayOfWeek, blockId, labId: 'automatizacion' }]);
    } else {
      const currentLab = availability[existingIndex].labId;
      if (currentLab === 'automatizacion') {
        const next = [...availability];
        next[existingIndex] = { dayOfWeek, blockId, labId: 'electronica' };
        setAvailability(next);
      } else if (currentLab === 'electronica') {
        const next = [...availability];
        next[existingIndex] = { dayOfWeek, blockId, labId: 'mecatronica' };
        setAvailability(next);
      } else {
        setAvailability(
          availability.filter(
            (slot) => !(slot.dayOfWeek === dayOfWeek && slot.blockId === blockId)
          )
        );
      }
    }
  };

  // Guardar matriz de disponibilidad
  const handleSaveAvailability = async () => {
    if (!canEditCurrent) {
      showToast('No tienes permisos para modificar el horario de este asesor.', 'warning');
      return;
    }

    try {
      setSavingAvailability(true);
      await apiClient.updateAdvisorProfile(selectedAdvisorId, {
        weeklyAvailability: availability,
      });
      showToast(
        `Horario semanal de atención actualizado (${availability.length} bloques configurados).`,
        'success'
      );
      await onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar horario de atención.';
      showToast(msg, 'error');
    } finally {
      setSavingAvailability(false);
    }
  };

  // Crear bloqueo extraordinario para este asesor
  const handleCreateAdvisorBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditCurrent) {
      showToast('No tienes permisos para bloquear turnos de este asesor.', 'warning');
      return;
    }

    if (!blockDate || !blockReason.trim()) {
      showToast('Ingresa fecha y motivo del bloqueo.', 'warning');
      return;
    }

    try {
      setSavingBlock(true);
      await apiClient.createSlotBlock({
        targetType: 'ADVISOR',
        targetId: selectedAdvisorId,
        date: blockDate,
        blockId: blockTimeBlock,
        reason: blockReason.trim(),
      });
      showToast('Bloqueo de asesor registrado correctamente.', 'success');
      setBlockReason('');
      await onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al bloquear turno del asesor.';
      showToast(msg, 'error');
    } finally {
      setSavingBlock(false);
    }
  };

  // Eliminar bloqueo del asesor
  const handleDeleteAdvisorBlock = async (id: string) => {
    if (!canEditCurrent) {
      showToast('No tienes permisos para desbloquear turnos de este asesor.', 'warning');
      return;
    }

    if (!confirm('¿Deseas desbloquear este turno del asesor?')) return;
    try {
      await apiClient.deleteSlotBlock(id);
      showToast('Bloqueo eliminado exitosamente.', 'success');
      await onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar bloqueo.';
      showToast(msg, 'error');
    }
  };

  // Registro de nuevo usuario (solo Coordinador)
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCoordinator) {
      showToast('Solo un Administrador Total puede crear usuarios.', 'error');
      return;
    }

    if (!createFullName.trim() || !createEmail.trim() || !createPassword.trim()) {
      showToast('Nombre, correo y contraseña inicial son obligatorios.', 'warning');
      return;
    }

    const topics = createTopicsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      setCreatingUser(true);
      const res = await apiClient.createAdvisorAndUser({
        fullName: createFullName.trim(),
        email: createEmail.trim(),
        password: createPassword.trim(),
        role: createRole,
        roleTitle: createRoleTitle.trim(),
        career: createCareer.trim(),
        specialty: createSpecialty.trim(),
        advisoryTopics: topics,
      });

      showToast(`¡Usuario ${res.user.fullName} creado exitosamente!`, 'success');
      setShowCreateModal(false);
      // Reset form
      setCreateFullName('');
      setCreateEmail('');
      setCreatePassword('');
      setCreateRole('ASISTENTE');
      setCreateRoleTitle('Administrador de Laboratorio');
      setCreateCareer('');
      setCreateSpecialty('');
      setCreateTopicsInput('');
      await onRefresh();
      if (res.advisor?.id) {
        setSelectedAdvisorId(res.advisor.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar nuevo usuario.';
      showToast(msg, 'error');
    } finally {
      setCreatingUser(false);
    }
  };

  // Bloqueos de este asesor
  const advisorBlocks = dashboard.slotBlocks.filter(
    (b) => b.targetType === 'ADVISOR' && b.targetId === selectedAdvisorId
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* BARRA SUPERIOR: TÍTULO Y BOTÓN DE REGISTRO PARA COORDINADOR */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {isCoordinator
                ? 'Gestión de Tarjetas de Asesoría & Usuarios del Sistema'
                : 'Mi Tarjeta de Asesoría & Horario Semanal'}
            </h2>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300">
              {isCoordinator ? 'Administrador Total' : 'Administrador Estándar'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isCoordinator
              ? 'Configura la información pública que ven los alumnos al solicitar asesoría, gestiona los horarios y crea nuevos accesos al sistema.'
              : 'Personaliza los datos visibles de tu tarjeta de asesoría (especialidad, carrera, temas) y define tus bloques semanales de atención.'}
          </p>
        </div>

        {isCoordinator && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-md shadow-amber-600/20 transition-all cursor-pointer shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Registrar Nuevo Usuario / Administrador</span>
          </button>
        )}
      </div>

      {/* SELECTOR DE ASESORES */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {isCoordinator
              ? `Seleccionar Asesor / Administrador (${advisors.length})`
              : 'Equipo de Laboratorio (Tu perfil está activo)'}
          </span>
          {!canEditCurrent && (
            <span className="text-xs text-amber-600 flex items-center gap-1 font-medium">
              <ShieldAlert className="w-3.5 h-3.5" />
              Modo Solo Lectura (Solo puedes editar tu propio perfil)
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {advisors.map((adv) => {
            const isSelected = adv.id === selectedAdvisorId;
            const assignedSlotsCount = adv.weeklyAvailability?.length || 0;
            const isOwnCard = currentUser?.advisorId === adv.id;

            return (
              <button
                key={adv.id}
                type="button"
                onClick={() => setSelectedAdvisorId(adv.id)}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                  isSelected
                    ? 'bg-amber-500/10 border-amber-500 shadow-md shadow-amber-500/10 ring-2 ring-amber-500/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-xs"
                    style={{ backgroundColor: adv.badgeColor || '#f59e0b' }}
                  >
                    {adv.avatarInitials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-xs text-slate-900 dark:text-white truncate">
                        {adv.fullName}
                      </p>
                      {isOwnCard && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-sm bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 shrink-0">
                          TÚ
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{adv.career || adv.specialty}</p>
                    <span className="inline-block mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-950/60 px-2 py-0.5 rounded-full">
                      {assignedSlotsCount} bloques semanales
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* AVISO DE MODO LECTURA SI ES ASISTENTE Y NO ES SU TARJETA */}
      {!canEditCurrent && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <p>
              Estás visualizando la configuración de <strong>{selectedAdvisor.fullName}</strong> en modo solo lectura. Como Administrador Estándar, solo tienes permisos para modificar tu propia tarjeta de asesoría y tu horario.
            </p>
          </div>
          {currentUser?.advisorId && (
            <button
              type="button"
              onClick={() => setSelectedAdvisorId(currentUser.advisorId!)}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shrink-0 cursor-pointer"
            >
              Ir a Mi Perfil
            </button>
          )}
        </div>
      )}

      {/* SECCIÓN 1: FORMULARIO DE PERFIL Y VISTA PREVIA EN VIVO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Formulario Editable (8 columnas en lg) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Edición de Datos de la Tarjeta ({selectedAdvisor.fullName})
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-400">
              ID: {selectedAdvisor.id}
            </span>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 1. Nombre Completo */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1.5">
                  1. Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  disabled={!canEditCurrent}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="ej. Mg. Martín Aarón León Cerna"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
                />
              </div>

              {/* 2. Carrera Profesional */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-amber-500" />
                  2. Carrera Profesional
                </label>
                <input
                  type="text"
                  disabled={!canEditCurrent}
                  value={career}
                  onChange={(e) => setCareer(e.target.value)}
                  placeholder="ej. Ingeniería Mecatrónica"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
                />
              </div>

              {/* 3. Cargo / Rol Visible */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  3. Cargo / Rol Visible
                </label>
                <input
                  type="text"
                  disabled={!canEditCurrent}
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="ej. Administrador de Laboratorio / Coordinador"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
                />
              </div>

              {/* 4. Especialidad Principal */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1.5">
                  4. Especialidad Principal
                </label>
                <input
                  type="text"
                  required
                  disabled={!canEditCurrent}
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder="ej. Sistemas Embebidos, Microcontroladores e Instrumentación"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
                />
              </div>

              {/* 5. Temas en los que puede dar asesoría (Chips interactivos) */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-amber-500" />
                  5. Temas en los que puede brindar asesoría
                </label>

                {canEditCurrent && (
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newTopicInput}
                      onChange={(e) => setNewTopicInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTopic();
                        }
                      }}
                      placeholder="Escribe un tema (ej. Arduino, PLCs, Diseño PCB) y presiona Enter"
                      className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddTopic}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Añadir Tema
                    </button>
                  </div>
                )}

                {/* Chips de temas */}
                <div className="flex flex-wrap gap-1.5 min-h-[34px] p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  {advisoryTopics.length === 0 ? (
                    <span className="text-[11px] text-slate-400 italic">
                      No se han agregado temas específicos aún.
                    </span>
                  ) : (
                    advisoryTopics.map((topic, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
                      >
                        <span>{topic}</span>
                        {canEditCurrent && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTopic(topic)}
                            className="p-0.5 hover:bg-amber-200 dark:hover:bg-amber-800 rounded-md transition-colors cursor-pointer"
                            title="Eliminar tema"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* 6. Correo Electrónico (Login y Google Calendar) */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-amber-500" />
                  6. Correo Electrónico (Google Calendar)
                </label>
                <input
                  type="email"
                  required
                  disabled={!canEditCurrent}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ej. martin.cernaa@gmail.com"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
                />
              </div>

              {/* 7. Cambiar Contraseña */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  7. Cambiar Contraseña de Acceso
                </label>
                <input
                  type="password"
                  disabled={!canEditCurrent}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Dejar en blanco para conservar la actual"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
                />
              </div>
            </div>

            {canEditCurrent && (
              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {savingProfile ? 'Guardando...' : 'Guardar Cambios de Tarjeta'}
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Vista Previa en Vivo de la Tarjeta (5 columnas en lg) */}
        <div className="lg:col-span-5 space-y-3 sticky top-24">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <Eye className="w-4 h-4 text-sky-500" />
            <span>Vista Previa en Vivo para Estudiantes</span>
          </div>

          {/* Tarjeta idéntica a la del portal estudiantil /asesorias */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-sky-400 dark:border-sky-500/60 p-5 shadow-lg shadow-sky-500/5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                Así te ven los alumnos en /asesorias
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500 text-white">
                Activo
              </span>
            </div>

            {/* Cabecera del Asesor */}
            <div className="flex items-start gap-3.5">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-base text-white shadow-xs shrink-0"
                style={{ backgroundColor: selectedAdvisor.badgeColor || '#0284c7' }}
              >
                {selectedAdvisor.avatarInitials}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                  {fullName.trim() || 'Nombre del Asesor'}
                </h4>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                  {roleTitle.trim() || 'Administrador de Laboratorio'}
                </p>

                {career.trim() && (
                  <div className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-900/60">
                    <GraduationCap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>{career.trim()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Especialidad */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Especialidad Principal:
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
                {specialty.trim() || 'Sin especialidad configurada'}
              </p>
            </div>

            {/* Temas de Asesoría */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                Temas en los que brinda asesoría:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {advisoryTopics.length > 0 ? (
                  advisoryTopics.map((topic, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                    >
                      {topic}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-slate-400 italic">
                    Sin temas registrados.
                  </span>
                )}
              </div>
            </div>

            {/* Correo y Notificación Calendar */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
              <div className="flex items-center gap-1.5 truncate">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate font-mono">{email.trim() || 'correo@upn.pe'}</span>
              </div>
              <span className="text-[10px] text-emerald-600 font-medium shrink-0">
                Google Calendar Conectado
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: EDITOR MATRICIAL DE HORARIOS DE ATENCIÓN */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-500" />
              Editor Matricial de Horarios Semanales ({selectedAdvisor.fullName})
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Haz clic en cualquier celda para alternar el laboratorio asignado para atención:{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Sin Atención → Automatización → Electrónica → Mecatrónica → Sin Atención
              </span>.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Total asignado: <strong className="text-amber-600">{availability.length} bloques</strong>
            </span>
            {canEditCurrent && (
              <button
                type="button"
                disabled={savingAvailability}
                onClick={handleSaveAvailability}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {savingAvailability ? 'Guardando Horario...' : 'Guardar Horario Semanal'}
              </button>
            )}
          </div>
        </div>

        {/* Leyenda interactiva */}
        <div className="flex items-center gap-3 text-xs flex-wrap py-1">
          <span className="text-[11px] font-bold uppercase text-slate-400">Leyenda:</span>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700" />
            <span className="text-slate-600 dark:text-slate-400">Sin atención</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded bg-amber-500 text-white" />
            <span className="font-medium text-amber-700 dark:text-amber-400">Automatización</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded bg-sky-500 text-white" />
            <span className="font-medium text-sky-700 dark:text-sky-400">Electrónica</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded bg-emerald-500 text-white" />
            <span className="font-medium text-emerald-700 dark:text-emerald-400">Mecatrónica</span>
          </div>
        </div>

        {/* Matriz 9 bloques x 6 días */}
        <div className="overflow-x-auto pb-2">
          <div className="min-w-[720px]">
            {/* Cabecera de Días */}
            <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">
              <div className="py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">Bloque Horario</div>
              {DAYS_OF_WEEK.map((d) => (
                <div key={d.id} className="py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  {d.name}
                </div>
              ))}
            </div>

            {/* Filas */}
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

                  {/* 6 Días */}
                  {DAYS_OF_WEEK.map((d) => {
                    const slot = availability.find(
                      (s) => s.dayOfWeek === d.id && s.blockId === tb.id
                    );

                    let bgClass =
                      'bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-400';
                    let label = 'Libre';
                    let labShort = '';

                    if (slot) {
                      if (slot.labId === 'automatizacion') {
                        bgClass =
                          'bg-amber-500 hover:bg-amber-600 border-amber-600 text-white shadow-xs';
                        label = 'Automatización';
                        labShort = 'AUT';
                      } else if (slot.labId === 'electronica') {
                        bgClass =
                          'bg-sky-500 hover:bg-sky-600 border-sky-600 text-white shadow-xs';
                        label = 'Electrónica';
                        labShort = 'ELE';
                      } else if (slot.labId === 'mecatronica') {
                        bgClass =
                          'bg-emerald-500 hover:bg-emerald-600 border-emerald-600 text-white shadow-xs';
                        label = 'Mecatrónica';
                        labShort = 'MEC';
                      }
                    }

                    return (
                      <button
                        key={d.id}
                        type="button"
                        disabled={!canEditCurrent}
                        onClick={() => handleToggleCell(d.id, tb.id)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center justify-center min-h-[58px] select-none ${bgClass} ${
                          canEditCurrent ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'
                        }`}
                        title={
                          canEditCurrent
                            ? `Clic para alternar atención: ${d.name} ${tb.label}`
                            : 'Modo lectura'
                        }
                      >
                        {slot ? (
                          <>
                            <span className="text-[11px] font-bold leading-tight truncate">
                              {labShort}
                            </span>
                            <span className="text-[9px] opacity-90 truncate">{label}</span>
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-normal">Sin aten.</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 3: BLOQUEO DE TURNOS PUNTUALES DEL ASESOR */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
        <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-rose-500" />
            Bloqueos Extraordinarios por Fecha ({selectedAdvisor.fullName})
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Si el asesor tiene una reunión de coordinación, capacitación o ausencia programada en una fecha específica, puedes bloquear su turno aquí sin afectar su horario semanal base.
          </p>
        </div>

        {/* Formulario de bloqueo */}
        {canEditCurrent && (
          <form onSubmit={handleCreateAdvisorBlock} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Fecha (YYYY-MM-DD)
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
                placeholder="ej. Reunión de claustro docente"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={savingBlock}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {savingBlock ? 'Bloqueando...' : 'Bloquear Turno'}
              </button>
            </div>
          </form>
        )}

        {/* Lista de bloqueos de este asesor */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Bloqueos Registrados ({advisorBlocks.length}):
          </h4>

          {advisorBlocks.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl">
              El asesor no tiene bloqueos de turno extraordinarios.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {advisorBlocks.map((blk) => (
                <div
                  key={blk.id}
                  className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-semibold text-rose-900 dark:text-rose-200">
                      {blk.reason}
                    </p>
                    <p className="text-[11px] text-rose-700 dark:text-rose-400">
                      Fecha: {blk.date} • Bloque {blk.blockId}
                    </p>
                  </div>
                  {canEditCurrent && (
                    <button
                      type="button"
                      onClick={() => handleDeleteAdvisorBlock(blk.id)}
                      className="p-1.5 text-rose-400 hover:text-rose-700 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                      title="Eliminar bloqueo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL: REGISTRAR NUEVO USUARIO / ADMINISTRADOR (SOLO COORDINADOR) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Registrar Nuevo Usuario / Administrador
                  </h3>
                  <p className="text-xs text-slate-500">
                    Crea una cuenta de acceso al panel y su correspondiente tarjeta de asesoría técnica.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={createFullName}
                  onChange={(e) => setCreateFullName(e.target.value)}
                  placeholder="ej. Ing. Fernando Soto"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Correo Electrónico (Login & Calendar) *
                  </label>
                  <input
                    type="email"
                    required
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="ej. fernando.soto@upn.pe"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Contraseña Inicial *
                  </label>
                  <input
                    type="password"
                    required
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Rol en el Sistema *
                  </label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value as 'ASISTENTE' | 'COORDINADOR')}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="ASISTENTE">ASISTENTE (Administrador Estándar)</option>
                    <option value="COORDINADOR">COORDINADOR (Administrador Total)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Cargo / Rol Visible
                  </label>
                  <input
                    type="text"
                    value={createRoleTitle}
                    onChange={(e) => setCreateRoleTitle(e.target.value)}
                    placeholder="ej. Administrador de Laboratorio"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Carrera Profesional
                  </label>
                  <input
                    type="text"
                    value={createCareer}
                    onChange={(e) => setCreateCareer(e.target.value)}
                    placeholder="ej. Ingeniería Electrónica"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Especialidad Principal
                  </label>
                  <input
                    type="text"
                    value={createSpecialty}
                    onChange={(e) => setCreateSpecialty(e.target.value)}
                    placeholder="ej. Telecomunicaciones, IoT y Redes"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                  Temas de Asesoría (separados por coma)
                </label>
                <input
                  type="text"
                  value={createTopicsInput}
                  onChange={(e) => setCreateTopicsInput(e.target.value)}
                  placeholder="ej. Antenas, Microondas, Redes Industriales, Fibra Óptica"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  {creatingUser ? 'Registrando...' : 'Crear Usuario y Asesor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
