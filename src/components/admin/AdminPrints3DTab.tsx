'use client';

import React, { useState } from 'react';
import {
  AdminDashboardSummary,
  Print3DRequest,
  Print3DStatus,
  StlFileMetadata,
} from '@/types/labhub';
import { PRINT_3D_STATUSES } from '@/constants/schedule';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/shared/ToastProvider';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { StlViewerModal } from '@/components/shared/StlViewerModal';
import {
  Printer,
  Search,
  Filter,
  Download,
  Eye,
  AlertTriangle,
  Clock,
  ExternalLink,
  CheckCircle2,
  Calendar,
  Layers,
  FileCode,
  Box,
  History,
  X,
  ChevronDown,
} from 'lucide-react';

interface AdminPrints3DTabProps {
  dashboard: AdminDashboardSummary;
  onRefresh: () => Promise<void>;
}

export function AdminPrints3DTab({ dashboard, onRefresh }: AdminPrints3DTabProps) {
  const { showToast } = useToast();

  const printRequests = dashboard.printRequests;
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal 3D STL
  const [viewingStl, setViewingStl] = useState<{ url: string; name: string } | null>(null);

  // Modal de Cambio de Estado
  const [editingRequest, setEditingRequest] = useState<Print3DRequest | null>(null);
  const [targetStatus, setTargetStatus] = useState<Print3DStatus>('EN REVISION');
  const [observationComment, setObservationComment] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  // Filtrado de solicitudes 3D
  const filteredRequests = printRequests.filter((req) => {
    if (selectedStatus !== 'ALL' && req.status !== selectedStatus) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCode = req.code.toLowerCase().includes(q);
      const matchStudent = req.studentFullName.toLowerCase().includes(q);
      const matchUpn = req.upnCode.toLowerCase().includes(q);
      const matchCourse = req.course.toLowerCase().includes(q);
      const matchTeacher = req.teacherName.toLowerCase().includes(q);
      const matchFile = req.files.some((f) => f.originalName.toLowerCase().includes(q));
      if (!matchCode && !matchStudent && !matchUpn && !matchCourse && !matchTeacher && !matchFile) {
        return false;
      }
    }
    return true;
  });

  // Abrir modal de cambio de estado
  const openStatusModal = (req: Print3DRequest) => {
    setEditingRequest(req);
    setTargetStatus(req.status);
    setObservationComment(req.observationComment || '');
  };

  // Guardar nuevo estado
  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest) return;

    if (targetStatus === 'OBSERVADO' && !observationComment.trim()) {
      showToast('El comentario de observación es obligatorio para el estado OBSERVADO.', 'warning');
      return;
    }

    try {
      setSavingStatus(true);
      await apiClient.updatePrint3DStatus(
        editingRequest.id,
        targetStatus,
        targetStatus === 'OBSERVADO' ? observationComment.trim() : undefined
      );
      showToast(
        targetStatus === 'OBSERVADO'
          ? `Solicitud ${editingRequest.code} marcada como OBSERVADA. Se activó el plazo de 72 horas para subsanación.`
          : `Estado de la solicitud ${editingRequest.code} actualizado a ${targetStatus}.`,
        'success'
      );
      setEditingRequest(null);
      await onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar el estado de impresión 3D.';
      showToast(msg, 'error');
    } finally {
      setSavingStatus(false);
    }
  };

  // Cálculo de tiempo restante de observación (72 horas)
  const getObservationTimeLeft = (expiresAtStr?: string) => {
    if (!expiresAtStr) return null;
    const diffMs = new Date(expiresAtStr).getTime() - Date.now();
    if (diffMs <= 0) {
      return { expired: true, text: 'Plazo de 72h vencido' };
    }
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return {
      expired: false,
      text: `${hours}h ${minutes}m restantes`,
      hoursLeft: hours,
    };
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* BARRA DE FILTROS POR LOS 7 ESTADOS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" />
            Filtrar por Estado de Fabricación 3D:
          </span>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedStatus('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                selectedStatus === 'ALL'
                  ? 'bg-amber-600 text-white shadow-xs font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Todos ({printRequests.length})
            </button>

            {PRINT_3D_STATUSES.map((status) => {
              const count = printRequests.filter((r) => r.status === status).length;
              const isSelected = selectedStatus === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedStatus(status)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-amber-600 text-white shadow-xs font-bold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <StatusBadge status={status} size="sm" />
                  <span className="text-[10px] opacity-80">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por código (3DP-...), estudiante, código UPN, docente, curso o nombre de archivo .stl..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* LISTADO DE SOLICITUDES 3D */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <Printer className="w-4 h-4 text-purple-500" />
            Solicitudes de Fabricación 3D ({filteredRequests.length})
          </h3>
          {filteredRequests.length !== printRequests.length && (
            <button
              type="button"
              onClick={() => {
                setSelectedStatus('ALL');
                setSearchQuery('');
              }}
              className="text-xs text-amber-600 hover:underline"
            >
              Restablecer filtros
            </button>
          )}
        </div>

        {filteredRequests.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center">
            <Printer className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No se encontraron solicitudes
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No hay solicitudes de impresión 3D que coincidan con los filtros aplicados.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5">
            {filteredRequests.map((req) => {
              const timeLeft = req.status === 'OBSERVADO' ? getObservationTimeLeft(req.observationExpiresAt) : null;

              return (
                <div
                  key={req.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 transition-all hover:border-slate-300 dark:hover:border-slate-700 space-y-4"
                >
                  {/* Fila superior: Código, Estado, Fecha y Botón de Acción */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-xs font-bold px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                        {req.code}
                      </span>
                      <StatusBadge status={req.status} size="md" />

                      <span className="text-xs text-slate-500 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(req.createdAt).toLocaleDateString('es-PE', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>

                      {/* Contador de 72h si está OBSERVADO */}
                      {timeLeft && (
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                            timeLeft.expired
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-amber-100 text-amber-900 border border-amber-200 animate-pulse'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          {timeLeft.text} (Plazo 72h)
                        </span>
                      )}
                    </div>

                    {/* Botón Cambiar Estado */}
                    <div className="flex items-center gap-2 shrink-0">
                      {req.driveFolderUrl && (
                        <a
                          href={req.driveFolderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-sky-600 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Carpeta Drive
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => openStatusModal(req)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 shadow-xs transition-colors cursor-pointer"
                      >
                        Cambiar Estado
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Datos del Estudiante y Curso */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="text-[11px] font-bold uppercase text-slate-400">Estudiante Solicitante:</p>
                      <p className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">
                        {req.studentFullName}
                      </p>
                      <p className="text-slate-500 font-mono">
                        Código UPN:{' '}
                        <span className="font-bold text-amber-600">{req.upnCode}</span>
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] font-bold uppercase text-slate-400">Datos Académicos:</p>
                      <p className="text-slate-800 dark:text-slate-200 mt-0.5">
                        Docente: <span className="font-semibold">{req.teacherName}</span>
                      </p>
                      <p className="text-slate-500">
                        Curso: {req.course} • NRC: <span className="font-mono">{req.nrc}</span>
                      </p>
                    </div>
                  </div>

                  {/* Alerta de Observación si aplica */}
                  {req.status === 'OBSERVADO' && req.observationComment && (
                    <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-bold">Observación Técnica al Estudiante:</p>
                        <p className="mt-0.5 leading-relaxed italic">"{req.observationComment}"</p>
                        {req.observationExpiresAt && (
                          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
                            Plazo límite de subsanación: {new Date(req.observationExpiresAt).toLocaleString('es-PE')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ARCHIVOS STL ADJUNTOS */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
                      <FileCode className="w-4 h-4 text-slate-400" />
                      Archivos 3D (.stl) Adjuntos ({req.files.length}):
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {req.files.map((file: StlFileMetadata) => {
                        const sizeKb = (file.sizeBytes / 1024).toFixed(1);
                        const sizeMb = (file.sizeBytes / (1024 * 1024)).toFixed(2);
                        const displaySize = file.sizeBytes > 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

                        return (
                          <div
                            key={file.id}
                            className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs flex flex-col justify-between space-y-2"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900 dark:text-white truncate" title={file.originalName}>
                                  {file.originalName}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                  v{file.version}
                                </span>
                              </div>

                              <div className="text-[11px] text-slate-500 space-y-0.5">
                                <p>
                                  Peso: <strong className="text-slate-700 dark:text-slate-300">{displaySize}</strong> ({file.format})
                                </p>
                                <p>
                                  Triángulos: <span className="font-mono">{file.triangleCount.toLocaleString()}</span>
                                </p>
                                <p className="text-amber-700 dark:text-amber-400 font-medium">
                                  Dim: {file.dimensionsMm.x.toFixed(1)} × {file.dimensionsMm.y.toFixed(1)} × {file.dimensionsMm.z.toFixed(1)} mm
                                </p>
                                <p className="text-emerald-700 dark:text-emerald-400 font-medium">
                                  Volumen: ~{file.estimatedVolumeCm3.toFixed(2)} cm³
                                </p>
                              </div>
                            </div>

                            {/* Botones de acción del archivo */}
                            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => setViewingStl({ url: file.downloadUrl, name: file.originalName })}
                                className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                              >
                                <Eye className="w-3 h-3" />
                                Vista 3D
                              </button>

                              <a
                                href={file.downloadUrl}
                                download={file.originalName}
                                className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg text-[11px] font-semibold transition-colors"
                              >
                                <Download className="w-3 h-3" />
                                Descargar
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Historial de Estados */}
                  {req.statusHistory && req.statusHistory.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <details className="text-xs group">
                        <summary className="font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer flex items-center gap-1.5 select-none">
                          <History className="w-3.5 h-3.5" />
                          Ver historial de cambios ({req.statusHistory.length} registros)
                        </summary>
                        <div className="mt-2 space-y-1.5 pl-4 border-l-2 border-slate-200 dark:border-slate-700 text-[11px]">
                          {req.statusHistory.map((hist, idx) => (
                            <div key={idx} className="flex items-baseline gap-2 text-slate-600 dark:text-slate-400">
                              <span className="font-bold text-slate-800 dark:text-slate-200">
                                {hist.status}
                              </span>
                              <span className="text-slate-400">
                                {new Date(hist.timestamp).toLocaleTimeString('es-PE', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              <span>por {hist.actor}</span>
                              {hist.comment && <span className="italic text-slate-500">"{hist.comment}"</span>}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: CAMBIAR ESTADO DE IMPRESIÓN 3D */}
      {editingRequest && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Actualizar Estado de Fabricación
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Solicitud: {editingRequest.code} • {editingRequest.studentFullName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRequest(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStatus} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5">
                  Nuevo Estado del Proceso
                </label>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value as Print3DStatus)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-amber-500"
                >
                  {PRINT_3D_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {/* Si es OBSERVADO, requerir comentario de observación y advertir sobre 72h */}
              {targetStatus === 'OBSERVADO' && (
                <div className="space-y-2 animate-in fade-in">
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200">
                    <p className="font-bold flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-amber-600" />
                      Activación de Plazo de 72 Horas
                    </p>
                    <p className="text-[11px] mt-1 leading-relaxed">
                      Al marcar como <strong>OBSERVADO</strong>, el estudiante recibirá la notificación y se iniciará automáticamente una cuenta regresiva de <strong>72 horas</strong> para que suba los archivos .stl corregidos en el portal.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                      Comentario de Observación Técnica (Obligatorio)
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={observationComment}
                      onChange={(e) => setObservationComment(e.target.value)}
                      placeholder="ej. El grosor de pared en la base es menor a 0.8 mm y la geometría requiere orientación a 45° con soportes. Corregir y reenviar."
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingRequest(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingStatus}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {savingStatus ? 'Guardando...' : 'Confirmar Estado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VISOR 3D STL */}
      {viewingStl && (
        <StlViewerModal
          downloadUrl={viewingStl.url}
          fileName={viewingStl.name}
          onClose={() => setViewingStl(null)}
        />
      )}
    </div>
  );
}
