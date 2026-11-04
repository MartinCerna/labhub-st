'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Printer,
  Upload,
  Search,
  Box,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Layers,
  Eye,
  Trash2,
  Copy,
  ExternalLink,
  ChevronRight,
  Sparkles,
  RefreshCw,
  FileCode2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Timer,
  Check,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  Print3DRequest,
  Print3DStatus,
  StlFileMetadata,
} from '@/types/labhub';
import {
  PRINT_3D_STATUSES,
  DEFAULT_TEACHERS_CATALOG,
  UPN_LAB_COURSES,
} from '@/constants/schedule';
import {
  loadSavedStudentProfile,
  saveStudentProfile,
  lookupStudentByUpnCode,
} from '@/lib/student-profile-storage';
import { parseStlBuffer, ParsedStlGeometry, validateStlFileName } from '@/lib/stl-parser';
import { useToast } from '@/components/shared/ToastProvider';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { StlViewerModal } from '@/components/shared/StlViewerModal';

interface StlLocalFile {
  file: File;
  parsed: ParsedStlGeometry;
}

interface Print3DPortalViewProps {
  initialTrackQuery?: string;
  mode?: 'form' | 'tracking';
}

export function Print3DPortalView({
  initialTrackQuery,
  mode = 'form',
}: Print3DPortalViewProps) {
  const { showToast } = useToast();

  // Catálogo de docentes
  const [teachers, setTeachers] = useState<string[]>(DEFAULT_TEACHERS_CATALOG);
  const [selectedTeacher, setSelectedTeacher] = useState<string>(DEFAULT_TEACHERS_CATALOG[0] || '');
  const [isCustomTeacher, setIsCustomTeacher] = useState<boolean>(false);
  const [customTeacher, setCustomTeacher] = useState<string>('');

  // Campos de formulario para nueva solicitud
  const [studentFullName, setStudentFullName] = useState<string>('');
  const [upnCode, setUpnCode] = useState<string>('');
  const [course, setCourse] = useState<string>('');
  const [selectedCourse, setSelectedCourse] = useState<string>(UPN_LAB_COURSES[0] || '');
  const [isCustomCourse, setIsCustomCourse] = useState<boolean>(false);
  const [customCourse, setCustomCourse] = useState<string>('');
  const [nrc, setNrc] = useState<string>('');

  // M18: Autoguardado y precarga de datos del estudiante (localStorage)
  useEffect(() => {
    const profile = loadSavedStudentProfile();
    if (profile) {
      if (profile.fullName) setStudentFullName((prev) => prev || profile.fullName);
      if (profile.upnCode) setUpnCode((prev) => prev || profile.upnCode);
      if (profile.nrc) setNrc((prev) => prev || profile.nrc || '');
      if (profile.teacherName) setSelectedTeacher((prev) => prev || profile.teacherName || '');
      if (profile.course) {
        if (UPN_LAB_COURSES.includes(profile.course)) {
          setSelectedCourse(profile.course);
          setIsCustomCourse(false);
        } else {
          setIsCustomCourse(true);
          setCustomCourse(profile.course);
        }
      }
    }
  }, []);

  // M18: Búsqueda rápida y autocompletado por código UPN
  const handleUpnCodeChange = (raw: string) => {
    const code = raw.toUpperCase();
    setUpnCode(code);
    if (code.trim().length >= 4) {
      const found = lookupStudentByUpnCode(code);
      if (found && found.fullName && !studentFullName.trim()) {
        setStudentFullName(found.fullName);
        showToast(`Nombre autocompletado para ${found.upnCode}: ${found.fullName}`, 'info');
      }
    }
  };

  // Archivos STL cargados en memoria y analizados en cliente
  const [stlLst, setStlLst] = useState<StlLocalFile[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [parsingFiles, setParsingFiles] = useState<boolean>(false);

  // Modal Visor STL 3D
  const [viewerFile, setViewerFile] = useState<{
    file?: File;
    downloadUrl?: string;
    fileName: string;
  } | null>(null);

  // Estado de envío y comprobante
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [createdRequest, setCreatedRequest] = useState<Print3DRequest | null>(null);
  const [acceptedConditions, setAcceptedConditions] = useState<boolean>(false);

  // Estado de Seguimiento / Búsqueda
  const [trackQuery, setTrackQuery] = useState<string>(initialTrackQuery || '');
  const [trackingLoading, setTrackingLoading] = useState<boolean>(false);
  const [trackedRequests, setTrackedRequests] = useState<Print3DRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<Print3DRequest | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);

  // Estado de Subsanación (cuando está OBSERVADO dentro de las 48h)
  const [resubmitFiles, setResubmitFiles] = useState<StlLocalFile[]>([]);
  const [resubmitting, setResubmitting] = useState<boolean>(false);

  // Carga inicial del catálogo de docentes
  useEffect(() => {
    apiClient
      .getCatalog()
      .then((cat) => {
        if (cat.teachers && cat.teachers.length > 0) {
          setTeachers(cat.teachers);
          setSelectedTeacher(cat.teachers[0]);
        }
      })
      .catch((err) => {
        console.warn('Error al cargar catálogo de docentes:', err);
      });
  }, []);

  // Si se provee initialTrackQuery, ejecutar búsqueda automáticamente
  useEffect(() => {
    if (initialTrackQuery) {
      handleTrackSearch(initialTrackQuery);
    }
  }, [initialTrackQuery]);

  // --------------------------------------------------------------------------
  // Procesamiento de Archivos STL (Drag & Drop y File Input)
  // --------------------------------------------------------------------------
  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setParsingFiles(true);
    let addedCount = 0;

    for (const f of fileArray) {
      if (!validateStlFileName(f.name)) {
        showToast(`El archivo "${f.name}" no tiene extensión .stl y fue omitido.`, 'error');
        continue;
      }

      try {
        const buffer = await f.arrayBuffer();
        const parsed = parseStlBuffer(buffer);

        // Validación de dimensiones máximas: 20 × 20 × 20 cm = 200 × 200 × 200 mm
        if (
          parsed.dimensionsMm.x > 200 ||
          parsed.dimensionsMm.y > 200 ||
          parsed.dimensionsMm.z > 200
        ) {
          showToast(
            `El archivo "${f.name}" (${parsed.dimensionsMm.x} × ${parsed.dimensionsMm.y} × ${parsed.dimensionsMm.z} mm) supera las dimensiones máximas permitidas de 20×20×20 cm (200×200×200 mm).`,
            'error'
          );
          continue;
        }

        setStlLst((prev) => [...prev, { file: f, parsed }]);
        addedCount++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error al procesar STL';
        showToast(`Error en "${f.name}": ${msg}`, 'error');
      }
    }

    setParsingFiles(false);
    if (addedCount > 0) {
      showToast(`Se añadieron y validaron ${addedCount} archivo(s) .stl con éxito.`, 'success');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleRemoveStl = (index: number) => {
    setStlLst((prev) => prev.filter((_, i) => i !== index));
  };

  // --------------------------------------------------------------------------
  // Envío de Solicitud de Impresión 3D
  // --------------------------------------------------------------------------
  const handleSubmitPrintRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (stlLst.length === 0) {
      showToast('Debes cargar al menos un archivo .stl válido para imprimir.', 'warning');
      return;
    }

    const teacherName = isCustomTeacher ? customTeacher.trim() : selectedTeacher;
    if (!teacherName) {
      showToast('Por favor, indica el nombre del docente.', 'warning');
      return;
    }

    const finalCourse = isCustomCourse ? customCourse.trim() : (selectedCourse || course).trim();

    if (!studentFullName.trim() || !upnCode.trim() || !finalCourse || !nrc.trim()) {
      showToast('Completa todos los campos obligatorios del formulario.', 'warning');
      return;
    }

    if (!acceptedConditions) {
      showToast('Debes declarar haber leído y aceptado las condiciones obligatorias de impresión 3D del HUB Tecnológico.', 'warning');
      return;
    }

    const formData = new FormData();
    formData.append('studentFullName', studentFullName.trim());
    formData.append('upnCode', upnCode.trim().toUpperCase());
    formData.append('teacherName', teacherName);
    formData.append('course', finalCourse);
    formData.append('nrc', nrc.trim());

    stlLst.forEach((item) => {
      formData.append('files', item.file, item.file.name);
    });

    setSubmitting(true);
    try {
      const res = await apiClient.createPrint3DRequest(formData);
      setCreatedRequest(res.printRequest);
      // M18: Autoguardar datos del estudiante
      saveStudentProfile({
        fullName: studentFullName.trim(),
        upnCode: upnCode.trim().toUpperCase(),
        course: finalCourse,
        nrc: nrc.trim(),
        teacherName,
      });
      showToast(`¡Solicitud ${res.printRequest.code} creada exitosamente!`, 'success');
      // Limpiar archivos locales y aceptación de condiciones
      setStlLst([]);
      setAcceptedConditions(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar solicitud 3D';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Búsqueda de Seguimiento (Código 3DP-... o Código UPN)
  // --------------------------------------------------------------------------
  const handleTrackSearch = async (queryToSearch?: string) => {
    const q = (queryToSearch || trackQuery).trim().toUpperCase();
    if (!q) {
      showToast('Ingresa un código de solicitud (3DP-...) o tu código UPN.', 'info');
      return;
    }

    setTrackingLoading(true);
    setTrackError(null);
    try {
      const res = await apiClient.trackPrint3DRequests(q);
      if (res.results.length === 0) {
        setTrackError(`No se encontraron solicitudes con el criterio "${q}".`);
        setTrackedRequests([]);
        setSelectedRequest(null);
      } else {
        setTrackedRequests(res.results);
        setSelectedRequest(res.results[0]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al consultar seguimiento';
      setTrackError(msg);
      setTrackedRequests([]);
      setSelectedRequest(null);
    } finally {
      setTrackingLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Subsanación de Archivos Observados (Dentro del plazo de 48h)
  // --------------------------------------------------------------------------
  const processResubmitFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    for (const f of fileArray) {
      if (!validateStlFileName(f.name)) {
        showToast(`El archivo "${f.name}" no es .stl y fue omitido.`, 'error');
        continue;
      }
      try {
        const buf = await f.arrayBuffer();
        const parsed = parseStlBuffer(buf);

        // Validación de dimensiones máximas: 20 × 20 × 20 cm = 200 × 200 × 200 mm
        if (
          parsed.dimensionsMm.x > 200 ||
          parsed.dimensionsMm.y > 200 ||
          parsed.dimensionsMm.z > 200
        ) {
          showToast(
            `El archivo "${f.name}" (${parsed.dimensionsMm.x} × ${parsed.dimensionsMm.y} × ${parsed.dimensionsMm.z} mm) supera las dimensiones máximas permitidas de 20×20×20 cm (200×200×200 mm).`,
            'error'
          );
          continue;
        }

        setResubmitFiles((prev) => [...prev, { file: f, parsed }]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error al procesar STL';
        showToast(`Error: ${msg}`, 'error');
      }
    }
  };

  const handleResubmit = async (reqCode: string) => {
    if (resubmitFiles.length === 0) {
      showToast('Carga al menos un archivo .stl corregido para subsanar.', 'warning');
      return;
    }

    const formData = new FormData();
    resubmitFiles.forEach((item) => {
      formData.append('files', item.file, item.file.name);
    });

    setResubmitting(true);
    try {
      const res = await apiClient.resubmitObservedPrint3D(reqCode, formData);
      showToast('¡Archivos subsanados enviados! Tu solicitud pasa a "EN REVISION".', 'success');
      setSelectedRequest(res.printRequest);
      setResubmitFiles([]);
      // Actualizar en la lista local de resultados
      setTrackedRequests((prev) =>
        prev.map((r) => (r.code === reqCode ? res.printRequest : r))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al subsanar archivos';
      showToast(msg, 'error');
    } finally {
      setResubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* ===================================================================== */}
      {/* CABECERA: VISTA DEDICADA DE FORMULARIO O SEGUIMIENTO                  */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-semibold mb-2">
            <Printer className="w-3.5 h-3.5 text-indigo-600" />
            <span>Módulo 4 • Prototipado e impresión</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {mode === 'tracking'
              ? 'Seguimiento de Solicitudes 3D'
              : 'Solicitud de Impresión 3D y Prototipado'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            {mode === 'tracking'
              ? 'Consulta el estado técnico en vivo de tus modelos, la línea de tiempo de 7 estados y responde a observaciones técnicas.'
              : 'Sube tus modelos en formato .stl, valida sus dimensiones y gestiona tus piezas de ingeniería.'}
          </p>
        </div>

        {/* Botón de redirección entre páginas dedicadas */}
        <div className="shrink-0">
          {mode === 'tracking' ? (
            <Link
              href="/impresion-3d"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-indigo-600" />
              <span>Nueva Solicitud 3D</span>
            </Link>
          ) : (
            <Link
              href="/impresion-3d/seguimiento"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span>Hacer Seguimiento</span>
            </Link>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* VISTA 1: FORMULARIO DE SOLICITUD DE IMPRESIÓN 3D                      */}
      {/* ===================================================================== */}
      {mode === 'form' && !createdRequest && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-10 space-y-8">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">
              Datos de la Solicitud de Fabricación
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Ingresa la información académica y carga tus archivos .stl para iniciar la revisión técnica.
            </p>
          </div>

          {/* PANEL DESTACADO: CONDICIONES OBLIGATORIAS PARA IMPRESIÓN 3D — HUB TECNOLÓGICO */}
          <div className="bg-gradient-to-br from-amber-50/90 via-white to-indigo-50/40 rounded-2xl border-2 border-amber-300 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-xs shrink-0">
                  <AlertTriangle className="w-5 h-5 text-slate-950" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                    Condiciones Obligatorias para Impresión 3D — HUB Tecnológico
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-600">
                    Normativa de manufactura aditiva y laboratorio UPN. Lectura requerida antes de solicitar fabricación.
                  </p>
                </div>
              </div>
              <span className="inline-flex self-start sm:self-auto px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-200 text-amber-950 uppercase tracking-wider">
                Reglamento Vigente
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white/95 rounded-xl border border-amber-200/70 flex items-start gap-2.5 shadow-2xs">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <strong className="text-slate-900 font-bold block text-xs">
                    Uso exclusivo académico y de investigación:
                  </strong>
                  <span className="text-slate-600 text-[11px] leading-relaxed">
                    Las impresiones son exclusivamente de uso académico y/o de investigación universitaria.
                  </span>
                </div>
              </div>

              <div className="p-3 bg-white/95 rounded-xl border border-amber-200/70 flex items-start gap-2.5 shadow-2xs">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <strong className="text-slate-900 font-bold block text-xs">
                    Evaluación técnica y plazo de subsanación de 48 h:
                  </strong>
                  <span className="text-slate-600 text-[11px] leading-relaxed">
                    La impresión de los modelos está sujeta a evaluación por parte del HUB Tecnológico; en caso de presentarse alguna observación, se notificará y el estudiante tendrá un plazo máximo de <strong className="text-amber-950 font-bold">48 horas</strong> para subsanarla, caso contrario su Ticket será eliminado.
                  </span>
                </div>
              </div>

              <div className="p-3 bg-white/95 rounded-xl border border-amber-200/70 flex items-start gap-2.5 shadow-2xs">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <strong className="text-slate-900 font-bold block text-xs">
                    Tiempos sujetos a cola y geometría:
                  </strong>
                  <span className="text-slate-600 text-[11px] leading-relaxed">
                    El tiempo de entrega dependerá de la cola de impresión pendiente en ese momento y de la propia complejidad geométrica de los modelos .stl enviados.
                  </span>
                </div>
              </div>

              <div className="p-3 bg-white/95 rounded-xl border border-amber-200/70 flex items-start gap-2.5 shadow-2xs">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  4
                </span>
                <div>
                  <strong className="text-slate-900 font-bold block text-xs">
                    Responsabilidad sobre el diseño y resistencia estructural:
                  </strong>
                  <span className="text-slate-600 text-[11px] leading-relaxed">
                    Cualquier falla estructural, fragilidad por espesor insuficiente, errores de ensamblaje/tolerancias o defectos derivados del propio diseño CAD enviado son de <strong className="text-rose-700 font-bold">exclusiva responsabilidad del estudiante</strong>. El laboratorio no asume responsabilidad por piezas que fallen mecánicamente a causa de su modelado.
                  </span>
                </div>
              </div>

              <div className="p-3 bg-white/95 rounded-xl border border-amber-200/70 flex items-start gap-2.5 shadow-2xs">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  5
                </span>
                <div>
                  <strong className="text-slate-900 font-bold block text-xs">
                    Formato único admitido:
                  </strong>
                  <span className="text-slate-600 text-[11px] leading-relaxed">
                    Únicamente se aceptarán archivos en formato <strong className="font-mono text-slate-800">.stl</strong>.
                  </span>
                </div>
              </div>

              <div className="p-3 bg-white/95 rounded-xl border border-amber-200/70 flex items-start gap-2.5 shadow-2xs">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                  6
                </span>
                <div>
                  <strong className="text-slate-900 font-bold block text-xs">
                    Dimensiones máximas permitidas:
                  </strong>
                  <span className="text-slate-600 text-[11px] leading-relaxed">
                    Las dimensiones máximas de impresión por modelo deben ser de <strong className="text-indigo-900 font-mono font-bold">20 × 20 × 20 cm (200 × 200 × 200 mm)</strong>.
                  </span>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmitPrintRequest} className="space-y-8">
            {/* Campos de Estudiante y Asignatura */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nombres y Apellidos del Estudiante <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={studentFullName}
                  onChange={(e) => setStudentFullName(e.target.value)}
                  placeholder="Ej. Valeria Sofía Morales Rojas"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Código UPN <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={upnCode}
                  onChange={(e) => handleUpnCodeChange(e.target.value)}
                  placeholder="Ej. N00248192"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                />
              </div>

              {/* Docente */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Docente <span className="text-rose-500">*</span>
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                  >
                    {teachers.map((t) => (
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
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setIsCustomTeacher(false)}
                      className="px-2.5 py-2 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 cursor-pointer"
                    >
                      Lista
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
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
                      placeholder="Nombre del Curso"
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setIsCustomCourse(false)}
                      className="px-2.5 py-2 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 cursor-pointer"
                    >
                      Lista
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  NRC <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nrc}
                  onChange={(e) => setNrc(e.target.value)}
                  placeholder="Ej. 6214"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            {/* ZONA DRAG & DROP PARA ARCHIVOS STL */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Box className="w-4 h-4 text-indigo-600" />
                    <span>Archivos .STL para Prototipado ({stlLst.length})</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Solo se admiten archivos .stl válidos (mallas binarias o ASCII). Se analizarán dimensiones y volumen.
                  </p>
                </div>
              </div>

              {/* Contenedor Dropzone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`relative border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50/60 scale-[1.01]'
                    : 'border-slate-300 bg-slate-50/60 hover:border-indigo-400 hover:bg-slate-50'
                }`}
              >
                <input
                  type="file"
                  id="stl-file-input"
                  multiple
                  accept=".stl"
                  onChange={(e) => {
                    if (e.target.files) processFiles(e.target.files);
                  }}
                  className="sr-only"
                />
                <label
                  htmlFor="stl-file-input"
                  className="cursor-pointer flex flex-col items-center justify-center space-y-3"
                >
                  <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-xs">
                    <Upload className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900">
                      Haz clic para subir o arrastra tus archivos .stl aquí
                    </span>
                    <p className="text-xs text-slate-500 mt-1">
                      Soporta múltiples piezas .stl por solicitud.
                    </p>
                  </div>
                </label>

                {parsingFiles && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-2xs rounded-3xl flex items-center justify-center gap-2 text-xs font-semibold text-indigo-600">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Analizando mallas 3D y calculando dimensiones...</span>
                  </div>
                )}
              </div>

              {/* TARJETAS DE ARCHIVOS STL ANALIZADOS EN CLIENTE */}
              {stlLst.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {stlLst.map((item, idx) => {
                    const { file, parsed } = item;
                    return (
                      <div
                        key={idx}
                        className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                <FileCode2 className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-slate-900 block truncate">
                                  {file.name}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {(file.size / 1024).toFixed(1)} KB • {parsed.format}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveStl(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Remover pieza"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Estadísticas de Malla Calculadas */}
                          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-bold">
                                Dimensiones (X×Y×Z):
                              </span>
                              <span className="font-mono font-semibold text-slate-800">
                                {parsed.dimensionsMm.x} × {parsed.dimensionsMm.y} ×{' '}
                                {parsed.dimensionsMm.z} mm
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-bold">
                                Volumen Estimado:
                              </span>
                              <span className="font-mono font-semibold text-indigo-600">
                                {parsed.estimatedVolumeCm3} cm³
                              </span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-400 text-[10px] uppercase font-bold mr-1">
                                Triángulos:
                              </span>
                              <span className="font-mono text-slate-700">
                                {parsed.triangleCount.toLocaleString()} facetas
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* CHECKBOX OBLIGATORIO DE ACEPTACIÓN DE CONDICIONES */}
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/70 border border-amber-300 space-y-2">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acceptedConditions}
                  onChange={(e) => setAcceptedConditions(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-400 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                  required
                />
                <span className="text-xs text-slate-700 leading-relaxed font-medium">
                  Declaro haber leído y acepto las <strong className="text-slate-900 font-bold">Condiciones Obligatorias para Impresión 3D del HUB Tecnológico</strong>. Asumo la <strong className="text-rose-700 font-bold">exclusiva responsabilidad por fallas estructurales o defectos mecánicos derivados de mi diseño CAD</strong> y ratifico que mis modelos cumplen con el límite máximo de <strong className="text-slate-900 font-mono font-bold">20 × 20 × 20 cm (200 × 200 × 200 mm)</strong> en formato <strong className="font-mono text-slate-900 font-bold">.stl</strong>.
                </span>
              </label>
              {!acceptedConditions && (
                <p className="text-[11px] text-amber-800 font-semibold pl-7 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Debes aceptar las condiciones obligatorias para habilitar el envío de tu solicitud.</span>
                </p>
              )}
            </div>

            {/* BOTONES INFERIORES: ACCIÓN Y SEGUIMIENTO DEDICADO */}
            <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <Link
                href="/impresion-3d/seguimiento"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border-2 border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-950 font-bold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer"
              >
                <Search className="w-4 h-4 text-indigo-600" />
                <span>Hacer seguimiento a mis solicitudes</span>
              </Link>

              <button
                type="submit"
                disabled={submitting || stlLst.length === 0 || !acceptedConditions}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Subiendo archivos y registrando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Enviar Solicitud de Impresión 3D</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* COMPROBANTE DE SOLICITUD 3D GENERADA                                  */}
      {/* ===================================================================== */}
      {mode === 'form' && createdRequest && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-10 space-y-6 animate-in zoom-in-95 duration-200">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              ¡Solicitud de Impresión 3D Enviada!
            </h2>
            <p className="text-xs text-slate-500 max-w-lg mx-auto">
              Guarda el código generado para consultar el avance técnico y recibir observaciones de los asistentes de laboratorio.
            </p>
          </div>

          <div className="bg-indigo-50/70 rounded-2xl p-6 border border-indigo-200 text-center space-y-3">
            <span className="text-xs font-bold text-indigo-800 uppercase tracking-widest">
              Código Único de Seguimiento 3D
            </span>
            <div className="text-3xl sm:text-4xl font-mono font-extrabold text-slate-900 tracking-wider">
              {createdRequest.code}
            </div>
            <div className="pt-2">
              <StatusBadge status={createdRequest.status} size="md" />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(createdRequest.code);
                showToast('¡Código copiado al portapapeles!', 'success');
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Copy className="w-4 h-4 text-amber-400" />
              <span>Copiar Código</span>
            </button>

            <Link
              href={`/impresion-3d/seguimiento?track=${encodeURIComponent(createdRequest.code)}`}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <span>Ir al Seguimiento en Vivo</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <button
              type="button"
              onClick={() => {
                setCreatedRequest(null);
                setStlLst([]);
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Nueva Solicitud
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VISTA 2: SEGUIMIENTO DE SOLICITUDES (7 ESTADOS + SUBSANACIÓN 48H)      */}
      {/* ===================================================================== */}
      {mode === 'tracking' && (
        <div className="space-y-6">
          {/* Buscador de Solicitudes */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
            <div className="max-w-2xl">
              <h2 className="text-xl font-extrabold text-slate-900">
                Consulta de Avance y Estado de Prototipado
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Ingresa el código de solicitud (ej. <strong>3DP-2026-0001</strong>) o tu código UPN de estudiante.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleTrackSearch();
              }}
              className="flex flex-col sm:flex-row items-center gap-2 max-w-xl"
            >
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  value={trackQuery}
                  onChange={(e) => setTrackQuery(e.target.value)}
                  placeholder="3DP-2026-0001 o N00..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-mono text-slate-900 uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={trackingLoading}
                className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 shrink-0 cursor-pointer"
              >
                {trackingLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                ) : (
                  <Search className="w-4 h-4 text-amber-400" />
                )}
                <span>Buscar Solicitud</span>
              </button>
            </form>

            {trackError && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{trackError}</span>
              </div>
            )}
          </div>

          {/* Si hay múltiples resultados para un código UPN */}
          {trackedRequests.length > 1 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">
                Se encontraron {trackedRequests.length} solicitudes asociadas:
              </span>
              <div className="flex flex-wrap gap-2">
                {trackedRequests.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRequest(r)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-colors ${
                      selectedRequest?.id === r.id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {r.code} ({r.status})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* DETALLE COMPLETO DE LA SOLICITUD SELECCIONADA */}
          {selectedRequest && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-10 space-y-8 animate-in fade-in duration-200">
              {/* Cabecera del detalle */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
                <div>
                  <span className="text-xs text-slate-500 font-mono">
                    Solicitud #{selectedRequest.code}
                  </span>
                  <h2 className="text-2xl font-extrabold text-slate-900 mt-0.5">
                    {selectedRequest.studentFullName} ({selectedRequest.upnCode})
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Docente: <strong>{selectedRequest.teacherName}</strong> • Asignatura:{' '}
                    <strong>{selectedRequest.course}</strong> (NRC: {selectedRequest.nrc})
                  </p>
                </div>

                <div className="shrink-0">
                  <StatusBadge status={selectedRequest.status} size="md" />
                </div>
              </div>

              {/* LÍNEA DE TIEMPO DE LOS 7 ESTADOS */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Línea de Tiempo del Prototipado:
                </span>
                <TimelineProgress currentStatus={selectedRequest.status} />
              </div>

              {/* CASO ESPECIAL OBSERVADO: RECUADRO CON CUENTA REGRESIVA 48H Y SUBSANACIÓN */}
              {selectedRequest.status === 'OBSERVADO' && (
                <ObservationPanel
                  request={selectedRequest}
                  resubmitFiles={resubmitFiles}
                  setResubmitFiles={setResubmitFiles}
                  onProcessFiles={processResubmitFiles}
                  onResubmit={() => handleResubmit(selectedRequest.code)}
                  resubmitting={resubmitting}
                  onViewStl={(f) => setViewerFile({ file: f, fileName: f.name })}
                />
              )}

              {/* ARCHIVOS STL DE LA SOLICITUD */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Archivos STL Adjuntos ({selectedRequest.files.length}):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedRequest.files.map((fileMeta) => (
                    <div
                      key={fileMeta.id}
                      className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                            <Box className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-900 block truncate">
                              {fileMeta.originalName}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {(fileMeta.sizeBytes / 1024).toFixed(1)} KB • v{fileMeta.version}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] bg-white p-2.5 rounded-xl border border-slate-200">
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase font-bold">
                              Dimensiones:
                            </span>
                            <span className="font-mono text-slate-800">
                              {fileMeta.dimensionsMm.x} × {fileMeta.dimensionsMm.y} ×{' '}
                              {fileMeta.dimensionsMm.z} mm
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase font-bold">
                              Volumen:
                            </span>
                            <span className="font-mono text-indigo-600 font-bold">
                              {fileMeta.estimatedVolumeCm3} cm³
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* HISTORIAL DE ESTADOS */}
              {selectedRequest.statusHistory && selectedRequest.statusHistory.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-200">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Historial de Eventos:
                  </span>
                  <div className="space-y-2">
                    {selectedRequest.statusHistory.map((log, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl text-xs border border-slate-200"
                      >
                        <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">
                              Estado cambiado a: <StatusBadge status={log.status} size="sm" />
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                          {log.comment && (
                            <p className="text-slate-600 mt-1 italic">&ldquo;{log.comment}&rdquo;</p>
                          )}
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Por: {log.actor}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}


    </div>
  );
}

// ----------------------------------------------------------------------------
// COMPONENTE: LÍNEA DE TIEMPO VISUAL HORIZONTAL (STEPPER 6 PASOS + OBSERVADO)
// ----------------------------------------------------------------------------
function TimelineProgress({ currentStatus }: { currentStatus: Print3DStatus }) {
  // M17: Pasos oficiales del flujo de prototipado 3D
  const steps: { status: Print3DStatus; label: string }[] = [
    { status: 'ENVIADO', label: 'Enviado' },
    { status: 'EN REVISION', label: 'En Revisión' },
    { status: 'EN COLA', label: 'En Cola' },
    { status: 'IMPRIMIENDO', label: 'Imprimiendo' },
    { status: 'LISTA', label: 'Lista' },
    { status: 'ENTREGADA', label: 'Entregada' },
  ];

  // Calcular índice del paso actual
  let activeIndex = 0;
  if (currentStatus === 'EN REVISION' || currentStatus === 'OBSERVADO') {
    activeIndex = 1;
  } else if (currentStatus === 'EN COLA') {
    activeIndex = 2;
  } else if (currentStatus === 'IMPRIMIENDO') {
    activeIndex = 3;
  } else if (currentStatus === 'LISTA') {
    activeIndex = 4;
  } else if (currentStatus === 'ENTREGADA') {
    activeIndex = 5;
  }

  const isObserved = currentStatus === 'OBSERVADO';

  return (
    <div className="space-y-4">
      {/* Alerta si está observado en revisión */}
      {isObserved && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 flex items-center gap-3 text-rose-900 shadow-2xs animate-in fade-in">
          <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 animate-bounce" />
          </div>
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider block">
              Observado en Revisión (Requiere Subsanación)
            </span>
            <span className="text-[11px] text-rose-700">
              El asistente técnico ha solicitado correcciones en tus archivos .STL dentro de la ventana de 48 horas.
            </span>
          </div>
        </div>
      )}

      {/* Stepper Horizontal */}
      <div className="overflow-x-auto py-3">
        <div className="flex items-center min-w-[720px] justify-between relative px-2">
          {/* Barra conectora de fondo */}
          <div className="absolute top-5 left-8 right-8 h-1 bg-slate-200 -z-0" />

          {steps.map((step, idx) => {
            const isPassed = idx < activeIndex;
            const isCurrent = idx === activeIndex;

            return (
              <div key={step.status} className="flex flex-col items-center relative z-10 space-y-2">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                    isCurrent && isObserved
                      ? 'bg-rose-500 text-white ring-4 ring-rose-200 shadow-md animate-pulse'
                      : isCurrent
                      ? 'bg-amber-500 text-slate-950 font-black ring-4 ring-amber-200 shadow-md'
                      : isPassed
                      ? 'bg-emerald-500 text-white ring-2 ring-emerald-100 shadow-xs'
                      : 'bg-white border-2 border-slate-300 text-slate-400'
                  }`}
                >
                  {isCurrent && isObserved ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : isPassed ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={`text-[11px] whitespace-nowrap text-center ${
                    isCurrent && isObserved
                      ? 'text-rose-600 font-extrabold'
                      : isCurrent
                      ? 'text-amber-800 font-extrabold'
                      : isPassed
                      ? 'text-emerald-700 font-bold'
                      : 'text-slate-400 font-medium'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// COMPONENTE: PANEL DE OBSERVACIÓN CON RELOJ REGRESIVO DE 48 HORAS
// ----------------------------------------------------------------------------
interface ObservationPanelProps {
  request: Print3DRequest;
  resubmitFiles: StlLocalFile[];
  setResubmitFiles: React.Dispatch<React.SetStateAction<StlLocalFile[]>>;
  onProcessFiles: (files: FileList | File[]) => void;
  onResubmit: () => void;
  resubmitting: boolean;
  onViewStl: (file: File) => void;
}

function ObservationPanel({
  request,
  resubmitFiles,
  setResubmitFiles,
  onProcessFiles,
  onResubmit,
  resubmitting,
  onViewStl,
}: ObservationPanelProps) {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    expired: boolean;
  }>({ hours: 0, minutes: 0, seconds: 0, expired: false });

  useEffect(() => {
    // Si no tiene observationExpiresAt pero está observado, calcular 48 horas desde createdAt
    const expiresMs = request.observationExpiresAt
      ? new Date(request.observationExpiresAt).getTime()
      : new Date(request.createdAt).getTime() + 48 * 60 * 60 * 1000;

    const updateTimer = () => {
      const now = Date.now();
      const diff = expiresMs - now;

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, expired: true });
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ hours, minutes, seconds, expired: false });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [request.observationExpiresAt, request.createdAt]);

  return (
    <div className="bg-rose-50/70 border-2 border-rose-300 rounded-3xl p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-rose-900">
              Solicitud Observada por el Asistente Técnico
            </h3>
            <p className="text-xs text-rose-700 mt-0.5">
              Tu modelo requiere correcciones geométricas o de parámetros antes de pasar a manufactura.
            </p>
          </div>
        </div>

        {/* RELOJ REGRESIVO EN VIVO (HORAS : MINUTOS : SEGUNDOS) */}
        <div className="bg-white rounded-2xl px-5 py-3 border border-rose-200 shadow-xs text-center shrink-0">
          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">
            Plazo Límite de 48 Horas:
          </span>
          {timeLeft.expired ? (
            <span className="text-sm font-bold text-rose-700">Plazo Vencido</span>
          ) : (
            <div className="text-base sm:text-lg font-mono font-extrabold text-rose-800 tracking-wider mt-0.5 flex items-center justify-center gap-1.5">
              <Timer className="w-4 h-4 text-rose-500 animate-spin" />
              <span>
                {String(timeLeft.hours).padStart(2, '0')}h : {String(timeLeft.minutes).padStart(2, '0')}m : {String(timeLeft.seconds).padStart(2, '0')}s
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Comentario del Administrador */}
      {request.observationComment && (
        <div className="bg-white rounded-2xl p-4 border border-rose-200 text-xs text-slate-800 space-y-1">
          <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">
            Detalle de la Observación:
          </span>
          <p className="italic font-medium leading-relaxed">
            &ldquo;{request.observationComment}&rdquo;
          </p>
        </div>
      )}

      {/* FORMULARIO DIRECTO PARA SUBIR ARCHIVOS STL CORREGIDOS */}
      {!timeLeft.expired ? (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Subsanar: Carga tus Nuevos Archivos .STL Corregidos
            </h4>
          </div>

          <div className="p-4 bg-white border border-dashed border-rose-300 rounded-2xl text-center">
            <input
              type="file"
              id="resubmit-file-input"
              multiple
              accept=".stl"
              onChange={(e) => {
                if (e.target.files) onProcessFiles(e.target.files);
              }}
              className="sr-only"
            />
            <label
              htmlFor="resubmit-file-input"
              className="cursor-pointer flex flex-col items-center justify-center space-y-1.5"
            >
              <Upload className="w-5 h-5 text-rose-600" />
              <span className="text-xs font-bold text-slate-900">
                Selecciona los archivos .stl corregidos
              </span>
              <span className="text-[10px] text-slate-400">
                Reemplazarán la versión observada y regresarán a estado &quot;EN REVISION&quot;.
              </span>
            </label>
          </div>

          {/* Tarjetas de archivos corregidos */}
          {resubmitFiles.length > 0 && (
            <div className="space-y-2">
              {resubmitFiles.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-white rounded-xl border border-rose-200 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Box className="w-4 h-4 text-indigo-600" />
                    <span className="font-semibold text-slate-800">{item.file.name}</span>
                    <span className="text-[10px] text-slate-400">
                      ({item.parsed.dimensionsMm.x}×{item.parsed.dimensionsMm.y}×{item.parsed.dimensionsMm.z} mm)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setResubmitFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  disabled={resubmitting}
                  onClick={onResubmit}
                  className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  {resubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Enviar Correcciones para Aprobación</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 bg-white rounded-2xl border border-rose-200 text-xs text-rose-800">
          El plazo máximo de 48 horas para subsanar ha caducado. Por favor, acércate presencialmente al laboratorio de Mecatrónica para coordinar una reactivación con el docente asistente.
        </div>
      )}
    </div>
  );
}
