import { NextRequest, NextResponse } from 'next/server';
import { dbRepository, hashPassword } from '@/lib/storage/db';
import {
  AdminSessionUser,
} from '@/types/labhub';
import {
  buildClearSessionCookieValue,
  buildSessionCookieValue,
  createSessionToken,
  getAdminSessionFromRequest,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Credenciales incompletas: ingrese usuario y contraseña.' },
        { status: 400 }
      );
    }

    const cleanIdentifier = String(username).trim().toLowerCase();
    const passwordHash = hashPassword(String(password));

    const db = await dbRepository.getDatabase();
    const storedUser = db.adminUsers.find((u) => {
      if (u.passwordHash !== passwordHash) return false;
      const userUsername = (u.username || '').toLowerCase();
      const userEmail = (u.email || '').toLowerCase();
      const emailPrefix = userEmail.includes('@') ? userEmail.split('@')[0] : userEmail;
      const usernamePrefix = userUsername.includes('@') ? userUsername.split('@')[0] : userUsername;

      return (
        userUsername === cleanIdentifier ||
        userEmail === cleanIdentifier ||
        emailPrefix === cleanIdentifier ||
        usernamePrefix === cleanIdentifier
      );
    });

    if (!storedUser) {
      return NextResponse.json(
        { error: 'Usuario o contraseña incorrectos.' },
        { status: 401 }
      );
    }

    const sessionUser: AdminSessionUser = {
      id: storedUser.id,
      username: storedUser.username,
      fullName: storedUser.fullName,
      email: storedUser.email,
      role: storedUser.role,
      advisorId: storedUser.advisorId,
    };

    const token = createSessionToken(sessionUser);
    const cookieHeader = buildSessionCookieValue(token);

    const response = NextResponse.json({ user: sessionUser }, { status: 200 });
    response.headers.set('Set-Cookie', cookieHeader);
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error en autenticación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = getAdminSessionFromRequest(request);
    return NextResponse.json({ user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al verificar sesión';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const response = NextResponse.json({ ok: true });
    response.headers.set('Set-Cookie', buildClearSessionCookieValue());
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al cerrar sesión';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
