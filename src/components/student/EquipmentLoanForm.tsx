'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Wrench,
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  Printer,
  Clock,
  User,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  FileText,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  LabId,
  LaboratoryConfig,
  AdvisorProfile,
  EquipmentLoanItem,
  LoanGroupMember,
  CreateEquipmentLoanPayload,
  EquipmentLoan,
} from '@/types/labhub';
import {
  DEFAULT_LABORATORIES,
  ACADEMIC_CYCLES,
  DEFAULT_TEACHERS_CATALOG,
  LAB_EQUIPMENT_CATALOG,
  UPN_LAB_COURSES,
} from '@/constants/schedule';
import {
  loadSavedStudentProfile,
  saveStudentProfile,
  lookupStudentByUpnCode,
} from '@/lib/student-profile-storage';
import { useToast } from '@/components/shared/ToastProvider';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SignatureCanvas } from '@/components/shared/SignatureCanvas';

interface EquipmentLoanFormProps {
  initialCode?: string;
  mode?: 'form' | 'lookup';
}

interface EquipmentLoanItemRow extends EquipmentLoanItem {
  isManual?: boolean;
}

export function LoanStatusBadge({ status }: { status: EquipmentLoan['status'] }) {
  if (status === 'EN_USO') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-300">
        <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
        En Préstamo Activo (Entregado al Alumno)
      </span>
    );
  }
  if (status === 'DEVUELTO' || status === 'ENTREGADO') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        Devuelto al Laboratorio
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300">
      <Clock className="w-3.5 h-3.5 text-amber-600" />
      Pendiente de Entrega en Laboratorio
    </span>
  );
}

