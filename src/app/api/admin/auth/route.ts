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

    const isMartinCoordinator =
      cleanIdentifier === 'martin.cernaa@gmail.com' ||
      cleanIdentifier === 'martin.cernaa' ||
      cleanIdentifier === 'martin.leon@upn.edu.pe' ||
      cleanIdentifier === 'martin.leon';

    let storedUser = db.adminUsers.find((u) => {
      // Si el identificador ingresado corresponde al coordinador Martín León Cerna,
      // verificar contra el usuario coordinador admin-martin
      if (
        isMartinCoordinator &&
        (u.id === 'admin-martin' ||
          u.id === 'admin-martin-upn' ||
          u.email?.toLowerCase() === 'martin.cernaa@gmail.com' ||
          u.email?.toLowerCase() === 'martin.leon@upn.edu.pe' ||
          u.username?.toLowerCase() === 'martin.cernaa@gmail.com' ||
          u.username?.toLowerCase() === 'martin.leon@upn.edu.pe')
      ) {
        return u.passwordHash === passwordHash;
      }

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

    // Respaldo explícito para Martín León Cerna: si no se encontró en la búsqueda anterior
    // verificar la contraseña directamente contra el usuario coordinador admin-martin
    if (!storedUser && isMartinCoordinator) {
      const coordinator = db.adminUsers.find(
        (u) =>
          u.id === 'admin-martin' ||
          u.email?.toLowerCase() === 'martin.cernaa@gmail.com' ||
          u.role === 'COORDINADOR'
      );
      if (coordinator && coordinator.passwordHash === passwordHash) {
        storedUser = coordinator;
      }
    }

    if (!storedUser) {
      return NextResponse.json(
        { error: 'Usuario o contraseña incorrectos.' },
        { status: 401 }
      );
    }

    const sessionUser: AdminSessionUser = {
      id: storedUser.id,
      username: cleanIdentifier.includes('@') ? cleanIdentifier : storedUser.username,
      fullName: storedUser.fullName,
      email: cleanIdentifier.includes('@') ? cleanIdentifier : storedUser.email,
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
