'use client';

import React, { useState, useEffect } from 'react';
import {
  AdminDashboardSummary,
  CloudStorageProvider,
  GoogleWorkspaceConfig,
} from '@/types/labhub';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/shared/ToastProvider';
import {
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Save,
  Plus,
  Trash2,
  GraduationCap,
  Copy,
  Check,
  FolderSync,
  FileSpreadsheet,
  Calendar,
  HelpCircle,
  HardDrive,
  Server,
  UploadCloud,
  DownloadCloud,
  Key,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  Database,
  FileText,
  Box,
  Mail,
  Info,
} from 'lucide-react';

interface AdminGoogleSyncTabProps {
  dashboard: AdminDashboardSummary;
  onRefresh: () => Promise<void>;
}

export function AdminGoogleSyncTab({ dashboard, onRefresh }: AdminGoogleSyncTabProps) {
  const { showToast } = useToast();

  // Estado de configuración de almacenamiento y Google Workspace
  const [config, setConfig] = useState<GoogleWorkspaceConfig>(() => {
    const c = dashboard.googleConfig;
    return {
      enabled: c?.enabled ?? false,
      activeProvider: c?.activeProvider || 'GOOGLE_DRIVE',
      appsScriptWebhookUrl: c?.appsScriptWebhookUrl || '',
      webhookSecret: c?.webhookSecret || '',
      driveFolderName: c?.driveFolderName || 'LabHub_ST_UPN',
      spreadsheetUrl: c?.spreadsheetUrl,
      driveRootFolderUrl: c?.driveRootFolderUrl,
      syncStlFilesToDrive: c?.syncStlFilesToDrive ?? true,
      syncRecordsToSheets: c?.syncRecordsToSheets ?? true,
      syncCalendarAndEmail: c?.syncCalendarAndEmail ?? true,
      persistFullStateInDrive: c?.persistFullStateInDrive ?? true,
      generateLoanDocumentsInDrive: c?.generateLoanDocumentsInDrive ?? true,
      onedrive: {
        tenantId: c?.onedrive?.tenantId || 'common',
        clientId: c?.onedrive?.clientId || '',
        clientSecret: c?.onedrive?.clientSecret || '',
        refreshToken: c?.onedrive?.refreshToken || '',
        rootFolderPath: c?.onedrive?.rootFolderPath || 'LabHub_ST_UPN',
        driveWebUrl: c?.onedrive?.driveWebUrl,
        connectedAccountEmail: c?.onedrive?.connectedAccountEmail,
      },
      lastSyncAt: c?.lastSyncAt,
      lastSyncStatus: c?.lastSyncStatus,
      lastSyncMessage: c?.lastSyncMessage,
    };
  });

  // Sincronizar estado cuando se refresca el dashboard
  useEffect(() => {
    if (dashboard.googleConfig) {
      const c = dashboard.googleConfig;
      setConfig((prev) => ({
        ...prev,
        enabled: c.enabled ?? prev.enabled,
        activeProvider: c.activeProvider || prev.activeProvider || 'GOOGLE_DRIVE',
        appsScriptWebhookUrl: c.appsScriptWebhookUrl ?? prev.appsScriptWebhookUrl,
        webhookSecret: c.webhookSecret ?? prev.webhookSecret,
        driveFolderName: c.driveFolderName ?? prev.driveFolderName,
        spreadsheetUrl: c.spreadsheetUrl ?? prev.spreadsheetUrl,
        driveRootFolderUrl: c.driveRootFolderUrl ?? prev.driveRootFolderUrl,
        syncStlFilesToDrive: c.syncStlFilesToDrive ?? prev.syncStlFilesToDrive,
        syncRecordsToSheets: c.syncRecordsToSheets ?? prev.syncRecordsToSheets,
        syncCalendarAndEmail: c.syncCalendarAndEmail ?? prev.syncCalendarAndEmail,
        persistFullStateInDrive: c.persistFullStateInDrive ?? prev.persistFullStateInDrive,
        generateLoanDocumentsInDrive: c.generateLoanDocumentsInDrive ?? prev.generateLoanDocumentsInDrive,
        onedrive: {
          tenantId: c.onedrive?.tenantId ?? prev.onedrive?.tenantId ?? 'common',
          clientId: c.onedrive?.clientId ?? prev.onedrive?.clientId ?? '',
          clientSecret: c.onedrive?.clientSecret ?? prev.onedrive?.clientSecret ?? '',
          refreshToken: c.onedrive?.refreshToken ?? prev.onedrive?.refreshToken ?? '',
          rootFolderPath: c.onedrive?.rootFolderPath ?? prev.onedrive?.rootFolderPath ?? 'LabHub_ST_UPN',
          driveWebUrl: c.onedrive?.driveWebUrl ?? prev.onedrive?.driveWebUrl,
          connectedAccountEmail: c.onedrive?.connectedAccountEmail ?? prev.onedrive?.connectedAccountEmail,
        },
        lastSyncAt: c.lastSyncAt ?? prev.lastSyncAt,
        lastSyncStatus: c.lastSyncStatus ?? prev.lastSyncStatus,
        lastSyncMessage: c.lastSyncMessage ?? prev.lastSyncMessage,
      }));
    }
  }, [dashboard.googleConfig]);

  // Estados de interfaz y acciones
  const [savingConfig, setSavingConfig] = useState(false);
  const [syncingAction, setSyncingAction] = useState<'PING' | 'FULL_SYNC' | 'PULL_STATE' | null>(null);
  const [authorizingOneDrive, setAuthorizingOneDrive] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [showOneDriveSecret, setShowOneDriveSecret] = useState(false);
  const [copiedScriptPath, setCopiedScriptPath] = useState(false);
  const [copyingScriptCode, setCopyingScriptCode] = useState(false);
  const [copiedScriptCode, setCopiedScriptCode] = useState(false);
  const [copiedRedirectUri, setCopiedRedirectUri] = useState(false);

  // Origen para la URL de Callback de OneDrive
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);
  const oneDriveRedirectUri = `${origin || 'http://localhost:3000'}/api/admin/cloud/onedrive/callback`;

  // Catálogo de docentes
  const [teachers, setTeachers] = useState<string[]>(dashboard.teachersCatalog || []);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [savingTeachers, setSavingTeachers] = useState(false);

  useEffect(() => {
    if (dashboard.teachersCatalog) {
      setTeachers(dashboard.teachersCatalog);
    }
  }, [dashboard.teachersCatalog]);

  // Guardar configuración general de almacenamiento
  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setSavingConfig(true);
      await apiClient.updateGoogleConfig(config);
      showToast('Configuración de almacenamiento guardada exitosamente.', 'success');
      await onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar la configuración.';
      showToast(msg, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  // Acciones en vivo: PING, FULL_SYNC, PULL_STATE
  const handleExecuteSyncAction = async (mode: 'PING' | 'FULL_SYNC' | 'PULL_STATE') => {
    if (mode === 'PULL_STATE') {
      const confirmed = window.confirm(
        '⚠️ ATENCIÓN: RESTAURAR BASE DE DATOS DESDE LA NUBE\n\n' +
        'Esta acción descargará la última copia de seguridad almacenada en tu nube y sobreescribirá el estado actual del servidor.\n\n' +
        '¿Deseas continuar con la restauración?'
      );
      if (!confirmed) return;
    }

    try {
      setSyncingAction(mode);
      const res = await apiClient.testGoogleSync(mode);
      if (res.ok) {
        showToast(res.message || 'Operación completada con éxito.', 'success');
      } else {
        showToast(res.message || 'La operación retornó advertencias.', 'warning');
      }
      await onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al ejecutar la sincronización.';
      showToast(msg, 'error');
    } finally {
      setSyncingAction(null);
    }
  };

  // Autorizar cuenta Microsoft OneDrive con OAuth2
  const handleAuthorizeOneDrive = async () => {
    const clientId = config.onedrive?.clientId?.trim();
    if (!clientId) {
      showToast('Por favor ingresa primero el Client ID de Azure.', 'warning');
      return;
    }

    try {
      setAuthorizingOneDrive(true);
      // Guardar primero la configuración actual en backend para no perder credenciales
      await apiClient.updateGoogleConfig(config);

      const tenantId = config.onedrive?.tenantId?.trim() || 'common';
      const res = await apiClient.getOneDriveAuthUrl(clientId, tenantId);

      if (res.authUrl) {
        showToast('Redirigiendo a Microsoft para autorizar acceso a OneDrive...', 'info');
        window.location.href = res.authUrl;
      } else {
        showToast('No se recibió la URL de autorización.', 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al solicitar autorización con OneDrive.';
      showToast(msg, 'error');
    } finally {
      setAuthorizingOneDrive(false);
    }
  };

  // Copiar utilitarios
  const copyScriptPath = () => {
    navigator.clipboard.writeText('google-apps-script/LabHubGoogleBridge.gs');
    setCopiedScriptPath(true);
    setTimeout(() => setCopiedScriptPath(false), 2000);
    showToast('Ruta copiada: google-apps-script/LabHubGoogleBridge.gs', 'info');
  };

  const copyFullScriptCode = async () => {
    try {
      setCopyingScriptCode(true);
      const res = await fetch('/api/admin/google', {
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Error al obtener el código (${res.status})`);
      }
      const data = await res.json();
      if (!data.scriptContent) {
        throw new Error('No se recibió el código del script desde el servidor.');
      }
      await navigator.clipboard.writeText(data.scriptContent);
      setCopiedScriptCode(true);
      setTimeout(() => setCopiedScriptCode(false), 2500);
      showToast(
        'Código completo de LabHubGoogleBridge.gs copiado al portapapeles. Pégalo en script.google.com y publica una Nueva Versión.',
        'success'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al copiar el código del script.';
      showToast(msg, 'error');
    } finally {
      setCopyingScriptCode(false);
    }
  };

  const copyRedirectUri = () => {
    navigator.clipboard.writeText(oneDriveRedirectUri);
    setCopiedRedirectUri(true);
    setTimeout(() => setCopiedRedirectUri(false), 2000);
    showToast('Redirect URI de Azure copiada al portapapeles.', 'info');
  };

  // Métodos del Catálogo de Docentes (mantener intactos)
  const handleAddTeacher = () => {
    const trimmed = newTeacherName.trim();
    if (!trimmed) return;
    if (teachers.includes(trimmed)) {
      showToast('Este docente ya está registrado en el catálogo.', 'warning');
      return;
    }
    setTeachers([...teachers, trimmed]);
    setNewTeacherName('');
  };

  const handleRemoveTeacher = (name: string) => {
    setTeachers(teachers.filter((t) => t !== name));
  };

  const handleSaveTeachers = async () => {
    try {
      setSavingTeachers(true);
      await apiClient.updateTeachersCatalog(teachers);
      showToast('Catálogo de docentes actualizado exitosamente.', 'success');
      await onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar docentes.';
      showToast(msg, 'error');
    } finally {
      setSavingTeachers(false);
    }
  };

  // Proveedor activo
  const activeProvider: CloudStorageProvider = config.activeProvider || 'GOOGLE_DRIVE';

  // Determinación del estado de conexión visual
  const isGoogleConnected =
    activeProvider === 'GOOGLE_DRIVE' &&
    config.enabled &&
    config.lastSyncStatus === 'SUCCESS';

  const isOneDriveConnected =
    activeProvider === 'ONEDRIVE' &&
    config.enabled &&
    Boolean(config.onedrive?.refreshToken || config.onedrive?.connectedAccountEmail);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* ==================================================================== */}
      {/* 1. ESTADO GENERAL DE LA CONEXIÓN Y PROVEEDOR ACTIVO                  */}
      {/* ==================================================================== */}
      <div
        className={`p-6 rounded-2xl border transition-all ${
          activeProvider === 'LOCAL'
            ? 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
            : isGoogleConnected || isOneDriveConnected
            ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
            : config.enabled
            ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div
              className={`p-3.5 rounded-2xl shrink-0 ${
                activeProvider === 'LOCAL'
                  ? 'bg-slate-800 text-white shadow-md'
                  : isGoogleConnected || isOneDriveConnected
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : config.enabled
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              {activeProvider === 'LOCAL' ? (
                <Server className="w-6 h-6" />
              ) : activeProvider === 'ONEDRIVE' ? (
                <HardDrive className="w-6 h-6" />
              ) : (
                <Cloud className="w-6 h-6" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Almacenamiento en la Nube y Respaldo a Costo $0
                </h3>
                <span
                  className={`px-3 py-0.5 rounded-full text-[11px] font-bold ${
                    activeProvider === 'LOCAL'
                      ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                      : isGoogleConnected || isOneDriveConnected
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                      : config.enabled
                      ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-300'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {activeProvider === 'LOCAL'
                    ? 'Disco Local Activo'
                    : isGoogleConnected
                    ? 'Google Drive: Conectado'
                    : isOneDriveConnected
                    ? 'OneDrive: Vinculado'
                    : config.enabled
                    ? 'Configurado (Pendiente de Verificación)'
                    : 'Desconectado'}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FDBA30]/20 text-[#8C5E00] dark:text-[#FDBA30] border border-[#FDBA30]/30">
                  {activeProvider === 'GOOGLE_DRIVE'
                    ? 'Google Drive (15 GB Gratis)'
                    : activeProvider === 'ONEDRIVE'
                    ? 'Microsoft OneDrive (Hasta 1 TB UPN)'
                    : 'Disco Local Servidor'}
                </span>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 max-w-3xl leading-relaxed">
                Centraliza y aloja de forma persistente todos los modelos 3D (<strong>.stl</strong>),
                actas de entrega de equipos con firmas digitales, reportes en hojas de cálculo y respaldo total de la
                base de datos sin incurrir en costos de servidores externos.
              </p>

              {config.lastSyncAt && (
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-mono flex-wrap">
                  <span>Última sincronización: {new Date(config.lastSyncAt).toLocaleString('es-PE')}</span>
                  <span>•</span>
                  <span>
                    Estado:{' '}
                    <strong
                      className={
                        config.lastSyncStatus === 'SUCCESS' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
                      }
                    >
                      {config.lastSyncStatus}
                    </strong>
                  </span>
                  {config.lastSyncMessage && <span>({config.lastSyncMessage})</span>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Enlaces directos a Drive, Sheets o OneDrive cuando estén disponibles */}
        {(config.driveRootFolderUrl ||
          config.spreadsheetUrl ||
          config.onedrive?.driveWebUrl ||
          config.onedrive?.connectedAccountEmail) && (
          <div className="mt-5 pt-4 border-t border-slate-200/60 dark:border-slate-800 flex items-center gap-2.5 flex-wrap text-xs">
            {config.driveRootFolderUrl && (
              <a
                href={config.driveRootFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-amber-700 bg-amber-100/70 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 transition-colors shadow-2xs"
              >
                <HardDrive className="w-3.5 h-3.5" />
                Carpeta Maestra en Google Drive
                <ExternalLink className="w-3 h-3 ml-0.5" />
              </a>
            )}

            {config.spreadsheetUrl && (
              <a
                href={config.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-emerald-700 bg-emerald-100/70 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 transition-colors shadow-2xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Base de Datos en Google Sheets
                <ExternalLink className="w-3 h-3 ml-0.5" />
              </a>
            )}

            {config.onedrive?.driveWebUrl && (
              <a
                href={config.onedrive.driveWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-sky-700 bg-sky-100/70 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-300 transition-colors shadow-2xs"
              >
                <HardDrive className="w-3.5 h-3.5" />
                Carpeta Maestra en OneDrive
                <ExternalLink className="w-3 h-3 ml-0.5" />
              </a>
            )}

            {config.onedrive?.connectedAccountEmail && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300">
                <Mail className="w-3.5 h-3.5 text-sky-500" />
                Cuenta Microsoft: {config.onedrive.connectedAccountEmail}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 2. BARRA DE ACCIONES DE SINCRONIZACIÓN EN VIVO                      */}
      {/* ==================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <FolderSync className="w-4 h-4 text-amber-500" />
              Operaciones Rápidas en la Nube
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ejecuta pruebas de conexión, sincronización completa forzada o restauración del estado del laboratorio.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {/* Botón 1: Guardar Configuración */}
          <button
            type="button"
            disabled={savingConfig}
            onClick={() => handleSaveConfig()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Save className={`w-4 h-4 ${savingConfig ? 'animate-spin' : ''}`} />
            {savingConfig ? 'Guardando...' : 'Guardar Configuración'}
          </button>

          {/* Botón 2: Probar Conexión */}
          <button
            type="button"
            disabled={syncingAction !== null}
            onClick={() => handleExecuteSyncAction('PING')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncingAction === 'PING' ? 'animate-spin' : ''}`} />
            {syncingAction === 'PING' ? 'Probando...' : 'Probar Conexión'}
          </button>

          {/* Botón 3: Subir Todo a la Nube (Full Sync) */}
          <button
            type="button"
            disabled={syncingAction !== null || activeProvider === 'LOCAL'}
            onClick={() => handleExecuteSyncAction('FULL_SYNC')}
            title="Sube y respalda inmediatamente todos los archivos .stl, actas con firmas y la base de datos completa"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <UploadCloud className={`w-4 h-4 ${syncingAction === 'FULL_SYNC' ? 'animate-bounce' : ''}`} />
            {syncingAction === 'FULL_SYNC' ? 'Subiendo Todo...' : 'Subir Todo a mi Nube (Full Sync)'}
          </button>

          {/* Botón 4: Restaurar BD desde Nube */}
          <button
            type="button"
            disabled={syncingAction !== null || activeProvider === 'LOCAL'}
            onClick={() => handleExecuteSyncAction('PULL_STATE')}
            title="Restaura la base de datos de LabHub ST a partir del archivo de respaldo JSON guardado en la nube"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <DownloadCloud className={`w-4 h-4 ${syncingAction === 'PULL_STATE' ? 'animate-bounce' : ''}`} />
            {syncingAction === 'PULL_STATE' ? 'Restaurando...' : 'Restaurar BD desde Nube'}
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. SELECTOR VISUAL DE PROVEEDOR DE ALMACENAMIENTO                    */}
      {/* ==================================================================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Selecciona el Proveedor de Almacenamiento Principal
          </label>
          <span className="text-[11px] text-slate-500">Costo de infraestructura: $0</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Opción 1: Google Drive */}
          <div
            onClick={() => setConfig({ ...config, activeProvider: 'GOOGLE_DRIVE' })}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
              activeProvider === 'GOOGLE_DRIVE'
                ? 'border-[#FDBA30] bg-amber-50/50 dark:bg-amber-950/20 shadow-md ring-2 ring-[#FDBA30]/20'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-700 dark:text-amber-400">
                  <Cloud className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    15 GB Gratis
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FDBA30] text-slate-900">
                    Recomendado
                  </span>
                </div>
              </div>

              <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                Google Drive & Google Workspace
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Google Drive (.stl y firmas) + Google Sheets (reportes) + Google Calendar (invitaciones automáticas).
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-300">Google Apps Script</span>
              <input
                type="radio"
                name="provider"
                checked={activeProvider === 'GOOGLE_DRIVE'}
                onChange={() => setConfig({ ...config, activeProvider: 'GOOGLE_DRIVE' })}
                className="w-4 h-4 text-amber-600 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Opción 2: Microsoft OneDrive */}
          <div
            onClick={() => setConfig({ ...config, activeProvider: 'ONEDRIVE' })}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
              activeProvider === 'ONEDRIVE'
                ? 'border-[#FDBA30] bg-amber-50/50 dark:bg-amber-950/20 shadow-md ring-2 ring-[#FDBA30]/20'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/60 flex items-center justify-center text-sky-700 dark:text-sky-400">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                    Hasta 1 TB UPN
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                    Microsoft 365
                  </span>
                </div>
              </div>

              <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                Microsoft OneDrive & Office 365
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Almacena en tu cuenta institucional UPN (1 TB) o Microsoft personal (5 GB) mediante Microsoft Graph API.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-300">OAuth2 Graph API</span>
              <input
                type="radio"
                name="provider"
                checked={activeProvider === 'ONEDRIVE'}
                onChange={() => setConfig({ ...config, activeProvider: 'ONEDRIVE' })}
                className="w-4 h-4 text-amber-600 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Opción 3: Disco Local */}
          <div
            onClick={() => setConfig({ ...config, activeProvider: 'LOCAL' })}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
              activeProvider === 'LOCAL'
                ? 'border-[#FDBA30] bg-amber-50/50 dark:bg-amber-950/20 shadow-md ring-2 ring-[#FDBA30]/20'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300">
                  <Server className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                  Sin Dependencias
                </span>
              </div>

              <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                Almacenamiento en Disco Local
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Guarda todos los archivos y base de datos directamente en el disco duro del servidor local (carpeta storage/data).
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-300">Sistema de Archivos</span>
              <input
                type="radio"
                name="provider"
                checked={activeProvider === 'LOCAL'}
                onChange={() => setConfig({ ...config, activeProvider: 'LOCAL' })}
                className="w-4 h-4 text-amber-600 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 4. CONFIGURACIÓN DETALLADA SEGÚN EL PROVEEDOR SELECCIONADO           */}
      {/* ==================================================================== */}

      {/* -------------------------------------------------------------------- */}
      {/* 4A. PROVEEDOR: GOOGLE DRIVE & GOOGLE WORKSPACE                       */}
      {/* -------------------------------------------------------------------- */}
      {activeProvider === 'GOOGLE_DRIVE' && (
        <div className="space-y-6">
          {/* Guía de 3 Pasos */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Guía Rápida en 3 Pasos para Conectar Google Drive ($0)
                </h3>
              </div>
              <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                Tiempo estimado: 2 minutos
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Paso 1 */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                <div>
                  <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-bold text-xs inline-flex items-center justify-center mb-2">
                    1
                  </span>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">
                    Abre Google Apps Script
                  </h4>
                  <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Ingresa con tu cuenta de Google (personal o institucional UPN) a{' '}
                    <a
                      href="https://script.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-600 font-semibold hover:underline inline-flex items-center gap-0.5"
                    >
                      script.google.com <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    y haz clic en <strong>"Nuevo proyecto"</strong>.
                  </p>
                </div>
              </div>

              {/* Paso 2 */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                <div>
                  <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-bold text-xs inline-flex items-center justify-center mb-2">
                    2
                  </span>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">
                    Copia el Puente Incluido
                  </h4>
                  <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Copia el contenido íntegro del archivo listo para producción ubicado en:
                  </p>

                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      onClick={copyFullScriptCode}
                      disabled={copyingScriptCode}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                      title="Copiar código fuente completo para pegar en Google Apps Script"
                    >
                      {copyingScriptCode ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Obteniendo código...</span>
                        </>
                      ) : copiedScriptCode ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>¡Código .gs Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar Código Completo (.gs)</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                      <code className="font-mono text-[10px] text-amber-700 dark:text-amber-400 truncate">
                        google-apps-script/LabHubGoogleBridge.gs
                      </code>
                      <button
                        type="button"
                        onClick={copyScriptPath}
                        className="p-1 text-slate-400 hover:text-amber-600 cursor-pointer"
                        title="Copiar ruta"
                      >
                        {copiedScriptPath ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Paso 3 */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                <div>
                  <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-bold text-xs inline-flex items-center justify-center mb-2">
                    3
                  </span>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">
                    Implementa como Aplicación Web
                  </h4>
                  <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Haz clic en <strong>Implementar &gt; Nueva implementación &gt; Tipo: Aplicación web</strong>. En{' '}
                    <em>"Quién tiene acceso"</em> selecciona <strong>"Cualquier usuario"</strong> y pega la URL en el formulario.
                  </p>
                </div>
              </div>
            </div>

            {/* Nota clara para actualización / re-despliegue del código */}
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold text-amber-900 dark:text-amber-100">
                  Nota obligatoria al actualizar el código en script.google.com:
                </p>
                <p className="leading-relaxed text-amber-800 dark:text-amber-300">
                  En <strong className="font-semibold text-amber-950 dark:text-amber-100">script.google.com</strong>, tras pegar el código actualizado, es obligatorio ir a{' '}
                  <span className="font-bold text-amber-950 dark:text-amber-100 bg-amber-100/80 dark:bg-amber-900/40 px-1 py-0.5 rounded">
                    Implementar &gt; Administrar implementaciones &gt; Editar (ícono de lápiz) &gt; Versión: &quot;Nueva versión&quot; &gt; Implementar
                  </span>{' '}
                  para que Google Apps Script ejecute el nuevo código en lugar de la versión antigua en caché.
                </p>
              </div>
            </div>
          </div>

          {/* Formulario de Configuración de Google Workspace */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 dark:text-white pb-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <Cloud className="w-5 h-5 text-amber-500" />
              Parámetros de Google Workspace & Google Apps Script
            </h3>

            <form onSubmit={handleSaveConfig} className="mt-5 space-y-5">
              {/* Interruptor maestro */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Habilitar Sincronización Automática con Google Workspace
                </span>
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    URL del Webhook de Google Apps Script *
                  </label>
                  <input
                    type="url"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={config.appsScriptWebhookUrl}
                    onChange={(e) =>
                      setConfig({ ...config, appsScriptWebhookUrl: e.target.value })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    URL pública generada al implementar la aplicación web en script.google.com
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Clave Secreta del Webhook (Opcional)
                  </label>
                  <div className="relative">
                    <input
                      type={showWebhookSecret ? 'text' : 'password'}
                      placeholder="Token opcional de autenticación"
                      value={config.webhookSecret || ''}
                      onChange={(e) =>
                        setConfig({ ...config, webhookSecret: e.target.value })
                      }
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 pr-10 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showWebhookSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Si configuraste un <code>SECRET_KEY</code> en Apps Script para mayor seguridad
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Nombre de Carpeta Raíz en Google Drive
                  </label>
                  <input
                    type="text"
                    placeholder="LabHub_ST_UPN"
                    value={config.driveFolderName}
                    onChange={(e) =>
                      setConfig({ ...config, driveFolderName: e.target.value })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Esta carpeta se creará en la raíz de tu Google Drive para organizar archivos .stl, actas y base de datos.
                  </p>
                </div>
              </div>

              {/* Switches específicos para Google */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 text-xs">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Módulos a Sincronizar con Google Drive & Google Workspace:
                </h4>

                <label className="flex items-start gap-3 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.syncStlFilesToDrive}
                    onChange={(e) =>
                      setConfig({ ...config, syncStlFilesToDrive: e.target.checked })
                    }
                    className="w-4 h-4 mt-0.5 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-semibold block text-slate-900 dark:text-white">
                      Alojar archivos 3D (.stl) en Google Drive
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Sube automáticamente los modelos 3D enviados por los estudiantes a la carpeta de Impresión 3D en Drive.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.syncRecordsToSheets}
                    onChange={(e) =>
                      setConfig({ ...config, syncRecordsToSheets: e.target.checked })
                    }
                    className="w-4 h-4 mt-0.5 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-semibold block text-slate-900 dark:text-white">
                      Sincronizar hojas de cálculo en Google Sheets
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Crea y actualiza pestañas con el historial de reservas de laboratorio, asesorías y préstamos en una hoja de Google Sheets.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.syncCalendarAndEmail}
                    onChange={(e) =>
                      setConfig({ ...config, syncCalendarAndEmail: e.target.checked })
                    }
                    className="w-4 h-4 mt-0.5 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-semibold block text-slate-900 dark:text-white">
                      Eventos en Google Calendar y notificaciones por Gmail
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Crea automáticamente eventos en el Google Calendar institucional de los 4 asesores e invita a los alumnos.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.persistFullStateInDrive ?? true}
                    onChange={(e) =>
                      setConfig({ ...config, persistFullStateInDrive: e.target.checked })
                    }
                    className="w-4 h-4 mt-0.5 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-semibold block text-slate-900 dark:text-white">
                      Respaldo completo de Base de Datos en Drive (Full State Backup)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Guarda una copia de seguridad JSON íntegra de la base de datos de LabHub ST para permitir restauración en cualquier momento.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.generateLoanDocumentsInDrive ?? true}
                    onChange={(e) =>
                      setConfig({ ...config, generateLoanDocumentsInDrive: e.target.checked })
                    }
                    className="w-4 h-4 mt-0.5 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-semibold block text-slate-900 dark:text-white">
                      Generación y Almacenamiento de Actas de Préstamo con Firma Digital
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Sube las imágenes de firma digital en PNG y genera el registro documental del préstamo directamente en Drive.
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {savingConfig ? 'Guardando...' : 'Guardar Configuración de Google'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 4B. PROVEEDOR: MICROSOFT ONEDRIVE (OFFICE 365 / UPN)                 */}
      {/* -------------------------------------------------------------------- */}
      {activeProvider === 'ONEDRIVE' && (
        <div className="space-y-6">
          {/* Guía de 3 Pasos para Azure App Registration */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-sky-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Guía Rápida para Conectar Microsoft OneDrive (Hasta 1 TB UPN)
                </h3>
              </div>
              <span className="text-xs text-sky-600 dark:text-sky-400 font-semibold">
                OAuth2 Microsoft Graph
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Paso 1 */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                <div>
                  <span className="w-6 h-6 rounded-full bg-sky-500 text-white font-bold text-xs inline-flex items-center justify-center mb-2">
                    1
                  </span>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">
                    Registra la App en Azure Portal ($0)
                  </h4>
                  <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Ingresa a{' '}
                    <a
                      href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-600 font-semibold hover:underline inline-flex items-center gap-0.5"
                    >
                      portal.azure.com <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    &gt; <strong>App registrations</strong> &gt; <strong>Nueva inscripción</strong>. En tipos de cuenta elige{' '}
                    <em>"Cuentas en cualquier directorio organizativo y cuentas personales de Microsoft"</em>.
                  </p>
                </div>
              </div>

              {/* Paso 2 */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                <div>
                  <span className="w-6 h-6 rounded-full bg-sky-500 text-white font-bold text-xs inline-flex items-center justify-center mb-2">
                    2
                  </span>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">
                    Configura la Redirect URI
                  </h4>
                  <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    En la sección <strong>Autenticación</strong> de tu app en Azure, añade una plataforma de tipo{' '}
                    <strong>Web</strong> y registra exactamente esta URI:
                  </p>
                  <div className="mt-2 flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <code className="font-mono text-[10px] text-sky-700 dark:text-sky-400 truncate">
                      {oneDriveRedirectUri}
                    </code>
                    <button
                      type="button"
                      onClick={copyRedirectUri}
                      className="p-1 text-slate-400 hover:text-sky-600 cursor-pointer"
                      title="Copiar URI"
                    >
                      {copiedRedirectUri ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Paso 3 */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                <div>
                  <span className="w-6 h-6 rounded-full bg-sky-500 text-white font-bold text-xs inline-flex items-center justify-center mb-2">
                    3
                  </span>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">
                    Crea el Secreto y Autoriza
                  </h4>
                  <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Ve a <strong>Certificados y secretos &gt; Nuevo secreto de cliente</strong>. Copia el <em>Valor</em> en el formulario
                    y pulsa el botón <strong>"Autorizar cuenta con OAuth2"</strong> para obtener el Refresh Token de 1 TB.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Formulario de Configuración de OneDrive */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-sky-500" />
                Credenciales de Microsoft Azure & OneDrive
              </h3>

              {config.onedrive?.connectedAccountEmail && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Conectado a: {config.onedrive.connectedAccountEmail}
                </span>
              )}
            </div>

            <form onSubmit={handleSaveConfig} className="mt-5 space-y-5">
              {/* Interruptor maestro */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Habilitar Sincronización Automática con Microsoft OneDrive
                </span>
              </label>

              {/* Caja destacada con la Redirect URI requerida */}
              <div className="p-4 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                      Redirect URI para Azure Portal (Plataforma Web):
                    </span>
                    <p className="font-mono text-xs text-sky-950 dark:text-sky-200 mt-0.5 break-all">
                      {oneDriveRedirectUri}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={copyRedirectUri}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shrink-0 cursor-pointer shadow-2xs"
                  >
                    {copiedRedirectUri ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedRedirectUri ? 'Copiado' : 'Copiar URI'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tenant ID */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Tenant ID (Inquilino)
                  </label>
                  <input
                    type="text"
                    placeholder="common"
                    value={config.onedrive?.tenantId || 'common'}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        onedrive: {
                          ...(config.onedrive || {
                            clientId: '',
                            clientSecret: '',
                            refreshToken: '',
                            rootFolderPath: 'LabHub_ST_UPN',
                          }),
                          tenantId: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Usa <code>common</code> para cuentas tanto personales como universitarias UPN.
                  </p>
                </div>

                {/* Client ID */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Client ID (ID de la Aplicación en Azure) *
                  </label>
                  <input
                    type="text"
                    placeholder="ej. 8a7b6c5d-4e3f-2a1b-0c9d-8e7f6a5b4c3d"
                    value={config.onedrive?.clientId || ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        onedrive: {
                          ...(config.onedrive || {
                            tenantId: 'common',
                            clientSecret: '',
                            refreshToken: '',
                            rootFolderPath: 'LabHub_ST_UPN',
                          }),
                          clientId: e.target.value.trim(),
                        },
                      })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Copiado de la sección <em>Información general</em> de tu aplicación en Azure Portal.
                  </p>
                </div>

                {/* Client Secret */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Client Secret (Secreto del Cliente)
                  </label>
                  <div className="relative">
                    <input
                      type={showOneDriveSecret ? 'text' : 'password'}
                      placeholder="Valor del secreto generado en Azure"
                      value={config.onedrive?.clientSecret || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          onedrive: {
                            ...(config.onedrive || {
                              tenantId: 'common',
                              clientId: '',
                              refreshToken: '',
                              rootFolderPath: 'LabHub_ST_UPN',
                            }),
                            clientSecret: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 pr-10 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOneDriveSecret(!showOneDriveSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showOneDriveSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Valor (no el ID del secreto) generado en <em>Certificados y secretos</em>.
                  </p>
                </div>

                {/* Carpeta Raíz en OneDrive */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Carpeta Raíz en OneDrive
                  </label>
                  <input
                    type="text"
                    placeholder="LabHub_ST_UPN"
                    value={config.onedrive?.rootFolderPath || 'LabHub_ST_UPN'}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        onedrive: {
                          ...(config.onedrive || {
                            tenantId: 'common',
                            clientId: '',
                            clientSecret: '',
                            refreshToken: '',
                          }),
                          rootFolderPath: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Carpeta donde se almacenarán las subcarpetas de modelos 3D y respaldos.
                  </p>
                </div>

                {/* Refresh Token (OAuth2) */}
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">
                      Refresh Token Offline (OAuth2)
                    </label>
                    {config.onedrive?.refreshToken ? (
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Token Activo
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-600">Requiere Autorización</span>
                    )}
                  </div>
                  <input
                    type="password"
                    placeholder="Se generará automáticamente al pulsar 'Autorizar cuenta de Microsoft OneDrive'"
                    value={config.onedrive?.refreshToken || ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        onedrive: {
                          ...(config.onedrive || {
                            tenantId: 'common',
                            clientId: '',
                            clientSecret: '',
                            rootFolderPath: 'LabHub_ST_UPN',
                          }),
                          refreshToken: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 font-mono"
                  />
                </div>
              </div>

              {/* Botón de Autorización OAuth2 con Microsoft */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Key className="w-4 h-4 text-sky-500" />
                    Autorización Automática OAuth2 con Microsoft
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Guarda las credenciales y te redirige a login.microsoftonline.com para otorgar permisos a OneDrive.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={authorizingOneDrive || !config.onedrive?.clientId}
                  onClick={handleAuthorizeOneDrive}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-xs transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <ExternalLink className={`w-4 h-4 ${authorizingOneDrive ? 'animate-spin' : ''}`} />
                  {authorizingOneDrive ? 'Conectando...' : 'Autorizar cuenta de Microsoft OneDrive (OAuth2)'}
                </button>
              </div>

              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {savingConfig ? 'Guardando...' : 'Guardar Configuración de OneDrive'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 4C. PROVEEDOR: ALMACENAMIENTO EN DISCO LOCAL                         */}
      {/* -------------------------------------------------------------------- */}
      {activeProvider === 'LOCAL' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Almacenamiento Local en Servidor Activo
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed max-w-2xl">
                En esta modalidad, todos los archivos <strong>.stl</strong> de impresión 3D, las firmas digitales
                en PNG y el archivo de base de datos se almacenan exclusivamente en el sistema de archivos del servidor
                (carpeta local <code>./storage</code> y <code>./data</code>).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="w-4 h-4" /> Ventajas del modo local
              </h4>
              <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                <li>Funciona sin conexión a internet ni dependencias externas.</li>
                <li>Cero configuración de claves, tokens o registros en la nube.</li>
                <li>Privacidad absoluta de los archivos en la red universitaria local.</li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-1.5">
                <Info className="w-4 h-4" /> Consideraciones
              </h4>
              <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                <li>Los archivos consumen espacio en el disco duro del servidor físico.</li>
                <li>No hay sincronización con Google Calendar ni hojas de cálculo compartidas.</li>
                <li>Para habilitar respaldo redundante $0, cambia a Google Drive o OneDrive arriba.</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={savingConfig}
              onClick={() => handleSaveConfig()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {savingConfig ? 'Guardando...' : 'Confirmar Almacenamiento Local'}
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 5. GESTOR DEL CATÁLOGO DE DOCENTES (INTACTO SEGÚN REQUERIMIENTO)     */}
      {/* ==================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-amber-500" />
              Catálogo de Docentes de Laboratorio ({teachers.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Estos docentes aparecen como opciones de autocompletado en los formularios de reserva, préstamo de equipos y programación de clases.
            </p>
          </div>

          <button
            type="button"
            disabled={savingTeachers}
            onClick={handleSaveTeachers}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {savingTeachers ? 'Guardando Catálogo...' : 'Guardar Cambios de Docentes'}
          </button>
        </div>

        {/* Formulario rápido para agregar docente */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newTeacherName}
            onChange={(e) => setNewTeacherName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTeacher();
              }
            }}
            placeholder="ej. Ing. Carlos Alberto Mendoza Ríos"
            className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
          />
          <button
            type="button"
            onClick={handleAddTeacher}
            className="px-4 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Agregar
          </button>
        </div>

        {/* Lista de docentes en píldoras / tarjetas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2">
          {teachers.map((teacher, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs"
            >
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate pr-2">
                {teacher}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveTeacher(teacher)}
                className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                title="Quitar docente"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
