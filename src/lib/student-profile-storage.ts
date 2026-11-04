/**
 * Utilidad de almacenamiento local en el navegador (localStorage) para recordar
 * los datos del estudiante entre módulos (Reservas, Impresión 3D, Préstamos, Asesorías)
 * y permitir autocompletado rápido por Código UPN (M11 y M18).
 */

export interface SavedStudentProfile {
  fullName: string;
  upnCode: string;
  career?: string;
  course?: string;
  nrc?: string;
  teacherName?: string;
  cycle?: string;
  updatedAt: string;
}

const PROFILE_STORAGE_KEY = 'labhub_student_profile_v1';
const DIRECTORY_STORAGE_KEY = 'labhub_upn_directory_v1';

export function loadSavedStudentProfile(): SavedStudentProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedStudentProfile;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStudentProfile(partial: Partial<SavedStudentProfile>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = loadSavedStudentProfile() || {
      fullName: '',
      upnCode: '',
      updatedAt: new Date().toISOString(),
    };
    const next: SavedStudentProfile = {
      ...current,
      ...Object.fromEntries(
        Object.entries(partial).filter(([, v]) => v !== undefined && String(v).trim() !== '')
      ),
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));

    // Guardar también en el directorio local indexado por Código UPN para autocompletar por código (M11)
    if (next.upnCode && next.upnCode.trim().length >= 4) {
      const normalizedCode = next.upnCode.trim().toUpperCase();
      const dirRaw = window.localStorage.getItem(DIRECTORY_STORAGE_KEY);
      const dir: Record<string, SavedStudentProfile> = dirRaw ? JSON.parse(dirRaw) : {};
      dir[normalizedCode] = { ...next, upnCode: normalizedCode };
      window.localStorage.setItem(DIRECTORY_STORAGE_KEY, JSON.stringify(dir));
    }
  } catch {
    // Ignorar errores de cuota o modo incógnito restringido
  }
}

export function lookupStudentByUpnCode(upnCode: string): SavedStudentProfile | null {
  if (typeof window === 'undefined' || !upnCode) return null;
  try {
    const normalized = upnCode.trim().toUpperCase();
    const current = loadSavedStudentProfile();
    if (current && current.upnCode?.trim().toUpperCase() === normalized) {
      return current;
    }
    const dirRaw = window.localStorage.getItem(DIRECTORY_STORAGE_KEY);
    if (!dirRaw) return null;
    const dir = JSON.parse(dirRaw) as Record<string, SavedStudentProfile>;
    return dir[normalized] || null;
  } catch {
    return null;
  }
}

export function clearSavedStudentProfile(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    // Ignorar
  }
}

