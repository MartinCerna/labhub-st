import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/auth';
import { dbRepository } from '@/lib/storage/db';
import { oneDriveClient } from '@/lib/cloud/onedrive-client';

export async function GET(request: NextRequest) {
  try {
    requireAdminSession(request);
    const db = await dbRepository.getDatabase();
    const onedrive = db.googleConfig.onedrive;

    const clientId = onedrive?.clientId || process.env.ONEDRIVE_CLIENT_ID;
    const tenantId = onedrive?.tenantId || process.env.ONEDRIVE_TENANT_ID || 'common';

    if (!clientId) {
      return NextResponse.json(
        {
          error:
            'Debe ingresar y guardar el Client ID (Id. de aplicación de Azure) en la configuración de OneDrive antes de iniciar la vinculación.',
        },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const redirectUri = `${url.origin}/api/admin/cloud/onedrive/callback`;

    const authUrl = oneDriveClient.buildOneDriveAuthUrl(clientId, tenantId, redirectUri);

    return NextResponse.json({
      authUrl,
      redirectUri,
      tenantId,
      clientId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al generar URL de autorización OneDrive';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}