export function EquipmentLoanForm({
  initialCode,
  mode = 'form',
}: EquipmentLoanFormProps) {
  const { showToast } = useToast();

  // Catálogos
  const [labs, setLabs] = useState<LaboratoryConfig[]>(DEFAULT_LABORATORIES);
  const [teachers, setTeachers] = useState<string[]>(DEFAULT_TEACHERS_CATALOG);
  const [advisors, setAdvisors] = useState<AdvisorProfile[]>([]);

  // Campos superiores del formulario
  const [labId, setLabId] = useState<LabId>('automatizacion');
  const [selectedTeacher, setSelectedTeacher] = useState<string>(DEFAULT_TEACHERS_CATALOG[0] || '');
  const [customTeacher, setCustomTeacher] = useState<string>('');
  const [isCustomTeacher, setIsCustomTeacher] = useState<boolean>(false);
  const [cycle, setCycle] = useState<string>(ACADEMIC_CYCLES[4] || 'Ciclo V');
  const [courseProgram, setCourseProgram] = useState<string>('');
  const [attendedByAdvisorId, setAttendedByAdvisorId] = useState<string>('');

  // Tabla dinámica de Equipos (3 columnas) — Base: 1 fila
  const [items, setItems] = useState<EquipmentLoanItemRow[]>([
    { quantity: 1, equipmentName: '', upnCode: '', isManual: false },
  ]);

  // Sección Integrantes del Grupo (2 columnas) — Base: 1 fila
  const [groupMembers, setGroupMembers] = useState<LoanGroupMember[]>([
    { fullName: '', nrc: '' },
  ]);

  // Sección Solicitante Responsable + Firma
  const [responsibleName, setResponsibleName] = useState<string>('');
  const [responsibleUpnCode, setResponsibleUpnCode] = useState<string>('');
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>('');

  // Estados de envío y préstamo creado
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [createdLoan, setCreatedLoan] = useState<EquipmentLoan | null>(null);

  // Estados de consulta por ID
  const [searchCode, setSearchCode] = useState<string>(initialCode || '');
  const [searching, setSearching] = useState<boolean>(false);
  const [searchedLoan, setSearchedLoan] = useState<EquipmentLoan | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // M18: Autoguardado y precarga de datos del estudiante (localStorage)
  useEffect(() => {
    const profile = loadSavedStudentProfile();
    if (profile) {
      if (profile.fullName) {
        setResponsibleName((prev) => prev || profile.fullName);
        setGroupMembers((prev) => {
          if (prev.length > 0 && !prev[0].fullName) {
            return [{ fullName: profile.fullName, nrc: profile.nrc || prev[0].nrc || '' }, ...prev.slice(1)];
          }
          return prev;
        });
      }
      if (profile.upnCode) {
        setResponsibleUpnCode((prev) => prev || profile.upnCode);
      }
      if (profile.nrc) {
        setGroupMembers((prev) => {
          if (prev.length > 0 && !prev[0].nrc) {
            return [{ fullName: prev[0].fullName || profile.fullName, nrc: profile.nrc || '' }, ...prev.slice(1)];
          }
          return prev;
        });
      }
      if (profile.course) {
        setCourseProgram((prev) => prev || profile.course || '');
      }
      if (profile.cycle) {
        setCycle((prev) => prev || profile.cycle || 'Ciclo V');
      }
    }
  }, []);

  // Carga inicial del catálogo
  useEffect(() => {
    apiClient
      .getCatalog()
      .then((cat) => {
        if (cat.labs && cat.labs.length > 0) setLabs(cat.labs);
        if (cat.teachers && cat.teachers.length > 0) {
          setTeachers(cat.teachers);
          setSelectedTeacher(cat.teachers[0]);
        }
        if (cat.advisors && cat.advisors.length > 0) {
          setAdvisors(cat.advisors);
          setAttendedByAdvisorId(cat.advisors[0].id);
        }
      })
      .catch((err) => {
        console.warn('Error al cargar catálogo para préstamos:', err);
      });
  }, []);

  // Si se provee initialCode, buscarlo de inmediato
  useEffect(() => {
    if (initialCode) {
      handleSearchByCode(initialCode);
    }
  }, [initialCode]);

  // --------------------------------------------------------------------------
  // Manejo de Filas Dinámicas: Equipos y Materiales
  // --------------------------------------------------------------------------
  const handleAddItem = () => {
    setItems((prev) => [...prev, { quantity: 1, equipmentName: '', upnCode: '', isManual: false }]);
  };

  const handleUpdateItem = (
    index: number,
    field: keyof EquipmentLoanItemRow,
    value: string | number | boolean
  ) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleCatalogSelect = (index: number, selectedValue: string) => {
    if (selectedValue === '__OTHER__') {
      setItems((prev) => {
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          equipmentName: '',
          upnCode: '',
          isManual: true,
        };
        return copy;
      });
      return;
    }

    const currentCatalog = LAB_EQUIPMENT_CATALOG[labId] || [];
    const catItem = currentCatalog.find((c) => c.name === selectedValue);
    if (!catItem) {
      handleUpdateItem(index, 'equipmentName', selectedValue);
      return;
    }

    const defaultCode =
      catItem.sampleCodes && catItem.sampleCodes.length > 0 && catItem.sampleCodes[0] !== 'S/C'
        ? catItem.sampleCodes[0]
        : (catItem.sampleCodes?.[0] || 'S/C');

    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        equipmentName: catItem.name,
        upnCode: defaultCode,
        isManual: false,
      };
      return copy;
    });
  };

  const handleSwitchToCatalog = (index: number) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        equipmentName: '',
        upnCode: '',
        isManual: false,
      };
      return copy;
    });
  };

  // M9: Copiar datos del Integrante #1 como solicitante responsable
  const handleCopyMember1ToResponsible = () => {
    const member1 = groupMembers[0];
    if (!member1 || !member1.fullName.trim()) {
      showToast('Por favor, ingresa primero los nombres del Integrante #1.', 'warning');
      return;
    }
    setResponsibleName(member1.fullName.trim());
    // Buscar si existe un código UPN asociado en el directorio o perfil
    const saved = loadSavedStudentProfile();
    if (saved && saved.fullName.toLowerCase() === member1.fullName.trim().toLowerCase() && saved.upnCode) {
      setResponsibleUpnCode(saved.upnCode);
    }
    showToast(`Se copiaron los datos de ${member1.fullName.trim()} como responsable.`, 'success');
  };

  // M18: Búsqueda rápida por código UPN
  const handleResponsibleUpnCodeChange = (raw: string) => {
    const code = raw.toUpperCase();
    setResponsibleUpnCode(code);
    if (code.trim().length >= 4) {
      const found = lookupStudentByUpnCode(code);
      if (found && found.fullName && !responsibleName.trim()) {
        setResponsibleName(found.fullName);
        showToast(`Nombre autocompletado para ${found.upnCode}: ${found.fullName}`, 'info');
      }
    }
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      showToast('Debe incluir al menos 1 equipo o material en la solicitud.', 'info');
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // --------------------------------------------------------------------------
  // Manejo de Filas Dinámicas: Integrantes del Grupo
  // --------------------------------------------------------------------------
  const handleAddMember = () => {
    setGroupMembers((prev) => [...prev, { fullName: '', nrc: '' }]);
  };

  const handleUpdateMember = (
    index: number,
    field: keyof LoanGroupMember,
    value: string
  ) => {
    setGroupMembers((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveMember = (index: number) => {
    if (groupMembers.length <= 1) {
      showToast('Debe registrar al menos 1 integrante en el grupo.', 'info');
      return;
    }
    setGroupMembers((prev) => prev.filter((_, i) => i !== index));
  };

  // --------------------------------------------------------------------------
  // Envío de Solicitud de Préstamo
  // --------------------------------------------------------------------------
  const handleSubmitLoan = async (e: React.FormEvent) => {
    e.preventDefault();

    const finalTeacherName = isCustomTeacher ? customTeacher.trim() : selectedTeacher;
    if (!finalTeacherName) {
      showToast('Por favor, indica el nombre del docente a cargo.', 'warning');
      return;
    }

    if (!courseProgram.trim()) {
      showToast('Por favor, ingresa el curso o programa.', 'warning');
      return;
    }

    if (!attendedByAdvisorId) {
      showToast('Selecciona el asistente o supervisor que atiende el préstamo.', 'warning');
      return;
    }

    // Validar filas de equipos
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.equipmentName.trim() || !item.upnCode.trim() || item.quantity < 1) {
        showToast(
          `Completa la cantidad, nombre y código UPN del equipo en la fila #${i + 1}.`,
          'warning'
        );
        return;
      }
    }

    // Validar integrantes
    for (let i = 0; i < groupMembers.length; i++) {
      const mem = groupMembers[i];
      if (!mem.fullName.trim() || !mem.nrc.trim()) {
        showToast(`Completa nombres y NRC del integrante #${i + 1}.`, 'warning');
        return;
      }
    }

    // Validar solicitante responsable y firma
    if (!responsibleName.trim() || !responsibleUpnCode.trim()) {
      showToast('Ingresa los nombres y código UPN del solicitante responsable.', 'warning');
      return;
    }

    if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image')) {
      showToast('Es obligatorio registrar la firma digital del solicitante responsable.', 'warning');
      return;
    }

    const payload: CreateEquipmentLoanPayload = {
      labId,
      teacherName: finalTeacherName,
      cycle,
      courseProgram: courseProgram.trim(),
      attendedByAdvisorId,
      items: items.map((it) => ({
        quantity: Number(it.quantity) || 1,
        equipmentName: it.equipmentName.trim(),
        upnCode: it.upnCode.trim().toUpperCase(),
      })),
      groupMembers: groupMembers.map((m) => ({
        fullName: m.fullName.trim(),
        nrc: m.nrc.trim(),
      })),
      responsibleName: responsibleName.trim(),
      responsibleUpnCode: responsibleUpnCode.trim().toUpperCase(),
      signatureDataUrl,
    };

    setSubmitting(true);
    try {
      const res = await apiClient.createEquipmentLoan(payload);
      setCreatedLoan(res.loan);
      // M18: Guardar en almacenamiento local para recordar datos del estudiante
      saveStudentProfile({
        fullName: responsibleName.trim(),
        upnCode: responsibleUpnCode.trim().toUpperCase(),
        course: courseProgram.trim(),
        cycle,
        nrc: groupMembers[0]?.nrc?.trim() || undefined,
        teacherName: finalTeacherName,
      });
      showToast(`¡Solicitud de préstamo ${res.loan.code} generada exitosamente!`, 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al registrar préstamo';
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Búsqueda de Préstamo por Código (EQP-...)
  // --------------------------------------------------------------------------
  const handleSearchByCode = async (codeToSearch?: string) => {
    const code = (codeToSearch || searchCode).trim().toUpperCase();
    if (!code) {
      showToast('Ingresa el código del préstamo (ej. EQP-2026-0001).', 'info');
      return;
    }

    setSearching(true);
    setSearchError(null);
    try {
      const res = await apiClient.getLoanByCode(code);
      setSearchedLoan(res.loan);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Préstamo no encontrado';
      setSearchError(message);
      setSearchedLoan(null);
      showToast(message, 'error');
    } finally {
      setSearching(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* ===================================================================== */}
      {/* VISTA 1: FORMULARIO OFICIAL "ENTREGA DE MATERIALES Y/O EQUIPOS"      */}
      {/* ===================================================================== */}
      {mode === 'form' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 no-print">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold">
              <Wrench className="w-3.5 h-3.5 text-amber-600" />
              <span>Préstamo y Control de Instrumental</span>
            </div>
          </div>

          {!createdLoan && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-10 space-y-8">
          {/* Encabezado Institucional Exacto */}
          <div className="text-center pb-6 border-b-2 border-slate-900 space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
              Universidad Privada del Norte • Facultad de Ingeniería
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              ENTREGA DE MATERIALES Y/O EQUIPOS
            </h1>
            <p className="text-xs text-slate-500">
              Formato oficial de control de instrumental para laboratorios especializados
            </p>
          </div>

          <form onSubmit={handleSubmitLoan} className="space-y-8">
            {/* CAMPOS SUPERIORES */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Laboratorio */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Laboratorio <span className="text-rose-500">*</span>
                </label>
                <select
                  value={labId}
                  onChange={(e) => setLabId(e.target.value as LabId)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                >
                  {labs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Docente */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Docente <span className="text-rose-500">*</span>
                </label>
                {!isCustomTeacher ? (
                  <div className="space-y-1.5">
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
                      {teachers.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                      <option value="__OTHER__">+ Escribir otro docente...</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      required
                      value={customTeacher}
                      onChange={(e) => setCustomTeacher(e.target.value)}
                      placeholder="Nombre del Docente"
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setIsCustomTeacher(false)}
                      className="px-2.5 py-2 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700"
                    >
                      Lista
                    </button>
                  </div>
                )}
              </div>

              {/* Ciclo */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Ciclo Académico <span className="text-rose-500">*</span>
                </label>
                <select
                  value={cycle}
                  onChange={(e) => setCycle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                >
                  {ACADEMIC_CYCLES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Curso / Programa */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Curso / Programa <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  list="loan-courses-list"
                  value={courseProgram}
                  onChange={(e) => setCourseProgram(e.target.value)}
                  placeholder="Ej. Circuitos Eléctricos / Ing. Electrónica"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <datalist id="loan-courses-list">
                  {UPN_LAB_COURSES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              {/* Atendido por Asistente o Supervisor */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Atendido por Asistente o Supervisor <span className="text-rose-500">*</span>
                </label>
                <select
                  value={attendedByAdvisorId}
                  onChange={(e) => setAttendedByAdvisorId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                >
                  {advisors.map((adv) => (
                    <option key={adv.id} value={adv.id}>
                      {adv.fullName} ({adv.roleTitle})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* TABLA DINÁMICA DE EQUIPOS / MATERIALES (3 COLUMNAS) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-600" />
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    Equipos y/o Materiales Solicitados ({items.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir equipo o material</span>
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 uppercase tracking-wider text-[11px] font-bold">
                      <th className="py-2.5 px-3 w-24 border-r border-slate-200">Cantidad</th>
                      <th className="py-2.5 px-3 border-r border-slate-200">Equipo y/o Material</th>
                      <th
                        className={`py-2.5 px-3 ${
                          items.length > 1 ? 'border-r border-slate-200' : ''
                        }`}
                      >
                        Código UPN
                      </th>
                      {items.length > 1 && (
                        <th className="py-2.5 px-2 w-12 text-center">Acción</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {items.map((it, idx) => {
                      const labCatalog = LAB_EQUIPMENT_CATALOG[labId] || [];
                      const matchingCatItem = labCatalog.find((c) => c.name === it.equipmentName);

                      return (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-2 border-r border-slate-200 align-top">
                            <input
                              type="number"
                              min="1"
                              max="99"
                              required
                              value={it.quantity}
                              onChange={(e) =>
                                handleUpdateItem(idx, 'quantity', parseInt(e.target.value) || 1)
                              }
                              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 text-center font-bold"
                            />
                          </td>
                          <td className="p-2 border-r border-slate-200 align-top">
                            {it.isManual ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  required
                                  value={it.equipmentName}
                                  onChange={(e) =>
                                    handleUpdateItem(idx, 'equipmentName', e.target.value)
                                  }
                                  placeholder="Ej. Multímetro digital, protoboard..."
                                  className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSwitchToCatalog(idx)}
                                  className="px-2 py-1.5 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg shrink-0 transition-colors cursor-pointer"
                                  title="Volver a seleccionar del catálogo"
                                >
                                  Catálogo
                                </button>
                              </div>
                            ) : (
                              <select
                                value={it.equipmentName}
                                onChange={(e) => handleCatalogSelect(idx, e.target.value)}
                                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                              >
                                <option value="">-- Seleccionar equipo del laboratorio --</option>
                                {labCatalog.map((cat) => (
                                  <option key={cat.name} value={cat.name}>
                                    {cat.name} [{cat.totalUnits} uds.]
                                  </option>
                                ))}
                                <option value="__OTHER__">+ Otro equipo o material (escribir manualmente)...</option>
                              </select>
                            )}
                          </td>
                          <td
                            className={`p-2 align-top ${
                              items.length > 1 ? 'border-r border-slate-200' : ''
                            }`}
                          >
                            <input
                              type="text"
                              required
                              list={`sample-codes-${idx}`}
                              value={it.upnCode}
                              onChange={(e) =>
                                handleUpdateItem(idx, 'upnCode', e.target.value.toUpperCase())
                              }
                              placeholder={matchingCatItem?.sampleCodes?.[0] || 'Ej. 1-011824 o S/C'}
                              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono"
                            />
                            <datalist id={`sample-codes-${idx}`}>
                              {matchingCatItem?.sampleCodes?.map((code) => (
                                <option key={code} value={code}>
                                  {code}
                                </option>
                              ))}
                            </datalist>
                            {matchingCatItem && matchingCatItem.sampleCodes && matchingCatItem.sampleCodes.length > 1 && (
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <span className="text-[10px] text-slate-400">Códigos:</span>
                                {matchingCatItem.sampleCodes.map((code) => (
                                  <button
                                    key={code}
                                    type="button"
                                    onClick={() => handleUpdateItem(idx, 'upnCode', code)}
                                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                                      it.upnCode === code
                                        ? 'bg-amber-400 text-slate-950 font-bold'
                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {code}
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                          {items.length > 1 && (
                            <td className="p-2 text-center align-top">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Eliminar fila"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SECCIÓN INTEGRANTES DEL GRUPO (2 COLUMNAS) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-700" />
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    Integrantes del Grupo ({groupMembers.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleAddMember}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir integrante</span>
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 uppercase tracking-wider text-[11px] font-bold">
                      <th className="py-2.5 px-3 border-r border-slate-200">Nombres y Apellidos</th>
                      <th
                        className={`py-2.5 px-3 w-44 ${
                          groupMembers.length > 1 ? 'border-r border-slate-200' : ''
                        }`}
                      >
                        NRC
                      </th>
                      {groupMembers.length > 1 && (
                        <th className="py-2.5 px-2 w-12 text-center">Acción</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {groupMembers.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2 border-r border-slate-200">
                          <input
                            type="text"
                            required
                            value={m.fullName}
                            onChange={(e) =>
                              handleUpdateMember(idx, 'fullName', e.target.value)
                            }
                            placeholder="Nombres y Apellidos del Estudiante"
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900"
                          />
                        </td>
                        <td
                          className={`p-2 ${
                            groupMembers.length > 1 ? 'border-r border-slate-200' : ''
                          }`}
                        >
                          <input
                            type="text"
                            required
                            value={m.nrc}
                            onChange={(e) =>
                              handleUpdateMember(idx, 'nrc', e.target.value)
                            }
                            placeholder="Ej. 1823"
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono"
                          />
                        </td>
                        {groupMembers.length > 1 && (
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Eliminar integrante"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SECCIÓN SOLICITANTE DEL PRÉSTAMO (RESPONSABLE) + FIRMA CANVAS */}
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-600" />
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    SOLICITANTE DEL PRÉSTAMO (RESPONSABLE)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleCopyMember1ToResponsible}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-bold transition-colors cursor-pointer border border-amber-300 shadow-2xs self-start sm:self-auto"
                  title="Copiar datos del integrante #1 como solicitante responsable"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                  <span>Usar datos del Integrante #1 como responsable</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Nombres y Apellidos del Responsable <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={responsibleName}
                    onChange={(e) => setResponsibleName(e.target.value)}
                    placeholder="Ej. Franco David Rivas Torres"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Código UPN del Responsable <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={responsibleUpnCode}
                    onChange={(e) => handleResponsibleUpnCodeChange(e.target.value)}
                    placeholder="Ej. N00392817"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* LIENZO DE FIRMA DIGITAL */}
              <div className="pt-2">
                <SignatureCanvas
                  value={signatureDataUrl}
                  onChange={setSignatureDataUrl}
                  label="Firma Digital del Estudiante Responsable"
                />
              </div>
            </div>

            {/* BOTÓN DE ENVÍO */}
            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Registrando préstamo...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Registrar Entrega de Materiales</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* COMPROBANTE DE PRÉSTAMO GENERADO (CON OPCIÓN DE IMPRESIÓN)            */}
      {/* ===================================================================== */}
      {createdLoan && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-10 space-y-6 animate-in zoom-in-95 duration-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold mb-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Solicitud Registrada en Laboratorio</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Ficha Oficial de Préstamo Generada
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Conserva este comprobante para la devolución de los materiales al asistente encargado.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 no-print">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>Imprimir Ficha</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatedLoan(null);
                  setSignatureDataUrl('');
                  setItems([{ quantity: 1, equipmentName: '', upnCode: '' }]);
                  setGroupMembers([{ fullName: '', nrc: '' }]);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Nuevo Préstamo
              </button>
            </div>
          </div>

          {/* Tarjeta de Código en Grande */}
          <div className="bg-amber-50/70 rounded-2xl p-6 border border-amber-200 text-center space-y-2">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-widest">
              ID Único de Solicitud de Préstamo
            </span>
            <div className="text-3xl sm:text-4xl font-mono font-extrabold text-slate-900 tracking-wider">
              {createdLoan.code}
            </div>
            <div className="pt-2">
              <LoanStatusBadge status={createdLoan.status} />
            </div>
          </div>

          {/* Datos del Préstamo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Docente a Cargo:</span>
                <span className="font-semibold text-slate-900">{createdLoan.teacherName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ciclo / Curso:</span>
                <span className="font-semibold text-slate-900">
                  {createdLoan.cycle} • {createdLoan.courseProgram}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Atendido por:</span>
                <span className="font-semibold text-slate-900">{createdLoan.attendedByName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fecha y Hora de Registro:</span>
                <span className="font-mono text-slate-700">
                  {new Date(createdLoan.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Solicitante Responsable:</span>
                <span className="font-bold text-slate-900">{createdLoan.responsibleName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Código UPN:</span>
                <span className="font-mono text-slate-900">{createdLoan.responsibleUpnCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Equipos:</span>
                <span className="font-semibold text-slate-900">{createdLoan.items.length} ítem(s)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Integrantes:</span>
                <span className="font-semibold text-slate-900">{createdLoan.groupMembers.length} alumno(s)</span>
              </div>
            </div>
          </div>

          {/* Lista de Equipos */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Detalle del Instrumental Entregado:
            </h4>
            <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold">
                  <tr>
                    <th className="py-2 px-3 w-20">Cant.</th>
                    <th className="py-2 px-3">Equipo / Material</th>
                    <th className="py-2 px-3">Código Patrimonial UPN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {createdLoan.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3 font-bold text-center">{it.quantity}</td>
                      <td className="py-2 px-3">{it.equipmentName}</td>
                      <td className="py-2 px-3 font-mono text-slate-700">{it.upnCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Firma Registrada */}
          {createdLoan.signatureDataUrl && (
            <div className="space-y-2 pt-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Firma Digital Registrada en Acta:
              </span>
              <div className="w-64 h-28 bg-white border border-slate-300 rounded-xl p-2 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={createdLoan.signatureDataUrl}
                  alt="Firma del Responsable"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </div>
          )}
        </div>
      )}
      </div>
      )}

      {/* ===================================================================== */}
      {/* VISTA 2: CONSULTA DEDICADA DE PRÉSTAMO POR CÓDIGO (EQP-...)           */}
      {/* ===================================================================== */}
      {mode === 'lookup' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 no-print">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold mb-2">
                <Wrench className="w-3.5 h-3.5 text-amber-600" />
                <span>Módulo 3 • Préstamo y Control de Instrumental</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Consulta de Estado de Préstamo
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Ingresa el código identificador de tu entrega de materiales (ej. EQP-2026-0001) para verificar su devolución o estado en curso.
              </p>
            </div>

            <Link
              href="/prestamos"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4 text-amber-600" />
              <span>Nueva Solicitud de Préstamo</span>
            </Link>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-10 space-y-6">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Búsqueda Rápida de Comprobante
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Ingresa el código oficial generado durante la entrega física en laboratorio.
              </p>
            </div>

          {/* Formulario de Búsqueda */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearchByCode();
            }}
            className="flex flex-col sm:flex-row items-center gap-2 max-w-xl"
          >
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                required
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                placeholder="Código de préstamo (EQP-2026-0001)"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-mono text-slate-900 uppercase focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              {searching ? (
                <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              ) : (
                <Search className="w-4 h-4 text-amber-400" />
              )}
              <span>Buscar Préstamo</span>
            </button>
          </form>

          {/* Mensaje de error si no existe */}
          {searchError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{searchError}</span>
            </div>
          )}

          {/* Resultado de la Búsqueda */}
          {searchedLoan && (
            <div className="pt-6 border-t border-slate-200 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500">ID del Préstamo:</span>
                  <div className="text-xl font-mono font-extrabold text-slate-900">
                    {searchedLoan.code}
                  </div>
                </div>
                <LoanStatusBadge status={searchedLoan.status} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Docente a Cargo:</span>
                    <span className="font-semibold text-slate-900">{searchedLoan.teacherName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Curso:</span>
                    <span className="font-semibold text-slate-900">{searchedLoan.courseProgram}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Atendido por:</span>
                    <span className="font-semibold text-slate-900">{searchedLoan.attendedByName}</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Responsable:</span>
                    <span className="font-bold text-slate-900">{searchedLoan.responsibleName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Código UPN:</span>
                    <span className="font-mono text-slate-900">{searchedLoan.responsibleUpnCode}</span>
                  </div>
                  {searchedLoan.handedOutAt && (
                    <div className="flex justify-between text-blue-700">
                      <span>Entregado en Uso:</span>
                      <span className="font-mono">{new Date(searchedLoan.handedOutAt).toLocaleString()}</span>
                    </div>
                  )}
                  {searchedLoan.deliveredAt && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Devuelto al Laboratorio:</span>
                      <span className="font-mono">{new Date(searchedLoan.deliveredAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Equipos en préstamo */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Equipos en esta entrega:
                </span>
                <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold">
                      <tr>
                        <th className="py-2 px-3 w-16 text-center">Cant.</th>
                        <th className="py-2 px-3">Equipo / Material</th>
                        <th className="py-2 px-3">Código UPN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {searchedLoan.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-bold text-center">{it.quantity}</td>
                          <td className="py-2 px-3">{it.equipmentName}</td>
                          <td className="py-2 px-3 font-mono text-slate-700">{it.upnCode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
  </div>
);
}
