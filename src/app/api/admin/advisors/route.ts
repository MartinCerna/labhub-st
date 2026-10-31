import { NextRequest, NextResponse } from 'next/server';
import {
  AdminSessionUser,
  AdvisorProfile,
  CreateAdminAdvisorUserPayload,
} from '@/types/labhub';
import { StoredAdminUser, dbRepository, hashPassword } from '@/lib/storage/db';
import { requireAdminSession } from '@/lib/auth';

function computeAvatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AD';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  if (parts.length >= 3) {
    return (parts[0][0] + parts[2][0]).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export async function PATCH(request: NextRequest) {
  try {
    const session = requireAdminSession(request);
    const body = (await request.json()) as {
      advisorId: string;
      newPassword?: string;
    } & Partial<AdvisorProfile>;

    if (!body.advisorId) {
      return NextResponse.json(
        { error: 'El campo "advisorId" es obligatorio.' },
        { status: 400 }
      );
    }

    if (session.role !== 'COORDINADOR' && session.advisorId !== body.advisorId) {
      return NextResponse.json(
        { error: 'Solo el Administrador Total puede editar las tarjetas de otros usuarios.' },
        { status: 403 }
      );
    }

    const updatedAdvisor = await dbRepository.updateDatabase(async (db) => {
      const advisor = db.advisors.find((a) => a.id === body.advisorId);
      if (!advisor) {
        throw new Error(`Asesor con ID "${body.advisorId}" no encontrado.`);
      }

      const adminUser = db.adminUsers.find((u) => u.advisorId === body.advisorId);

      if (body.fullName) {
        const cleanName = body.fullName.trim();
        advisor.fullName = cleanName;
        advisor.avatarInitials = computeAvatarInitials(cleanName);
        if (adminUser) {
          adminUser.fullName = cleanName;
        }
      }

      if (body.roleTitle !== undefined) {
        advisor.roleTitle = body.roleTitle.trim();
      }

      if (body.career !== undefined) {
        advisor.career = body.career.trim();
      }

      if (body.specialty !== undefined) {
        advisor.specialty = body.specialty.trim();
      }

      if (Array.isArray(body.advisoryTopics)) {
        advisor.advisoryTopics = body.advisoryTopics
          .map((t) => String(t).trim())
          .filter(Boolean);
      }

      if (body.email) {
        const cleanEmail = body.email.trim().toLowerCase();
        advisor.email = cleanEmail;
        advisor.username = cleanEmail;
        if (adminUser) {
          adminUser.email = cleanEmail;
          adminUser.username = cleanEmail;
        }
      }

      if (body.badgeColor !== undefined) {
        advisor.badgeColor = body.badgeColor.trim();
      }

      if (body.active !== undefined) {
        advisor.active = Boolean(body.active);
      }

      if (Array.isArray(body.weeklyAvailability)) {
        advisor.weeklyAvailability = body.weeklyAvailability;
      }

      // Si se especificó una nueva contraseña, actualizar usuario de acceso admin
      if (body.newPassword && body.newPassword.trim().length >= 4) {
        if (adminUser) {
          adminUser.passwordHash = hashPassword(body.newPassword.trim());
        }
      }

      return advisor;
    });

    return NextResponse.json({ advisor: updatedAdvisor });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al actualizar perfil del asesor';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = requireAdminSession(request);

    if (session.role !== 'COORDINADOR') {
      return NextResponse.json(
        {
          error:
            'Solo el Administrador Total (Martín Aarón León Cerna) tiene permisos para crear o registrar nuevos usuarios.',
        },
        { status: 403 }
      );
    }

    const body = (await request.json()) as CreateAdminAdvisorUserPayload;

    if (!body.fullName?.trim() || !body.email?.trim() || !body.password?.trim()) {
      return NextResponse.json(
        { error: 'El nombre completo, correo electrónico y contraseña son campos obligatorios.' },
        { status: 400 }
      );
    }

    if (body.password.trim().length < 4) {
      return NextResponse.json(
        { error: 'La contraseña debe contener al menos 4 caracteres.' },
        { status: 400 }
      );
    }

    const cleanEmail = body.email.trim().toLowerCase();
    const cleanFullName = body.fullName.trim();
    const cleanRole: 'COORDINADOR' | 'ASISTENTE' =
      body.role === 'COORDINADOR' ? 'COORDINADOR' : 'ASISTENTE';

    const result = await dbRepository.updateDatabase(async (db) => {
      const emailExists = db.adminUsers.some(
        (u) =>
          u.email.toLowerCase() === cleanEmail ||
          u.username.toLowerCase() === cleanEmail
      );

      if (emailExists) {
        const err: Error & { status?: number } = new Error(
          'Ya existe un usuario o asesor registrado con este correo electrónico.'
        );
        err.status = 400;
        throw err;
      }

      const nextAdvisorId = `adv-${db.advisors.length + 1}`;
      const nextAdminId = `admin-${nextAdvisorId}`;

      const newAdvisor: AdvisorProfile = {
        id: nextAdvisorId,
        fullName: cleanFullName,
        roleTitle:
          body.roleTitle?.trim() ||
          (cleanRole === 'COORDINADOR'
            ? 'Coordinador y Administrador General'
            : 'Administrador de Laboratorio'),
        career: body.career?.trim() || 'Ingeniería',
        specialty: body.specialty?.trim() || 'Soporte de Laboratorio y Asesoría Técnica',
        advisoryTopics: Array.isArray(body.advisoryTopics)
          ? body.advisoryTopics.map((t) => String(t).trim()).filter(Boolean)
          : [],
        email: cleanEmail,
        username: cleanEmail,
        avatarInitials: computeAvatarInitials(cleanFullName),
        badgeColor: body.badgeColor?.trim() || '#0284c7',
        active: true,
        weeklyAvailability: [],
      };

      const newAdminUser: StoredAdminUser = {
        id: nextAdminId,
        username: cleanEmail,
        fullName: cleanFullName,
        email: cleanEmail,
        role: cleanRole,
        advisorId: nextAdvisorId,
        passwordHash: hashPassword(body.password.trim()),
      };

      db.advisors.push(newAdvisor);
      db.adminUsers.push(newAdminUser);

      const publicUser: AdminSessionUser = {
        id: newAdminUser.id,
        username: newAdminUser.username,
        fullName: newAdminUser.fullName,
        email: newAdminUser.email,
        role: newAdminUser.role,
        advisorId: newAdminUser.advisorId,
      };

      return { advisor: newAdvisor, user: publicUser };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al crear usuario y perfil de asesor';
    const status = (error as any)?.status || 400;
    return NextResponse.json({ error: message }, { status });
  }
}
