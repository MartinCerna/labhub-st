import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { AdminSessionUser } from '@/types/labhub';

export const AUTH_COOKIE_NAME = 'labhub_admin_session';

const SESSION_SECRET =
  process.env.LABHUB_AUTH_SECRET || 'labhub_secret_key_upn_2026_salt_9845_secure_engine';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 días

interface SessionPayload {
  user: AdminSessionUser;
  exp: number;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function signString(data: string): string {
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function createSessionToken(user: AdminSessionUser): string {
  const payload: SessionPayload = {
    user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signString(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): AdminSessionUser | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  const expectedSignature = signString(encodedPayload);

  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.length !== expectedSigBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
  ) {
    return null;
  }

  try {
    const raw = base64UrlDecode(encodedPayload);
    const payload = JSON.parse(raw) as SessionPayload;
    if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }
    return payload.user;
  } catch {
    return null;
  }
}

export function parseCookiesFromHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [rawKey, ...valParts] = pair.trim().split('=');
    if (rawKey) {
      cookies[rawKey] = decodeURIComponent(valParts.join('='));
    }
  }
  return cookies;
}

export function getAdminSessionFromRequest(
  request: Request | NextRequest
): AdminSessionUser | null {
  // En NextRequest podemos leer request.cookies o la cabecera cookie
  if ('cookies' in request && typeof request.cookies?.get === 'function') {
    const cookie = request.cookies.get(AUTH_COOKIE_NAME);
    if (cookie?.value) {
      const user = verifySessionToken(cookie.value);
      if (user) return user;
    }
  }

  const cookieHeader = request.headers.get('cookie');
  const cookies = parseCookiesFromHeader(cookieHeader);
  const token = cookies[AUTH_COOKIE_NAME];
  if (!token) return null;

  return verifySessionToken(token);
}

export function requireAdminSession(request: Request | NextRequest): AdminSessionUser {
  const session = getAdminSessionFromRequest(request);
  if (!session) {
    const error: Error & { status?: number } = new Error('No autorizado. Sesión de administrador requerida.');
    error.status = 401;
    throw error;
  }
  return session;
}

export function buildSessionCookieValue(token: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  return [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    isProd ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function buildClearSessionCookieValue(): string {
  const isProd = process.env.NODE_ENV === 'production';
  return [
    `${AUTH_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    isProd ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}
