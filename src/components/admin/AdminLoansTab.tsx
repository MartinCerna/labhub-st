'use client';

import React, { useState } from 'react';
import {
  AdminDashboardSummary,
  EquipmentLoan,
  EquipmentLoanStatus,
  LabId,
} from '@/types/labhub';
import { LAB_MAP } from '@/constants/schedule';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/shared/ToastProvider';
import { StatusBadge } from '@/components/shared/StatusBadge';
import {
  Wrench,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Printer,
  X,
  FileText,
  UserCheck,
  Calendar,
  Layers,
  MapPin,
  PenTool,
  AlertCircle,
  Eye,
} from 'lucide-react';

interface AdminLoansTabProps {
  dashboard: AdminDashboardSummary;
  onRefresh: () => Promise<void>;
}

export function AdminLoansTab({ dashboard, onRefresh }: AdminLoansTabProps) {
  const { showToast } = useToast();

  const loans = dashboard.loans;
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedLabId, setSelectedLabId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Préstamo seleccionado para modal de inspección / impresión
  const [activeLoanModal, setActiveLoanModal] = useState<EquipmentLoan | null>(null);

  // Estado de acción entregar
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filtrado de préstamos
  const filteredLoans = loans.filter((loan) => {
    if (selectedStatus !== 'ALL' && loan.status !== selectedStatus) {
      return false;
    }
    if (selectedLabId !== 'ALL' && loan.labId !== selectedLabId) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCode = loan.code.toLowerCase().includes(q);
      const matchResp = loan.responsibleName.toLowerCase().includes(q);
      const matchUpn = loan.responsibleUpnCode.toLowerCase().includes(q);
      const matchCourse = loan.courseProgram.toLowerCase().includes(q);
      const matchTeacher = loan.teacherName.toLowerCase().includes(q);
      const matchItems = loan.items.some(
        (it) => it.equipmentName.toLowerCase().includes(q) || it.upnCode.toLowerCase().includes(q)
      );
      if (!matchCode && !matchResp && !matchUpn && !matchCourse && !matchTeacher && !matchItems) {
        return false;
      }
    }
    return true;
  });

  // Marcar como ENTREGADO
  const handleMarkAsDelivered = async (loan: EquipmentLoan) => {
    try {
      setUpdatingId(loan.id);
      await apiClient.updateLoanStatus(
        loan.id,
        'ENTREGADO',
        deliveryNotes.trim() || 'Equipos devueltos y validados por el personal del laboratorio.'
      );
      showToast(`Préstamo ${loan.code} marcado como ENTREGADO exitosamente.`, 'success');
      setDeliveryNotes('');
      if (activeLoanModal?.id === loan.id) {
        setActiveLoanModal(null);
      }
      await onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar la devolución del préstamo.';
      showToast(msg, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* BARRA DE FILTROS Y BÚSQUEDA */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Filtros de estado */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mr-1">
              <Filter className="w-3.5 h-3.5" />
              Estado:
            </span>
            <button
              type="button"
              onClick={() => setSelectedStatus('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                selectedStatus === 'ALL'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Todos ({loans.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('PENDIENTE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                selectedStatus === 'PENDIENTE'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Pendientes ({loans.filter((l) => l.status === 'PENDIENTE').length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('ENTREGADO')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                selectedStatus === 'ENTREGADO'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Entregados ({loans.filter((l) => l.status === 'ENTREGADO').length})
            </button>
          </div>

          {/* Filtro por Laboratorio */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Laboratorio:</span>
            <select
              value={selectedLabId}
              onChange={(e) => setSelectedLabId(e.target.value)}
              className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">Todos los Laboratorios</option>
              <option value="automatizacion">Automatización</option>
              <option value="electronica">Electrónica</option>
              <option value="mecatronica">Mecatrónica</option>
            </select>
          </div>
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por código (EQP-...), alumno responsable, código UPN, docente o equipo prestado..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* LISTADO DE ACTAS DE PRÉSTAMO */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-500" />
            Formatos de Préstamo Registrados ({filteredLoans.length})
          </h3>
          {filteredLoans.length !== loans.length && (
            <button
              type="button"
              onClick={() => {
                setSelectedStatus('ALL');
                setSelectedLabId('ALL');
                setSearchQuery('');
              }}
              className="text-xs text-amber-600 hover:underline"
            >
              Restablecer filtros
            </button>
          )}
        </div>

        {filteredLoans.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center">
            <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No se encontraron préstamos
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No hay solicitudes de préstamo que coincidan con los filtros aplicados.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredLoans.map((loan) => {
              const labInfo = LAB_MAP[loan.labId];
              const totalItemsCount = loan.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
              const isUpdating = updatingId === loan.id;

              return (
                <div
                  key={loan.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 transition-all hover:border-slate-300 dark:hover:border-slate-700"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-xs font-bold px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                        {loan.code}
                      </span>
                      <StatusBadge status={loan.status} size="sm" />
                      <span className="text-xs text-slate-500 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(loan.createdAt).toLocaleDateString('es-PE', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {labInfo?.name || loan.labId}
                      </span>
                    </div>

                    {/* Botones de acción rápida */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveLoanModal(loan)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Ver Acta Completa
                      </button>

                      {loan.status === 'PENDIENTE' && (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleMarkAsDelivered(loan)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Marcar como ENTREGADO
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Resumen en 3 columnas */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    {/* Responsable y Grupo */}
                    <div>
                      <p className="text-[11px] font-bold uppercase text-slate-400">Responsable:</p>
                      <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                        {loan.responsibleName}
                      </p>
                      <p className="text-slate-500 font-mono">Código UPN: {loan.responsibleUpnCode}</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Integrantes: <strong className="text-slate-700 dark:text-slate-300">{loan.groupMembers.length} alumnos</strong>
                      </p>
                    </div>

                    {/* Datos Académicos */}
                    <div>
                      <p className="text-[11px] font-bold uppercase text-slate-400">Datos Académicos:</p>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                        Docente: <strong className="text-slate-900 dark:text-white">{loan.teacherName}</strong>
                      </p>
                      <p className="text-slate-500">
                        {loan.courseProgram} • {loan.cycle}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Atendido por: <span className="font-semibold">{loan.attendedByName}</span>
                      </p>
                    </div>

                    {/* Resumen de Equipos y Firma */}
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase text-slate-400">Equipos Solicitados:</p>
                        <p className="font-bold text-amber-600 mt-0.5">
                          {totalItemsCount} unidades ({loan.items.length} ítems)
                        </p>
                        <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                          {loan.items.slice(0, 2).map((it, idx) => (
                            <li key={idx} className="truncate">
                              • {it.quantity}x {it.equipmentName} ({it.upnCode})
                            </li>
                          ))}
                          {loan.items.length > 2 && (
                            <li className="text-slate-400 italic">
                              +{loan.items.length - 2} ítem(s) más...
                            </li>
                          )}
                        </ul>
                      </div>

                      {/* Miniatura de la firma */}
                      {loan.signatureDataUrl && (
                        <div className="shrink-0 text-center pl-2">
                          <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Firma:</p>
                          <div className="w-20 h-10 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 p-0.5 flex items-center justify-center overflow-hidden">
                            <img
                              src={loan.signatureDataUrl}
                              alt="Firma"
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Estado de devolución si ya fue entregado */}
                  {loan.status === 'ENTREGADO' && loan.deliveredAt && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-1.5 rounded-xl">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Devuelto el {new Date(loan.deliveredAt).toLocaleString('es-PE')} • Recepcionado por: {loan.deliveredByAdmin || 'Personal de Lab'}
                      </span>
                      {loan.adminNotes && (
                        <span className="text-slate-500 italic truncate max-w-xs">
                          "{loan.adminNotes}"
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL / ACTA OFICIAL IMPRIMIBLE */}
      {activeLoanModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-2xl max-w-3xl w-full p-8 shadow-2xl border border-slate-200 my-8 animate-in fade-in zoom-in-95 print:p-0 print:border-none print:shadow-none print:max-w-none">
            {/* Barra superior de control (oculta al imprimir) */}
            <div className="flex items-center justify-between pb-6 border-b border-slate-200 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-bold">Acta Oficial de Préstamo de Equipos</h3>
                <span className="font-mono text-xs px-2.5 py-1 bg-amber-100 text-amber-900 rounded-lg font-bold">
                  {activeLoanModal.code}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir Formato
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLoanModal(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* FORMATO OFICIAL IMPRIMIBLE: "ENTREGA DE MATERIALES Y/O EQUIPOS" */}
            <div className="mt-6 space-y-6 text-xs text-slate-800">
              {/* Membrete Oficial */}
              <div className="border-2 border-slate-900 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black tracking-tight uppercase">
                    Universidad Privada del Norte (UPN)
                  </h2>
                  <p className="text-xs font-bold text-slate-700 uppercase">
                    Facultad de Ingeniería • Dirección de Laboratorios
                  </p>
                  <p className="text-xs font-semibold text-amber-700">
                    {LAB_MAP[activeLoanModal.labId]?.name || activeLoanModal.labId}
                  </p>
                </div>
                <div className="text-right">
                  <div className="border border-slate-900 px-3 py-1 rounded bg-slate-50">
                    <p className="text-[10px] font-bold uppercase text-slate-500">FORMATO</p>
                    <p className="font-black text-sm">ENTREGA DE MATERIALES Y/O EQUIPOS</p>
                    <p className="text-xs font-mono font-bold text-amber-700">
                      N° {activeLoanModal.code}
                    </p>
                  </div>
                </div>
              </div>

              {/* Datos de Encabezado */}
              <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div>
                  <p>
                    <strong>Docente a Cargo:</strong> {activeLoanModal.teacherName}
                  </p>
                  <p className="mt-1">
                    <strong>Ciclo Académico:</strong> {activeLoanModal.cycle}
                  </p>
                  <p className="mt-1">
                    <strong>Fecha de Préstamo:</strong>{' '}
                    {new Date(activeLoanModal.createdAt).toLocaleDateString('es-PE', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div>
                  <p>
                    <strong>Carrera / Curso:</strong> {activeLoanModal.courseProgram}
                  </p>
                  <p className="mt-1">
                    <strong>Asistente que Entregó:</strong> {activeLoanModal.attendedByName}
                  </p>
                  <p className="mt-1">
                    <strong>Estado Actual:</strong>{' '}
                    <span
                      className={`font-bold ${
                        activeLoanModal.status === 'ENTREGADO'
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {activeLoanModal.status}
                    </span>
                  </p>
                </div>
              </div>

              {/* Tabla de Equipos y Materiales */}
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider mb-2 text-slate-700">
                  1. Detalle de Equipos y/o Materiales Solicitados
                </h4>
                <table className="w-full border-collapse border border-slate-300 text-left text-xs">
                  <thead className="bg-slate-100 font-bold uppercase text-slate-700">
                    <tr>
                      <th className="border border-slate-300 p-2 text-center w-16">Cant.</th>
                      <th className="border border-slate-300 p-2">Descripción del Equipo / Material</th>
                      <th className="border border-slate-300 p-2 w-48">Código Patrimonial / UPN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeLoanModal.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="border border-slate-300 p-2 text-center font-bold">
                          {item.quantity}
                        </td>
                        <td className="border border-slate-300 p-2 font-medium">
                          {item.equipmentName}
                        </td>
                        <td className="border border-slate-300 p-2 font-mono">
                          {item.upnCode}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tabla de Integrantes del Grupo */}
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider mb-2 text-slate-700">
                  2. Integrantes del Grupo de Práctica
                </h4>
                <table className="w-full border-collapse border border-slate-300 text-left text-xs">
                  <thead className="bg-slate-100 font-bold uppercase text-slate-700">
                    <tr>
                      <th className="border border-slate-300 p-2 w-12 text-center">N°</th>
                      <th className="border border-slate-300 p-2">Apellidos y Nombres</th>
                      <th className="border border-slate-300 p-2 w-32">NRC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeLoanModal.groupMembers.map((member, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="border border-slate-300 p-2 text-center font-bold">
                          {idx + 1}
                        </td>
                        <td className="border border-slate-300 p-2 font-medium">
                          {member.fullName}
                        </td>
                        <td className="border border-slate-300 p-2 font-mono">
                          {member.nrc}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Sección de Firma del Responsable y Compromiso */}
              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-200">
                <div className="text-[11px] text-slate-600 space-y-2">
                  <p className="font-bold text-slate-800 uppercase">
                    Compromiso del Estudiante Responsable:
                  </p>
                  <p className="leading-relaxed">
                    Me comprometo a utilizar los equipos y materiales descritos conforme a las normativas de seguridad de laboratorios UPN, manteniéndolos en perfecto estado y devolviéndolos al término de la sesión académica.
                  </p>
                  <div className="mt-2 pt-2 border-t border-slate-200">
                    <p>
                      <strong>Alumno Responsable:</strong> {activeLoanModal.responsibleName}
                    </p>
                    <p>
                      <strong>Código UPN:</strong>{' '}
                      <span className="font-mono font-bold text-amber-700">
                        {activeLoanModal.responsibleUpnCode}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Recuadro de Firma Digital */}
                <div className="flex flex-col items-center justify-end">
                  <div className="w-full max-w-xs h-28 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 p-2 flex items-center justify-center relative overflow-hidden">
                    {activeLoanModal.signatureDataUrl ? (
                      <img
                        src={activeLoanModal.signatureDataUrl}
                        alt="Firma Digital"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">Sin firma registrada</span>
                    )}
                  </div>
                  <p className="text-[11px] font-bold uppercase text-slate-700 mt-2 text-center border-t border-slate-400 w-full max-w-xs pt-1">
                    Firma Digital del Estudiante Responsable
                  </p>
                </div>
              </div>

              {/* Recepción y Control Administrativo */}
              {activeLoanModal.status === 'ENTREGADO' && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900">
                  <p className="font-bold uppercase flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Recepción y Conformidad de Laboratorio
                  </p>
                  <p className="mt-1">
                    Devolución recepcionada el {activeLoanModal.deliveredAt} por:{' '}
                    <strong>{activeLoanModal.deliveredByAdmin || 'Personal de Laboratorio'}</strong>
                  </p>
                  {activeLoanModal.adminNotes && (
                    <p className="mt-0.5 text-slate-600 italic">
                      Nota de conformidad: "{activeLoanModal.adminNotes}"
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Acción de Recepción dentro del Modal (solo si sigue pendiente) */}
            {activeLoanModal.status === 'PENDIENTE' && (
              <div className="mt-6 pt-5 border-t border-slate-200 print:hidden space-y-3">
                <label className="block text-xs font-bold uppercase text-slate-700">
                  Nota Administrativa de Devolución (Opcional):
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    placeholder="ej. Equipos recibidos completos y en perfecto estado funcional."
                    className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    disabled={updatingId === activeLoanModal.id}
                    onClick={() => handleMarkAsDelivered(activeLoanModal)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {updatingId === activeLoanModal.id ? 'Guardando...' : 'Confirmar Devolución'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
