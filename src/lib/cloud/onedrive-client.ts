import { AdvisoryRequest, OneDriveConfig } from '@/types/labhub';

interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number; // timestamp en milisegundos
}

const tokenCache = new Map<string, TokenCacheEntry>();

export interface OneDriveUploadedFile {
  id: string;
  webUrl: string;
  name?: string;
  size?: number;
}

export interface OneDriveUserInfo {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail?: string;
}

/**
 * Normaliza la ruta relativa para no tener slashes iniciales ni dobles slashes.
 */
function normalizeRelativePath(relPath: string): string {
  return relPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
}

/**
 * Construye la ruta completa dentro del OneDrive combinando la carpeta raíz configurada
 * y la ruta relativa del archivo.
 */
function buildFullPath(config: OneDriveConfig, remoteRelativePath: string): string {
  const root = (config.rootFolderPath || 'LabHub_ST_UPN').trim().replace(/^\/+|\/+$/g, '');
  const cleanRel = normalizeRelativePath(remoteRelativePath);
  return cleanRel ? `${root}/${cleanRel}` : root;
}

/**
 * Escapa segmentos de ruta para su uso en URL de Microsoft Graph API.
 */
function encodeGraphPath(fullPath: string): string {
  return fullPath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/**
 * Escapa valores para CSV estándar.
 */
function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes(';') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

export const oneDriveClient = {
  /**
   * Construye la URL de inicio de sesión OAuth2 hacia Microsoft Identity Platform.
   * Compatible con cuentas personales ('consumers') y cuentas educativas Microsoft 365 ('organizations').
   */
  buildOneDriveAuthUrl(clientId: string, tenantId = 'common', redirectUri: string): string {
    const tenant = tenantId.trim() || 'common';
    const baseUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
    const scopes = [
      'offline_access',
      'Files.ReadWrite',
      'User.Read',
      'Calendars.ReadWrite',
      'Mail.Send',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId.trim(),
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: scopes,
      prompt: 'consent',
    });

    return `${baseUrl}?${params.toString()}`;
  },

  /**
   * Intercambia el código de autorización obtenido del callback OAuth2 por tokens de acceso y actualización.
   */
  async exchangeCodeForTokens(params: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    tenantId?: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    scope: string;
  }> {
    const tenant = (params.tenantId || 'common').trim();
    const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

    const bodyParams = new URLSearchParams({
      client_id: params.clientId.trim(),
      client_secret: params.clientSecret.trim(),
      code: params.code.trim(),
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error al intercambiar código OAuth2 de OneDrive (HTTP ${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      scope: data.scope,
    };
  },

  /**
   * Obtiene un Access Token válido para Microsoft Graph API, renovándolo automáticamente
   * usando el refresh_token si ha expirado o está próximo a expirar.
   */
  async getAccessToken(config: OneDriveConfig): Promise<string> {
    if (!config.clientId || !config.refreshToken) {
      throw new Error('Configuración de OneDrive incompleta: se requiere clientId y refreshToken.');
    }

    const cacheKey = `${config.clientId}:${config.refreshToken.slice(-10)}`;
    const cached = tokenCache.get(cacheKey);

    // Margen de seguridad de 90 segundos antes del vencimiento
    if (cached && cached.expiresAt > Date.now() + 90000) {
      return cached.accessToken;
    }

    const tenant = (config.tenantId || 'common').trim();
    const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

    const bodyParams = new URLSearchParams({
      client_id: config.clientId.trim(),
      refresh_token: config.refreshToken.trim(),
      grant_type: 'refresh_token',
    });

    if (config.clientSecret) {
      bodyParams.append('client_secret', config.clientSecret.trim());
    }

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`No se pudo renovar el token de Microsoft Graph (HTTP ${res.status}): ${errText}`);
    }

    const data = await res.json();
    const expiresIn = Number(data.expires_in) || 3600;
    const expiresAt = Date.now() + expiresIn * 1000;

    tokenCache.set(cacheKey, {
      accessToken: data.access_token,
      expiresAt,
    });

    return data.access_token;
  },

  /**
   * Obtiene información del perfil de usuario conectado en Microsoft 365.
   */
  async getCurrentUser(config: OneDriveConfig): Promise<OneDriveUserInfo> {
    const token = await this.getAccessToken(config);
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error al consultar perfil de usuario Microsoft (HTTP ${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      displayName: data.displayName || 'Usuario Microsoft',
      userPrincipalName: data.userPrincipalName,
      mail: data.mail || data.userPrincipalName,
    };
  },

  /**
   * Asegura la existencia de una carpeta o la crea recursivamente en OneDrive.
   */
  async ensureFolder(config: OneDriveConfig, remoteRelativePath: string): Promise<OneDriveUploadedFile> {
    const token = await this.getAccessToken(config);
    const fullPath = buildFullPath(config, remoteRelativePath);
    const encoded = encodeGraphPath(fullPath);

    // Intentar leer si ya existe
    const getRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${encoded}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (getRes.ok) {
      const data = await getRes.json();
      return { id: data.id, webUrl: data.webUrl, name: data.name };
    }

    // Si no existe, crear la carpeta subiendo un placeholder o usando endpoint de creación
    // En Microsoft Graph API, un PUT a /content o crear la carpeta en el padre:
    const parts = fullPath.split('/');
    const folderName = parts.pop()!;
    const parentPath = parts.join('/');
    const parentUrl = parentPath
      ? `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeGraphPath(parentPath)}:/children`
      : 'https://graph.microsoft.com/v1.0/me/drive/root/children';

    const createRes = await fetch(parentUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'replace',
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Error al crear carpeta "${fullPath}" en OneDrive (HTTP ${createRes.status}): ${errText}`);
    }

    const created = await createRes.json();
    return { id: created.id, webUrl: created.webUrl, name: created.name };
  },

  /**
   * Sube un archivo a OneDrive de forma adaptativa:
   * - Si buffer <= 3.8 MB: subida directa simple vía PUT .../content.
   * - Si buffer > 3.8 MB: sesión fragmentada (createUploadSession) en bloques múltiplos de 320 KiB (3,276,800 bytes).
   */
  async uploadSmallOrLargeFile(
    config: OneDriveConfig,
    remoteRelativePath: string,
    buffer: Buffer,
    contentType = 'application/octet-stream'
  ): Promise<OneDriveUploadedFile> {
    const token = await this.getAccessToken(config);
    const fullPath = buildFullPath(config, remoteRelativePath);
    const encodedPath = encodeGraphPath(fullPath);

    const THRESHOLD = 3.8 * 1024 * 1024; // 3.8 MB

    if (buffer.length <= THRESHOLD) {
      // Subida directa simple
      const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/content`;
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType,
        },
        body: new Uint8Array(buffer),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error en subida simple a OneDrive "${fullPath}" (HTTP ${res.status}): ${errText}`);
      }

      const item = await res.json();
      return {
        id: item.id,
        webUrl: item.webUrl,
        name: item.name,
        size: item.size,
      };
    }

    // Subida fragmentada para archivos grandes (ej. STL pesados)
    const sessionUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/createUploadSession`;
    const sessionRes = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        item: {
          '@microsoft.graph.conflictBehavior': 'replace',
        },
      }),
    });

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      throw new Error(`Error al iniciar UploadSession en OneDrive "${fullPath}" (HTTP ${sessionRes.status}): ${errText}`);
    }

    const sessionData = await sessionRes.json();
    const uploadUrl = sessionData.uploadUrl;
    if (!uploadUrl) {
      throw new Error('OneDrive no retornó una uploadUrl para la sesión fragmentada.');
    }

    // 10 * 320 KiB = 3,276,800 bytes (múltiplo exacto de 320 KiB requerido por Graph API)
    const CHUNK_SIZE = 3276800;
    const totalBytes = buffer.length;
    let start = 0;
    let finalItem: any = null;

    while (start < totalBytes) {
      const end = Math.min(start + CHUNK_SIZE, totalBytes);
      const chunk = buffer.subarray(start, end);

      const chunkRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': chunk.length.toString(),
          'Content-Range': `bytes ${start}-${end - 1}/${totalBytes}`,
        },
        body: new Uint8Array(chunk),
      });

      if (!chunkRes.ok) {
        const errText = await chunkRes.text();
        throw new Error(`Error al subir fragmento ${start}-${end - 1} en OneDrive (HTTP ${chunkRes.status}): ${errText}`);
      }

      if (end >= totalBytes) {
        finalItem = await chunkRes.json();
      }

      start = end;
    }

    return {
      id: finalItem?.id || '',
      webUrl: finalItem?.webUrl || '',
      name: finalItem?.name,
      size: finalItem?.size,
    };
  },

  /**
   * Descarga el Buffer binario de un archivo desde Microsoft Graph usando su ID o su ruta relativa.
   */
  async downloadFileByIdOrPath(
    config: OneDriveConfig,
    query: { itemId?: string; remoteRelativePath?: string }
  ): Promise<Buffer | null> {
    const token = await this.getAccessToken(config);
    let targetUrl: string;

    if (query.itemId) {
      targetUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(query.itemId)}/content`;
    } else if (query.remoteRelativePath) {
      const fullPath = buildFullPath(config, query.remoteRelativePath);
      targetUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeGraphPath(fullPath)}:/content`;
    } else {
      return null;
    }

    const res = await fetch(targetUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      redirect: 'follow',
    });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error descargando archivo de OneDrive (HTTP ${res.status}): ${errText}`);
    }

    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  },

  /**
   * Guarda un snapshot completo de la base de datos en Sistema_BD/labhub_state.json.
   */
  async saveDatabaseSnapshot(config: OneDriveConfig, dbData: unknown): Promise<OneDriveUploadedFile> {
    const jsonString = JSON.stringify(dbData, null, 2);
    const buffer = Buffer.from(jsonString, 'utf-8');
    return this.uploadSmallOrLargeFile(
      config,
      'Sistema_BD/labhub_state.json',
      buffer,
      'application/json'
    );
  },

  /**
   * Descarga el snapshot de la base de datos desde Sistema_BD/labhub_state.json si existe.
   */
  async loadDatabaseSnapshot(config: OneDriveConfig): Promise<any | null> {
    const buffer = await this.downloadFileByIdOrPath(config, {
      remoteRelativePath: 'Sistema_BD/labhub_state.json',
    });

    if (!buffer) return null;
    try {
      return JSON.parse(buffer.toString('utf-8'));
    } catch (e) {
      console.warn('[OneDrive] Falló al parsear labhub_state.json remoto:', e);
      return null;
    }
  },

  /**
   * Genera y sube 4 reportes CSV formateados con BOM UTF-8 (\uFEFF) para visualización inmediata en Excel.
   */
  async syncCsvReports(config: OneDriveConfig, dbData: any): Promise<{
    reservationsUrl?: string;
    advisoriesUrl?: string;
    loansUrl?: string;
    printsUrl?: string;
  }> {
    const utf8Bom = '\uFEFF';

    // 1. Reservas
    const reservationsHeaders = [
      'Fecha Registro',
      'Código',
      'Origen',
      'Laboratorio',
      'Fecha',
      'Bloques',
      'Estudiante Líder',
      'Código UPN',
      'Integrantes',
      'Proyecto',
      'Carrera',
      'Curso',
      'NRC',
      'Estado',
    ];
    const reservationsRows = (dbData.reservations || []).map((r: any) => [
      escapeCsv(r.createdAt),
      escapeCsv(r.code),
      escapeCsv(r.origin),
      escapeCsv(r.labId),
      escapeCsv(r.date),
      escapeCsv((r.blockIds || []).join(', ')),
      escapeCsv(r.leadStudent?.fullName),
      escapeCsv(r.leadStudent?.upnCode),
      escapeCsv((r.participants || []).map((p: any) => `${p.fullName} (${p.upnCode})`).join('; ')),
      escapeCsv(r.projectName),
      escapeCsv(r.career),
      escapeCsv(r.course),
      escapeCsv(r.nrc),
      escapeCsv(r.status),
    ]);
    const reservationsCsv =
      utf8Bom + [reservationsHeaders.map(escapeCsv).join(';'), ...reservationsRows.map((row: string[]) => row.join(';'))].join('\r\n');

    // 2. Asesorías
    const advisoriesHeaders = [
      'Fecha Registro',
      'Código',
      'Asesor Asignado',
      'Email Asesor',
      'Laboratorio',
      'Fecha',
      'Bloques',
      'Proyecto',
      'Curso',
      'NRC',
      'Estudiantes',
      'Consulta / Motivo',
      'Cód. Reserva Vinculada',
      'Estado',
    ];
    const advisoriesRows = (dbData.advisories || []).map((a: any) => [
      escapeCsv(a.createdAt),
      escapeCsv(a.code),
      escapeCsv(a.advisorName),
      escapeCsv(a.advisorEmail),
      escapeCsv(a.labId),
      escapeCsv(a.date),
      escapeCsv((a.blockIds || []).join(', ')),
      escapeCsv(a.projectName),
      escapeCsv(a.course),
      escapeCsv(a.nrc),
      escapeCsv((a.students || []).map((s: any) => `${s.fullName} (${s.upnCode})`).join('; ')),
      escapeCsv(a.topicNotes || ''),
      escapeCsv(a.linkedReservationCode),
      escapeCsv(a.status),
    ]);
    const advisoriesCsv =
      utf8Bom + [advisoriesHeaders.map(escapeCsv).join(';'), ...advisoriesRows.map((row: string[]) => row.join(';'))].join('\r\n');

    // 3. Préstamos
    const loansHeaders = [
      'Fecha Registro',
      'Código Préstamo',
      'Laboratorio',
      'Docente',
      'Ciclo',
      'Curso / Programa',
      'Asistente que Atendió',
      'Materiales y Equipos',
      'Integrantes',
      'Responsable',
      'Código UPN',
      'Estado',
      'Fecha Devolución',
      'Recibido Por',
    ];
    const loansRows = (dbData.loans || []).map((l: any) => [
      escapeCsv(l.createdAt),
      escapeCsv(l.code),
      escapeCsv(l.labId),
      escapeCsv(l.teacherName),
      escapeCsv(l.cycle),
      escapeCsv(l.courseProgram),
      escapeCsv(l.attendedByName),
      escapeCsv((l.items || []).map((i: any) => `[${i.quantity}x] ${i.equipmentName} (${i.upnCode})`).join(' | ')),
      escapeCsv((l.groupMembers || []).map((m: any) => `${m.fullName} (${m.nrc})`).join('; ')),
      escapeCsv(l.responsibleName),
      escapeCsv(l.responsibleUpnCode),
      escapeCsv(l.status),
      escapeCsv(l.deliveredAt || ''),
      escapeCsv(l.deliveredByAdmin || ''),
    ]);
    const loansCsv =
      utf8Bom + [loansHeaders.map(escapeCsv).join(';'), ...loansRows.map((row: string[]) => row.join(';'))].join('\r\n');

    // 4. Impresiones 3D
    const printsHeaders = [
      'Fecha Registro',
      'Código 3D',
      'Estudiante',
      'Código UPN',
      'Docente',
      'Curso',
      'NRC',
      'Archivos STL',
      'Estado',
      'Observación 72h',
      'Vencimiento 72h',
    ];
    const printsRows = (dbData.prints || []).map((p: any) => [
      escapeCsv(p.createdAt),
      escapeCsv(p.code),
      escapeCsv(p.studentFullName),
      escapeCsv(p.upnCode),
      escapeCsv(p.teacherName),
      escapeCsv(p.course),
      escapeCsv(p.nrc),
      escapeCsv((p.files || []).map((f: any) => f.storedFileName || f.originalName).join('; ')),
      escapeCsv(p.status),
      escapeCsv(p.observationComment || ''),
      escapeCsv(p.observationExpiresAt || ''),
    ]);
    const printsCsv =
      utf8Bom + [printsHeaders.map(escapeCsv).join(';'), ...printsRows.map((row: string[]) => row.join(';'))].join('\r\n');

    const [resUpload, advUpload, loanUpload, printUpload] = await Promise.all([
      this.uploadSmallOrLargeFile(
        config,
        'Reportes_Excel/Reservas.csv',
        Buffer.from(reservationsCsv, 'utf-8'),
        'text/csv; charset=utf-8'
      ),
      this.uploadSmallOrLargeFile(
        config,
        'Reportes_Excel/Asesorias.csv',
        Buffer.from(advisoriesCsv, 'utf-8'),
        'text/csv; charset=utf-8'
      ),
      this.uploadSmallOrLargeFile(
        config,
        'Reportes_Excel/Prestamos_Equipos.csv',
        Buffer.from(loansCsv, 'utf-8'),
        'text/csv; charset=utf-8'
      ),
      this.uploadSmallOrLargeFile(
        config,
        'Reportes_Excel/Impresiones_3D.csv',
        Buffer.from(printsCsv, 'utf-8'),
        'text/csv; charset=utf-8'
      ),
    ]);

    return {
      reservationsUrl: resUpload.webUrl,
      advisoriesUrl: advUpload.webUrl,
      loansUrl: loanUpload.webUrl,
      printsUrl: printUpload.webUrl,
    };
  },

  /**
   * Intenta crear el evento en el calendario de Microsoft Outlook / Graph (/me/events)
   * invitando al asesor académico. Maneja fallos silenciosamente si la cuenta no cuenta con scope Calendars.
   */
  async createCalendarEventForAdvisory(
    config: OneDriveConfig,
    advisory: AdvisoryRequest
  ): Promise<{ id: string; webLink?: string } | null> {
    try {
      const token = await this.getAccessToken(config);

      const dateStr = advisory.date; // YYYY-MM-DD
      const startDateTime = `${dateStr}T08:00:00`;
      const endDateTime = `${dateStr}T10:00:00`;

      const body = {
        subject: `[LabHub UPN] Asesoría: ${advisory.projectName} (${advisory.code})`,
        body: {
          contentType: 'Text',
          content: `Asesoría en Laboratorio UPN: ${advisory.projectName}\nCódigo: ${advisory.code}\nCurso: ${advisory.course} (NRC: ${advisory.nrc})\nLaboratorio: ${advisory.labId}\nEstudiantes:\n${advisory.students.map((s) => `- ${s.fullName} (${s.upnCode})`).join('\n')}\n\nConsulta:\n${advisory.topicNotes || 'Sin notas adicionales.'}`,
        },
        start: {
          dateTime: startDateTime,
          timeZone: 'America/Lima',
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'America/Lima',
        },
        location: {
          displayName: `Laboratorio ${advisory.labId.toUpperCase()} — UPN`,
        },
        attendees: [
          {
            emailAddress: {
              address: advisory.advisorEmail,
              name: advisory.advisorName,
            },
            type: 'required',
          },
        ],
      };

      const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn('[OneDrive/Graph] No se pudo crear evento en calendario:', errText);
        return null;
      }

      const event = await res.json();
      return { id: event.id, webLink: event.webLink };
    } catch (e) {
      console.warn('[OneDrive/Graph] Error en createCalendarEventForAdvisory:', e);
      return null;
    }
  },
};
