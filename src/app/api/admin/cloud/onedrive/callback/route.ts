import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/auth';
import { dbRepository } from '@/lib/storage/db';
import { oneDriveClient } from '@/lib/cloud/onedrive-client';

export async function GET(request: NextRequest) {
  try {
    requireAdminSession(request);
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      return NextResponse.redirect(
        new URL(
          `/admin?cloud=onedrive_error&message=${encodeURIComponent(errorDescription || error)}`,
          request.url
        )
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/admin?cloud=onedrive_error&message=Codigo_de_autorizacion_ausente', request.url)
      );
    }

    const db = await dbRepository.getDatabase();
    const onedrive = db.googleConfig.onedrive;
    const clientId = onedrive?.clientId || process.env.ONEDRIVE_CLIENT_ID;
    const clientSecret = onedrive?.clientSecret || process.env.ONEDRIVE_CLIENT_SECRET || '';
    const tenantId = onedrive?.tenantId || process.env.ONEDRIVE_TENANT_ID || 'common';

    if (!clientId) {
      return NextResponse.redirect(
        new URL('/admin?cloud=onedrive_error&message=Falta_Client_ID_en_configuracion', request.url)
      );
    }

    const url = new URL(request.url);
    const redirectUri = `${url.origin}/api/admin/cloud/onedrive/callback`;

    const tokens = await oneDriveClient.exchangeCodeForTokens({
      clientId,
      clientSecret,
      code,
      redirectUri,
      tenantId,
    });

    await dbRepository.updateDatabase(
      async (database) => {
        if (!database.googleConfig.onedrive) {
          database.googleConfig.onedrive = {
            tenantId,
            clientId,
            clientSecret,
            refreshToken: tokens.refreshToken,
            rootFolderPath: 'LabHub_ST_UPN',
          };
        } else {
          database.googleConfig.onedrive.refreshToken = tokens.refreshToken;
        }

        database.googleConfig.enabled = true;
        database.googleConfig.activeProvider = 'ONEDRIVE';
        database.googleConfig.lastSyncAt = new Date().toISOString();
        database.googleConfig.lastSyncStatus = 'SUCCESS';
        database.googleConfig.lastSyncMessage =
          'Vinculación OAuth2 con Microsoft OneDrive completada con éxito.';
      },
      { skipCloudStatePush: true }
    );

    // Intentar obtener de inmediato el correo de la cuenta y carpeta raíz
    try {
      const activeDb = await dbRepository.getDatabase();
      const user = await oneDriveClient.getCurrentUser(activeDb.googleConfig.onedrive!);
      const folder = await oneDriveClient.ensureFolder(activeDb.googleConfig.onedrive!, '');

      await dbRepository.updateDatabase(
        (database) => {
          if (database.googleConfig.onedrive) {
            database.googleConfig.onedrive.connectedAccountEmail =
              user.mail || user.userPrincipalName;
            database.googleConfig.onedrive.driveWebUrl = folder.webUrl;
          }
          database.googleConfig.driveRootFolderUrl = folder.webUrl;
        },
        { skipCloudStatePush: true }
      );
    } catch (e) {
      console.warn('[OneDrive Callback] Perfil inicial diferido:', e);
    }

    return NextResponse.redirect(new URL('/admin?cloud=onedrive_connected', request.url));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al procesar callback de OneDrive';
    return NextResponse.redirect(
      new URL(`/admin?cloud=onedrive_error&message=${encodeURIComponent(msg)}`, request.url)
    );
  }
}
