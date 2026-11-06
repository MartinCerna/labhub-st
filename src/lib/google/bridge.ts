import {
  AdvisoryRequest,
  EquipmentLoan,
  GoogleWorkspaceConfig,
  LabReservation,
  Print3DRequest,
} from '@/types/labhub';
import { dbRepository } from '@/lib/storage/db';
import { oneDriveClient } from '@/lib/cloud/onedrive-client';
import { TIME_BLOCK_MAP } from '@/constants/schedule';
import { buildAdvisoryCalendarDetails, buildGoogleCalendarUrl } from '@/lib/calendar/ics';
import {
  extractSignaturePngBuffer,
  generateLoanActaHtml,
} from '@/lib/documents/loan-document';

interface GoogleBridgeResponse {
  ok: boolean;
  scriptVersion?: string;
  message?: string;
  error?: string;
  spreadsheetUrl?: string;
  driveRootFolderUrl?: string;
  driveFolderUrl?: string;
  driveDocumentUrl?: string;
  driveSignatureUrl?: string;
  base64Data?: string;
  state?: any;
  files?: {
    storedFileName: string;
    driveFileId: string;
    driveViewUrl: string;
  }[];
}

function resolveActiveProvider(config: GoogleWorkspaceConfig): 'GOOGLE_DRIVE' | 'ONEDRIVE' | 'LOCAL' {
  if (config.activeProvider === 'ONEDRIVE') {
    return 'ONEDRIVE';
  }
  if (config.activeProvider === 'LOCAL') {
    return 'LOCAL';
  }
  if (config.activeProvider === 'GOOGLE_DRIVE') {
    return 'GOOGLE_DRIVE';
  }
  // Si no está explícito, verificar si existe refresh_token de OneDrive
  if (config.onedrive?.refreshToken && !config.appsScriptWebhookUrl) {
    return 'ONEDRIVE';
  }
  return 'GOOGLE_DRIVE';
}

async function sendGoogleWebhookRequest(
  action: string,
  payload: Record<string, unknown>
): Promise<GoogleBridgeResponse | null> {
  try {
    const db = await dbRepository.getDatabase();
    const config = db.googleConfig;

    if (!config.enabled || !config.appsScriptWebhookUrl) {
      return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const bodyData = {
      action,
      timestamp: new Date().toISOString(),
      webhookSecret: config.webhookSecret,
      payload,
    };

    const res = await fetch(config.appsScriptWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyData),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!res.ok) {
      throw new Error(`Google Apps Script respondió con status HTTP ${res.status}`);
    }

    const json = (await res.json()) as GoogleBridgeResponse;

    await dbRepository.updateDatabase(
      (database) => {
        database.googleConfig.lastSyncAt = new Date().toISOString();
        database.googleConfig.lastSyncStatus = json.ok ? 'SUCCESS' : 'ERROR';
        database.googleConfig.lastSyncMessage =
          json.message ||
          (json.ok
            ? `Evento ${action} sincronizado correctamente con Google Drive.`
            : `Google Apps Script reportó error en ${action}: ${json.error}`);
        if (json.spreadsheetUrl) {
          database.googleConfig.spreadsheetUrl = json.spreadsheetUrl;
        }
        if (json.driveRootFolderUrl) {
          database.googleConfig.driveRootFolderUrl = json.driveRootFolderUrl;
        }
      },
      { skipCloudStatePush: true }
    );

    return json;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Error desconocido al conectar con Google';
    console.warn(`[GoogleBridge] Fallo al enviar evento ${action}:`, errorMessage);

    try {
      await dbRepository.updateDatabase(
        (database) => {
          database.googleConfig.lastSyncAt = new Date().toISOString();
          database.googleConfig.lastSyncStatus = 'ERROR';
          database.googleConfig.lastSyncMessage = `Fallo en ${action}: ${errorMessage}`;
        },
        { skipCloudStatePush: true }
      );
    } catch {
      // Ignorar fallos secundarios al persistir log
    }

    return null;
  }
}

/**
 * Guarda el snapshot labhub_state.json en la nube activa si persistFullStateInDrive !== false.
 */
