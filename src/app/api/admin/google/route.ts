import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { GoogleWorkspaceConfig } from '@/types/labhub';
import { dbRepository } from '@/lib/storage/db';
import { requireAdminSession } from '@/lib/auth';
import { googleBridge } from '@/lib/google/bridge';

export async function GET(request: NextRequest) {
  try {
    requireAdminSession(request);
    const filePath = path.join(process.cwd(), 'google-apps-script', 'LabHubGoogleBridge.gs');
    const scriptContent = fs.readFileSync(filePath, 'utf-8');
    return NextResponse.json({ scriptContent });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al obtener código de Google Apps Script';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    requireAdminSession(request);
    const body = (await request.json()) as Partial<GoogleWorkspaceConfig>;

    const updatedConfig = await dbRepository.updateDatabase(
      async (db) => {
        if (body.enabled !== undefined) db.googleConfig.enabled = Boolean(body.enabled);
        if (body.activeProvider !== undefined) db.googleConfig.activeProvider = body.activeProvider;
        if (body.appsScriptWebhookUrl !== undefined) {
          db.googleConfig.appsScriptWebhookUrl = body.appsScriptWebhookUrl.trim();
        }
        if (body.webhookSecret !== undefined) {
          db.googleConfig.webhookSecret = body.webhookSecret.trim();
        }
        if (body.driveFolderName !== undefined) {
          db.googleConfig.driveFolderName = body.driveFolderName.trim();
        }
        if (body.syncStlFilesToDrive !== undefined) {
          db.googleConfig.syncStlFilesToDrive = Boolean(body.syncStlFilesToDrive);
        }
        if (body.syncRecordsToSheets !== undefined) {
          db.googleConfig.syncRecordsToSheets = Boolean(body.syncRecordsToSheets);
        }
        if (body.syncCalendarAndEmail !== undefined) {
          db.googleConfig.syncCalendarAndEmail = Boolean(body.syncCalendarAndEmail);
        }
        if (body.persistFullStateInDrive !== undefined) {
          db.googleConfig.persistFullStateInDrive = Boolean(body.persistFullStateInDrive);
        }
        if (body.generateLoanDocumentsInDrive !== undefined) {
          db.googleConfig.generateLoanDocumentsInDrive = Boolean(body.generateLoanDocumentsInDrive);
        }

        if (body.onedrive) {
          if (!db.googleConfig.onedrive) {
            db.googleConfig.onedrive = {
              tenantId: 'common',
              clientId: '',
              clientSecret: '',
              refreshToken: '',
              rootFolderPath: 'LabHub_ST_UPN',
            };
          }
          if (body.onedrive.tenantId !== undefined) {
            db.googleConfig.onedrive.tenantId = body.onedrive.tenantId.trim();
          }
          if (body.onedrive.clientId !== undefined) {
            db.googleConfig.onedrive.clientId = body.onedrive.clientId.trim();
          }
          if (body.onedrive.clientSecret !== undefined) {
            db.googleConfig.onedrive.clientSecret = body.onedrive.clientSecret.trim();
          }
          if (body.onedrive.refreshToken !== undefined) {
            db.googleConfig.onedrive.refreshToken = body.onedrive.refreshToken.trim();
          }
          if (body.onedrive.rootFolderPath !== undefined) {
            db.googleConfig.onedrive.rootFolderPath = body.onedrive.rootFolderPath.trim();
          }
        }

        return db.googleConfig;
      },
      { skipCloudStatePush: true }
    );

    return NextResponse.json({ googleConfig: updatedConfig });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al actualizar configuración de nube';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    requireAdminSession(request);

    let mode = 'PING';
    try {
      const body = await request.json();
      if (body?.mode) {
        mode = String(body.mode).trim().toUpperCase();
      }
    } catch {
      // Body vacío o sin JSON: mantener PING por defecto
    }

    if (mode === 'FULL_SYNC') {
      const result = await googleBridge.pushFullSync();
      return NextResponse.json(result);
    }

    if (mode === 'PULL_STATE') {
      const result = await googleBridge.pullStateFromCloud();
      return NextResponse.json(result);
    }

    // Por defecto PING / Inicialización
    const result = await googleBridge.pingInit();
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error en operación con proveedor en la nube';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}
