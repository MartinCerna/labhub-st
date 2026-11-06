// ============================================================================
// CONTRATO DE CLIENTE HTTP FRONTEND <-> BACKEND API ROUTES
// Garantiza que los equipos de Frontend y Backend usen exactamente los mismos
// endpoints, métodos HTTP, parámetros de consulta y estructuras de respuesta.
// ============================================================================

import {
  AdminDashboardSummary,
  AdminSessionUser,
  AdvisorProfile,
  AdvisorWeeklyScheduleResponse,
  AdvisoryRequest,
  CreateAdminAdvisorUserPayload,
  CreateAdvisoryPayload,
  CreateEquipmentLoanPayload,
  CreateLabReservationPayload,
  EquipmentLoan,
  EquipmentLoanStatus,
  GoogleWorkspaceConfig,
  LabId,
  LaboratoryConfig,
  LabReservation,
  LabWeeklyScheduleResponse,
  Print3DRequest,
  Print3DStatus,
  RecurringClassSlot,
  SlotBlock,
  TimeBlockId,
} from '@/types/labhub';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Error HTTP ${res.status}`);
  }
  return data as T;
}

export const apiClient = {
  // Catálogos públicos
  getCatalog: () =>
    requestJson<{
      labs: LaboratoryConfig[];
      advisors: AdvisorProfile[];
      teachers: string[];
    }>('/api/catalog'),

  // Módulo 1: Reserva de Laboratorios
  getLabSchedule: (labId: LabId, weekOffset: 0 | 1) =>
    requestJson<LabWeeklyScheduleResponse>(
      `/api/labs/schedule?labId=${encodeURIComponent(labId)}&weekOffset=${weekOffset}`
    ),

  createLabReservation: (payload: CreateLabReservationPayload) =>
    requestJson<{ reservation: LabReservation; message: string }>('/api/reservations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  searchStudentReservations: (query: string) =>
    requestJson<{ reservations: LabReservation[] }>(
      `/api/reservations?query=${encodeURIComponent(query.trim())}`
    ),

  cancelStudentReservation: (codeOrId: string, upnCode?: string) => {
    const params = new URLSearchParams();
    if (codeOrId.startsWith('RES-')) {
      params.set('code', codeOrId.trim());
    } else {
      params.set('id', codeOrId.trim());
    }
    if (upnCode) {
      params.set('upnCode', upnCode.trim().toUpperCase());
    }
    return requestJson<{ ok: boolean; message?: string }>(
      `/api/reservations?${params.toString()}`,
      { method: 'DELETE' }
    );
  },

  // Módulo 2: Solicitud de Asesorías
  getAdvisorSchedule: (advisorId: string, weekOffset: 0 | 1) =>
    requestJson<AdvisorWeeklyScheduleResponse>(
      `/api/advisors/schedule?advisorId=${encodeURIComponent(advisorId)}&weekOffset=${weekOffset}`
    ),

  createAdvisory: (payload: CreateAdvisoryPayload) =>
    requestJson<{
      advisory: AdvisoryRequest;
      reservation: LabReservation;
      message: string;
    }>('/api/advisories', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  searchStudentAdvisories: (query: string) =>
    requestJson<{ advisories: AdvisoryRequest[] }>(
      `/api/advisories?query=${encodeURIComponent(query.trim())}`
    ),

  cancelStudentAdvisory: (codeOrId: string, upnCode?: string) => {
    const params = new URLSearchParams();
    if (codeOrId.startsWith('ASE-')) {
      params.set('code', codeOrId.trim());
    } else {
      params.set('id', codeOrId.trim());
    }
    if (upnCode) {
      params.set('upnCode', upnCode.trim().toUpperCase());
    }
    return requestJson<{ ok: boolean; message?: string }>(
      `/api/advisories?${params.toString()}`,
      { method: 'DELETE' }
    );
  },

  // Módulo 3: Préstamo de Equipos
  createEquipmentLoan: (payload: CreateEquipmentLoanPayload) =>
    requestJson<{ loan: EquipmentLoan; message: string }>('/api/loans', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getLoanByCode: (code: string) =>
    requestJson<{ loan: EquipmentLoan }>(
      `/api/loans?code=${encodeURIComponent(code.trim())}`
    ),

  // Módulo 4: Impresión 3D y Seguimiento
  createPrint3DRequest: (formData: FormData) =>
    requestJson<{ printRequest: Print3DRequest; message: string }>('/api/prints', {
      method: 'POST',
      body: formData,
    }),

  trackPrint3DRequests: (query: string) =>
    requestJson<{ results: Print3DRequest[] }>(
      `/api/prints?query=${encodeURIComponent(query.trim())}`
    ),

  resubmitObservedPrint3D: (code: string, formData: FormData) =>
    requestJson<{ printRequest: Print3DRequest; message: string }>(
      `/api/prints/${encodeURIComponent(code)}/resubmit`,
      {
        method: 'POST',
        body: formData,
      }
    ),

  // Autenticación de Administradores / Asistentes
  adminLogin: (username: string, password: string) =>
    requestJson<{ user: AdminSessionUser }>('/api/admin/auth', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  adminLogout: () =>
    requestJson<{ ok: boolean }>('/api/admin/auth', {
      method: 'DELETE',
    }),

  getAdminSession: () =>
    requestJson<{ user: AdminSessionUser | null }>('/api/admin/auth'),

  // Dashboard y Operaciones Administrativas
  getAdminDashboard: () =>
    requestJson<AdminDashboardSummary>('/api/admin/dashboard'),

  updateLabConfig: (labId: LabId, updates: Partial<LaboratoryConfig>) =>
    requestJson<{ lab: LaboratoryConfig }>('/api/admin/labs', {
      method: 'PATCH',
      body: JSON.stringify({ labId, ...updates }),
    }),

  saveRecurringClass: (slot: Omit<RecurringClassSlot, 'id'>) =>
    requestJson<{ recurringClass: RecurringClassSlot }>('/api/admin/classes', {
      method: 'POST',
      body: JSON.stringify(slot),
    }),

  deleteRecurringClass: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/admin/classes?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  createSlotBlock: (
    payload: {
      targetType: 'LAB' | 'ADVISOR';
      targetId: string;
      date?: string;
      blockId?: TimeBlockId;
      blockIds?: TimeBlockId[];
      dates?: string[];
      fullDay?: boolean;
      slots?: Array<{ date: string; blockId: TimeBlockId }>;
      reason: string;
    }
  ) =>
    requestJson<{ slotBlock: SlotBlock; slotBlocks: SlotBlock[]; count: number }>('/api/admin/blocks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteSlotBlock: (id: string) =>
    requestJson<{ ok: boolean; deletedCount?: number }>(`/api/admin/blocks?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  deleteSlotBlocksBulk: (params: {
    ids?: string[];
    targetType?: 'LAB' | 'ADVISOR';
    targetId?: string;
    date?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params.ids && params.ids.length > 0) qs.set('ids', params.ids.join(','));
    if (params.targetType) qs.set('targetType', params.targetType);
    if (params.targetId) qs.set('targetId', params.targetId);
    if (params.date) qs.set('date', params.date);
    return requestJson<{ ok: boolean; deletedCount: number }>(
      `/api/admin/blocks?${qs.toString()}`,
      { method: 'DELETE' }
    );
  },

  updateAdvisorProfile: (
    advisorId: string,
    updates: Partial<AdvisorProfile> & { newPassword?: string }
  ) =>
    requestJson<{ advisor: AdvisorProfile }>('/api/admin/advisors', {
      method: 'PATCH',
      body: JSON.stringify({ advisorId, ...updates }),
    }),

  createAdvisorAndUser: (payload: CreateAdminAdvisorUserPayload) =>
    requestJson<{ advisor: AdvisorProfile; user: AdminSessionUser }>('/api/admin/advisors', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  cancelReservation: (id: string) =>
    requestJson<{ ok: boolean }>(
      `/api/reservations?id=${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    ),

  updateAdvisoryStatus: (
    id: string,
    status: AdvisoryRequest['status']
  ) =>
    requestJson<{
      advisory: AdvisoryRequest;
      syncResult?: { synced: boolean; outdatedAppsScript?: boolean };
    }>('/api/advisories', {
      method: 'PATCH',
      body: JSON.stringify({ id, status }),
    }),

  updateLoanStatus: (
    id: string,
    status: EquipmentLoanStatus,
    adminNotes?: string
  ) =>
    requestJson<{ loan: EquipmentLoan }>('/api/loans', {
      method: 'PATCH',
      body: JSON.stringify({ id, status, adminNotes }),
    }),

  updatePrint3DStatus: (
    id: string,
    status: Print3DStatus,
    observationComment?: string
  ) =>
    requestJson<{ printRequest: Print3DRequest }>('/api/prints', {
      method: 'PATCH',
      body: JSON.stringify({ id, status, observationComment }),
    }),

  deletePrint3DRequest: (id: string) =>
    requestJson<{ ok: boolean; message?: string }>(
      `/api/prints?id=${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    ),

  updateTeachersCatalog: (teachers: string[]) =>
    requestJson<{ teachers: string[] }>('/api/admin/teachers', {
      method: 'PUT',
      body: JSON.stringify({ teachers }),
    }),

  updateGoogleConfig: (config: Partial<GoogleWorkspaceConfig>) =>
    requestJson<{ googleConfig: GoogleWorkspaceConfig }>('/api/admin/google', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  testGoogleSync: (mode: 'PING' | 'FULL_SYNC' | 'PULL_STATE' = 'PING') =>
    requestJson<{ ok: boolean; message: string; googleConfig: GoogleWorkspaceConfig }>(
      '/api/admin/google',
      {
        method: 'POST',
        body: JSON.stringify({ mode }),
      }
    ),

  getOneDriveAuthUrl: (clientId: string, tenantId = 'common') =>
    requestJson<{ authUrl: string; redirectUri: string }>(
      `/api/admin/cloud/onedrive/auth?clientId=${encodeURIComponent(
        clientId
      )}&tenantId=${encodeURIComponent(tenantId)}`
    ),
};