async function pushStateSnapshotIfEnabled(): Promise<void> {
  try {
    const db = await dbRepository.getDatabase();
    const config = db.googleConfig;
    if (!config.enabled || config.persistFullStateInDrive === false) return;

    const provider = resolveActiveProvider(config);
    if (provider === 'ONEDRIVE' && config.onedrive?.refreshToken) {
      await oneDriveClient.saveDatabaseSnapshot(config.onedrive, db);
    } else if (provider === 'GOOGLE_DRIVE' && config.appsScriptWebhookUrl) {
      await sendGoogleWebhookRequest('SAVE_STATE', { state: db });
    }
  } catch (e) {
    console.warn('[CloudBridge] Error al actualizar snapshot en la nube:', e);
  }
}

export const googleBridge = {
  pushStateOnly: async (): Promise<void> => {
    await pushStateSnapshotIfEnabled();
  },

  /**
   * Prueba de conectividad unificada:
   * Si el proveedor es ONEDRIVE: valida tokens, consulta usuario Microsoft /me y crea carpeta raíz.
   * Si el proveedor es GOOGLE_DRIVE: envía PING_INIT hacia Google Apps Script Webhook.
   */
  pingInit: async (): Promise<{
    ok: boolean;
    message: string;
    googleConfig: GoogleWorkspaceConfig;
  }> => {
    const db = await dbRepository.getDatabase();
    const config = db.googleConfig;
    const provider = resolveActiveProvider(config);

    if (provider === 'ONEDRIVE') {
      if (!config.onedrive?.clientId || !config.onedrive?.refreshToken) {
        return {
          ok: false,
          message:
            'No se ha completado la vinculación con Microsoft OneDrive (falta Client ID o autorización OAuth2).',
          googleConfig: config,
        };
      }

      try {
        const userInfo = await oneDriveClient.getCurrentUser(config.onedrive);
        const folder = await oneDriveClient.ensureFolder(config.onedrive, '');

        const updatedConfig = await dbRepository.updateDatabase(
          (database) => {
            database.googleConfig.enabled = true;
            database.googleConfig.activeProvider = 'ONEDRIVE';
            database.googleConfig.driveRootFolderUrl = folder.webUrl;
            if (!database.googleConfig.onedrive) {
              database.googleConfig.onedrive = {
                tenantId: 'common',
                clientId: '',
                clientSecret: '',
                refreshToken: '',
                rootFolderPath: 'LabHub_ST_UPN',
              };
            }
            database.googleConfig.onedrive.connectedAccountEmail = userInfo.mail || userInfo.userPrincipalName;
            database.googleConfig.onedrive.driveWebUrl = folder.webUrl;
            database.googleConfig.lastSyncAt = new Date().toISOString();
            database.googleConfig.lastSyncStatus = 'SUCCESS';
            database.googleConfig.lastSyncMessage = `Conectado a OneDrive como ${userInfo.displayName} (${userInfo.mail || userInfo.userPrincipalName}).`;
            return database.googleConfig;
          },
          { skipCloudStatePush: true }
        );

        return {
          ok: true,
          message: `Conexión con Microsoft OneDrive establecida exitosamente para ${userInfo.displayName} (${userInfo.mail || userInfo.userPrincipalName}).`,
          googleConfig: updatedConfig,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error al conectar con Microsoft Graph API.';
        await dbRepository.updateDatabase(
          (database) => {
            database.googleConfig.lastSyncAt = new Date().toISOString();
            database.googleConfig.lastSyncStatus = 'ERROR';
            database.googleConfig.lastSyncMessage = msg;
          },
          { skipCloudStatePush: true }
        );

        const currentDb = await dbRepository.getDatabase();
        return {
          ok: false,
          message: msg,
          googleConfig: currentDb.googleConfig,
        };
      }
    }

    // Por defecto: GOOGLE_DRIVE
    if (!config.appsScriptWebhookUrl) {
      return {
        ok: false,
        message: 'No se ha configurado la URL del Webhook de Google Apps Script.',
        googleConfig: config,
      };
    }

    const response = await sendGoogleWebhookRequest('PING_INIT', {
      driveFolderName: config.driveFolderName || 'LabHub_ST_UPN',
    });

    const updatedDb = await dbRepository.getDatabase();

    if (response && response.ok) {
      return {
        ok: true,
        message: response.message || 'Conexión con Google Workspace establecida exitosamente.',
        googleConfig: updatedDb.googleConfig,
      };
    }

    return {
      ok: false,
      message:
        updatedDb.googleConfig.lastSyncMessage ||
        'No se pudo conectar con el Webhook de Google Apps Script. Verifique la URL y permisos.',
      googleConfig: updatedDb.googleConfig,
    };
  },

  /**
   * Sincronización completa masiva hacia la nube activa (Google Drive o OneDrive):
   * 1. Sube snapshot íntegro de la BD (labhub_state.json).
   * 2. Genera y actualiza reportes en Sheets / CSVs UTF-8.
   * 3. Sube actas de préstamo pendientes y archivos STL sin subir.
   */
  pushFullSync: async (): Promise<{
    ok: boolean;
    message: string;
    details?: Record<string, unknown>;
  }> => {
    const db = await dbRepository.getDatabase();
    const config = db.googleConfig;
    const provider = resolveActiveProvider(config);

    // Regenerar y asegurar enlaces exactos de Google Calendar en todas las asesorías
    if (Array.isArray(db.advisories)) {
      for (const adv of db.advisories) {
        if (adv.blockIds && adv.blockIds.length > 0 && adv.date) {
          try {
            adv.calendarEventUrl = buildGoogleCalendarUrl(buildAdvisoryCalendarDetails(adv));
          } catch {}
        }
      }
    }

    if (provider === 'ONEDRIVE') {
      if (!config.onedrive?.refreshToken) {
        throw new Error('No hay sesión activa de Microsoft OneDrive.');
      }

      // 0. Sincronizar/actualizar calendario de asesorías programadas en Microsoft Graph
      if (config.syncCalendarAndEmail !== false && Array.isArray(db.advisories)) {
        for (const adv of db.advisories) {
          if (adv.status === 'PROGRAMADA') {
            await oneDriveClient.createCalendarEventForAdvisory(config.onedrive, adv);
          }
        }
      }

      // 1. Snapshot de la base de datos
      const stateUpload = await oneDriveClient.saveDatabaseSnapshot(config.onedrive, db);

      // 2. Reportes CSV con BOM UTF-8
      const csvReports = await oneDriveClient.syncCsvReports(config.onedrive, db);

      // 3. Subir archivos STL pendientes a OneDrive
      let stlUploadedCount = 0;
      for (const printReq of db.prints) {
        for (const file of printReq.files) {
          if (!file.driveFileId) {
            const fileBuf = dbRepository.readStlFile(printReq.code, file.storedFileName);
            if (fileBuf) {
              const relPath = `Impresiones_3D/${printReq.code}/${file.storedFileName}`;
              const uploaded = await oneDriveClient.uploadSmallOrLargeFile(
                config.onedrive,
                relPath,
                fileBuf,
                'application/vnd.ms-pki.stl'
              );
              file.driveFileId = uploaded.id;
              file.driveViewUrl = uploaded.webUrl;
              stlUploadedCount++;
            }
          }
        }
      }

      // 4. Subir Actas HTML pendientes
      let loansUploadedCount = 0;
      for (const loan of db.loans) {
        if (!loan.driveDocumentUrl) {
          const actaHtml = generateLoanActaHtml(loan);
          const relPath = `Prestamos_Equipos/${loan.code}/Acta_${loan.code}.html`;
          const uploaded = await oneDriveClient.uploadSmallOrLargeFile(
            config.onedrive,
            relPath,
            Buffer.from(actaHtml, 'utf-8'),
            'text/html; charset=utf-8'
          );
          loan.driveDocumentUrl = uploaded.webUrl;
          loansUploadedCount++;

          const sigBuf = extractSignaturePngBuffer(loan.signatureDataUrl);
          if (sigBuf && !loan.driveSignatureUrl) {
            const sigRelPath = `Prestamos_Equipos/${loan.code}/Firma_${loan.code}.png`;
            const uploadedSig = await oneDriveClient.uploadSmallOrLargeFile(
              config.onedrive,
              sigRelPath,
              sigBuf,
              'image/png'
            );
            loan.driveSignatureUrl = uploadedSig.webUrl;
          }
        }
      }

      // Persistir referencias generadas
      await dbRepository.replaceDatabaseState(db);

      await dbRepository.updateDatabase(
        (database) => {
          database.googleConfig.lastSyncAt = new Date().toISOString();
          database.googleConfig.lastSyncStatus = 'SUCCESS';
          database.googleConfig.lastSyncMessage = `Full Sync OneDrive completado: State guardado, ${stlUploadedCount} STL y ${loansUploadedCount} Actas.`;
        },
        { skipCloudStatePush: true }
      );

      return {
        ok: true,
        message: 'Sincronización completa con Microsoft OneDrive finalizada con éxito.',
        details: {
          stateFileUrl: stateUpload.webUrl,
          csvReports,
          stlUploadedCount,
          loansUploadedCount,
        },
      };
    }

    // Si es GOOGLE_DRIVE
    if (!config.appsScriptWebhookUrl) {
      throw new Error('No se ha configurado la URL del Webhook de Google Apps Script.');
    }

    const res = await sendGoogleWebhookRequest('SAVE_STATE', { state: db });
    if (!res || !res.ok) {
      throw new Error(res?.error || 'No se pudo guardar el snapshot en Google Drive.');
    }

    return {
      ok: true,
      message: 'Sincronización completa con Google Drive finalizada con éxito.',
      details: {
        stateFileUrl: res.driveRootFolderUrl,
      },
    };
  },

  /**
   * Restaura o hidrata el estado completo de la base de datos a partir del snapshot
   * almacenado en Google Drive o Microsoft OneDrive.
   */
  pullStateFromCloud: async (): Promise<{
    ok: boolean;
    message: string;
    restored?: boolean;
  }> => {
    const db = await dbRepository.getDatabase();
    const config = db.googleConfig;
    const provider = resolveActiveProvider(config);

    if (provider === 'ONEDRIVE') {
      if (!config.onedrive?.refreshToken) {
        throw new Error('No hay sesión de OneDrive activa para restaurar datos.');
      }

      const remoteState = await oneDriveClient.loadDatabaseSnapshot(config.onedrive);
      if (!remoteState) {
        return {
          ok: false,
          message: 'No se encontró un archivo labhub_state.json previo en Microsoft OneDrive.',
          restored: false,
        };
      }

      await dbRepository.replaceDatabaseState(remoteState);
      return {
        ok: true,
        message: 'Estado de LabHub restaurado exitosamente desde Microsoft OneDrive.',
        restored: true,
      };
    }

    // Si es GOOGLE_DRIVE
    if (!config.appsScriptWebhookUrl) {
      throw new Error('No se ha configurado la URL de Google Apps Script.');
    }

    const response = await sendGoogleWebhookRequest('GET_STATE', {});
    if (!response || !response.ok) {
      throw new Error(response?.error || 'Fallo al solicitar estado a Google Drive.');
    }

    if (!response.state) {
      return {
        ok: false,
        message: 'No existe copia de respaldo labhub_state.json en Google Drive.',
        restored: false,
      };
    }

    await dbRepository.replaceDatabaseState(response.state);
    return {
      ok: true,
      message: 'Estado restaurado exitosamente desde Google Drive.',
      restored: true,
    };
  },

  /**
   * Recupera un archivo STL binario desde Google Drive o Microsoft OneDrive cuando no existe
   * en el disco local (ideal para Vercel o servidores efímeros serverless), y lo almacena
   * en la caché local para siguientes lecturas.
   */
  fetchRemoteStlBuffer: async (
    code: string,
    storedFileName: string,
    driveFileId?: string
  ): Promise<Buffer | null> => {
    try {
      const db = await dbRepository.getDatabase();
      const config = db.googleConfig;
      const provider = resolveActiveProvider(config);

      let buffer: Buffer | null = null;

      if (provider === 'ONEDRIVE' && config.onedrive?.refreshToken) {
        buffer = await oneDriveClient.downloadFileByIdOrPath(config.onedrive, {
          itemId: driveFileId,
          remoteRelativePath: `Impresiones_3D/${code}/${storedFileName}`,
        });
      } else if (provider === 'GOOGLE_DRIVE' && config.appsScriptWebhookUrl) {
        const res = await sendGoogleWebhookRequest('FETCH_STL_FILE', {
          driveFileId,
          code,
          storedFileName,
        });

        if (res && res.ok && res.base64Data) {
          buffer = Buffer.from(res.base64Data, 'base64');
        }
      }

      if (buffer && buffer.length > 0) {
        // Guardar en caché local de disco para acelerar próximas visualizaciones
        try {
          await dbRepository.saveStlFile(code, storedFileName, buffer);
        } catch {
          // Ignorar fallos de escritura en disco de solo lectura
        }
        return buffer;
      }

      return null;
    } catch (e) {
      console.warn(`[CloudBridge] Error al descargar STL remoto (${code}/${storedFileName}):`, e);
      return null;
    }
  },

  syncReservation: async (
    reservation: LabReservation,
    operation: 'CREATE' | 'CANCEL' = 'CREATE'
  ): Promise<void> => {
    const db = await dbRepository.getDatabase();
    if (!db.googleConfig.enabled) return;

    const provider = resolveActiveProvider(db.googleConfig);

    if (provider === 'ONEDRIVE' && db.googleConfig.onedrive?.refreshToken) {
      await dbRepository.updateDatabase(
        (database) => {
          const item = database.reservations.find((r) => r.id === reservation.id);
          if (item) item.googleSynced = true;
        },
        { skipCloudStatePush: true }
      );
      await pushStateSnapshotIfEnabled();
      return;
    }

    if (db.googleConfig.syncRecordsToSheets && db.googleConfig.appsScriptWebhookUrl) {
      sendGoogleWebhookRequest('SYNC_RESERVATION', {
        operation,
        reservation,
      }).then(async (res) => {
        if (res && res.ok) {
          await dbRepository.updateDatabase(
            (database) => {
              const item = database.reservations.find((r) => r.id === reservation.id);
              if (item) item.googleSynced = true;
            },
            { skipCloudStatePush: true }
          );
        }
        await pushStateSnapshotIfEnabled();
      });
    }
  },

  syncAdvisory: async (
    advisory: AdvisoryRequest
  ): Promise<{ synced: boolean; outdatedAppsScript?: boolean }> => {
    const db = await dbRepository.getDatabase();
    if (!db.googleConfig.enabled) return { synced: false };

    const sortedBlocks = [...(advisory.blockIds || [])].sort(
      (a, b) => (TIME_BLOCK_MAP[a]?.order ?? 0) - (TIME_BLOCK_MAP[b]?.order ?? 0)
    );
    const firstBlock = sortedBlocks[0] ? TIME_BLOCK_MAP[sortedBlocks[0]] : undefined;
    const lastBlock = sortedBlocks[sortedBlocks.length - 1]
      ? TIME_BLOCK_MAP[sortedBlocks[sortedBlocks.length - 1]]
      : undefined;

    const startTime = firstBlock?.startTime || '09:10';
    const endTime = lastBlock?.endTime || '10:40';
    const blocksLabel = sortedBlocks
      .map((b) => TIME_BLOCK_MAP[b]?.label || b)
      .join(', ');

    const provider = resolveActiveProvider(db.googleConfig);

    if (provider === 'ONEDRIVE' && db.googleConfig.onedrive?.refreshToken) {
      // Intentar crear o actualizar evento en calendario de Microsoft Graph
      if (db.googleConfig.syncCalendarAndEmail !== false) {
        await oneDriveClient.createCalendarEventForAdvisory(db.googleConfig.onedrive, advisory);
      }
      await dbRepository.updateDatabase(
        (database) => {
          const item = database.advisories.find((a) => a.id === advisory.id);
          if (item) {
            item.calendarNotified = true;
            try {
              item.calendarEventUrl = buildGoogleCalendarUrl(buildAdvisoryCalendarDetails(item));
            } catch {}
          }
        },
        { skipCloudStatePush: true }
      );
      await pushStateSnapshotIfEnabled();
      return { synced: true, outdatedAppsScript: false };
    }

    if (db.googleConfig.appsScriptWebhookUrl) {
      const res = await sendGoogleWebhookRequest('SYNC_ADVISORY', {
        advisory,
        startTime,
        endTime,
        blocksLabel,
        syncCalendar: db.googleConfig.syncCalendarAndEmail,
        syncCalendarV2: db.googleConfig.syncCalendarAndEmail,
        syncSheets: db.googleConfig.syncRecordsToSheets,
      });

      if (res && res.ok) {
        const isUpdatedScript = Boolean(res.scriptVersion || (res as any).eventUrl !== undefined);

        await dbRepository.updateDatabase(
          (database) => {
            const item = database.advisories.find((a) => a.id === advisory.id);
            if (item) {
              if (isUpdatedScript) {
                item.calendarNotified = true;
              }
              try {
                item.calendarEventUrl = buildGoogleCalendarUrl(buildAdvisoryCalendarDetails(item));
              } catch {}
            }
          },
          { skipCloudStatePush: true }
        );

        await pushStateSnapshotIfEnabled();

        if (!isUpdatedScript && db.googleConfig.syncCalendarAndEmail !== false) {
          return { synced: true, outdatedAppsScript: true };
        }

        return { synced: true, outdatedAppsScript: false };
      }

      await pushStateSnapshotIfEnabled();
      return { synced: false, outdatedAppsScript: false };
    }

    return { synced: false };
  },

  syncLoan: async (loan: EquipmentLoan): Promise<void> => {
    const db = await dbRepository.getDatabase();
    if (!db.googleConfig.enabled) return;

    const provider = resolveActiveProvider(db.googleConfig);
    const actaHtml = generateLoanActaHtml(loan);
    const signatureBuffer = extractSignaturePngBuffer(loan.signatureDataUrl);

    if (provider === 'ONEDRIVE' && db.googleConfig.onedrive?.refreshToken) {
      try {
        let driveDocumentUrl = loan.driveDocumentUrl;
        let driveSignatureUrl = loan.driveSignatureUrl;

        // Subir Acta HTML
        const docUpload = await oneDriveClient.uploadSmallOrLargeFile(
          db.googleConfig.onedrive,
          `Prestamos_Equipos/${loan.code}/Acta_${loan.code}.html`,
          Buffer.from(actaHtml, 'utf-8'),
          'text/html; charset=utf-8'
        );
        driveDocumentUrl = docUpload.webUrl;

        // Subir Firma PNG si está disponible
        if (signatureBuffer) {
          const sigUpload = await oneDriveClient.uploadSmallOrLargeFile(
            db.googleConfig.onedrive,
            `Prestamos_Equipos/${loan.code}/Firma_${loan.code}.png`,
            signatureBuffer,
            'image/png'
          );
          driveSignatureUrl = sigUpload.webUrl;
        }

        await dbRepository.updateDatabase(
          (database) => {
            const item = database.loans.find((l) => l.id === loan.id);
            if (item) {
              item.googleSynced = true;
              item.driveDocumentUrl = driveDocumentUrl;
              item.driveSignatureUrl = driveSignatureUrl;
            }
          },
          { skipCloudStatePush: true }
        );

        await pushStateSnapshotIfEnabled();
      } catch (e) {
        console.warn('[CloudBridge] Error subiendo préstamo a OneDrive:', e);
      }
      return;
    }

    if (db.googleConfig.appsScriptWebhookUrl) {
      sendGoogleWebhookRequest('SYNC_LOAN', {
        loan,
        actaHtml,
      }).then(async (res) => {
        if (res && res.ok) {
          await dbRepository.updateDatabase(
            (database) => {
              const item = database.loans.find((l) => l.id === loan.id);
              if (item) {
                item.googleSynced = true;
                if (res.driveDocumentUrl) item.driveDocumentUrl = res.driveDocumentUrl;
                if (res.driveSignatureUrl) item.driveSignatureUrl = res.driveSignatureUrl;
              }
            },
            { skipCloudStatePush: true }
          );
        }
        await pushStateSnapshotIfEnabled();
      });
    }
  },

  syncPrint3D: async (printRequest: Print3DRequest): Promise<void> => {
    const db = await dbRepository.getDatabase();
    if (!db.googleConfig.enabled) return;

    const provider = resolveActiveProvider(db.googleConfig);

    if (provider === 'ONEDRIVE' && db.googleConfig.onedrive?.refreshToken) {
      try {
        let anyUploaded = false;
        for (const fileMeta of printRequest.files) {
          if (!fileMeta.driveFileId) {
            const buf = dbRepository.readStlFile(printRequest.code, fileMeta.storedFileName);
            if (buf) {
              const relPath = `Impresiones_3D/${printRequest.code}/${fileMeta.storedFileName}`;
              const uploaded = await oneDriveClient.uploadSmallOrLargeFile(
                db.googleConfig.onedrive,
                relPath,
                buf,
                'application/vnd.ms-pki.stl'
              );
              fileMeta.driveFileId = uploaded.id;
              fileMeta.driveViewUrl = uploaded.webUrl;
              anyUploaded = true;
            }
          }
        }

        await dbRepository.updateDatabase(
          (database) => {
            const item = database.prints.find((p) => p.id === printRequest.id);
            if (item) {
              item.googleSynced = true;
              if (anyUploaded) {
                item.files = printRequest.files;
              }
            }
          },
          { skipCloudStatePush: true }
        );

        await pushStateSnapshotIfEnabled();
      } catch (e) {
        console.warn('[CloudBridge] Error subiendo STL a OneDrive:', e);
      }
      return;
    }

    // Google Drive Webhook
    if (db.googleConfig.appsScriptWebhookUrl) {
      const filesWithData = printRequest.files.map((f) => {
        let base64Data: string | undefined;
        if (db.googleConfig.syncStlFilesToDrive) {
          const fileBuf = dbRepository.readStlFile(printRequest.code, f.storedFileName);
          if (fileBuf) {
            base64Data = fileBuf.toString('base64');
          }
        }
        return {
          fileName: f.originalName,
          storedFileName: f.storedFileName,
          sizeBytes: f.sizeBytes,
          base64Data,
        };
      });

      sendGoogleWebhookRequest('SYNC_PRINT_3D', {
        printRequest: {
          id: printRequest.id,
          code: printRequest.code,
          studentFullName: printRequest.studentFullName,
          upnCode: printRequest.upnCode,
          teacherName: printRequest.teacherName,
          course: printRequest.course,
          nrc: printRequest.nrc,
          status: printRequest.status,
          createdAt: printRequest.createdAt,
        },
        files: filesWithData,
      }).then(async (res) => {
        if (res && res.ok) {
          await dbRepository.updateDatabase(
            (database) => {
              const item = database.prints.find((p) => p.id === printRequest.id);
              if (item) {
                item.googleSynced = true;
                if (res.driveFolderUrl) {
                  item.driveFolderUrl = res.driveFolderUrl;
                }
                if (res.files && Array.isArray(res.files)) {
                  for (const uploadedFile of res.files) {
                    const targetFile = item.files.find(
                      (f) => f.storedFileName === uploadedFile.storedFileName
                    );
                    if (targetFile) {
                      targetFile.driveFileId = uploadedFile.driveFileId;
                      targetFile.driveViewUrl = uploadedFile.driveViewUrl;
                    }
                  }
                }
              }
            },
            { skipCloudStatePush: true }
          );
        }
        await pushStateSnapshotIfEnabled();
      });
    }
  },

  syncPrintStatus: async (printRequest: Print3DRequest): Promise<void> => {
    const db = await dbRepository.getDatabase();
    if (!db.googleConfig.enabled) return;

    const provider = resolveActiveProvider(db.googleConfig);

    if (provider === 'ONEDRIVE' && db.googleConfig.onedrive?.refreshToken) {
      await pushStateSnapshotIfEnabled();
      return;
    }

    if (db.googleConfig.syncRecordsToSheets && db.googleConfig.appsScriptWebhookUrl) {
      sendGoogleWebhookRequest('SYNC_PRINT_STATUS', {
        code: printRequest.code,
        status: printRequest.status,
        observationComment: printRequest.observationComment,
        observationExpiresAt: printRequest.observationExpiresAt,
        updatedAt: printRequest.updatedAt,
      }).then(async () => {
        await pushStateSnapshotIfEnabled();
      });
    }
  },
};
