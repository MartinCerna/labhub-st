// ============================================================================
// CONTRATOS OFICIALES DE DATOS Y APIS — LABHUB ST (UPN)
// Single Source of Truth — Definido por el Agente Padre (Arquitecto)
// ============================================================================

export type LabId = 'automatizacion' | 'electronica' | 'mecatronica';

export type TimeBlockId =
  | 'B1'
  | 'B2'
  | 'B3'
  | 'B4'
  | 'B5'
  | 'B6'
  | 'B7'
  | 'B8'
  | 'B9';

/** 1 = Lunes, 2 = Martes, 3 = Miércoles, 4 = Jueves, 5 = Viernes, 6 = Sábado, 7 = Domingo */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TimeBlockDefinition {
  id: TimeBlockId;
  label: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  order: number;
}

export interface LaboratoryConfig {
  id: LabId;
  name: string;
  shortName: string;
  code: string;
  location: string;
  description: string;
  maxSimultaneousGroups: number; // Ej: 4 grupos o 6 grupos en simultáneo
  accentColor: string;
  equipmentHighlights: string[];
}

export interface RecurringClassSlot {
  id: string;
  labId: LabId;
  dayOfWeek: DayOfWeek;
  blockId: TimeBlockId;
  courseName: string;
  teacherName: string;
  nrc: string;
}

export interface SlotBlock {
  id: string;
  targetType: 'LAB' | 'ADVISOR';
  targetId: string; // LabId o advisorId
  date: string;     // YYYY-MM-DD
  blockId: TimeBlockId;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface StudentParticipant {
  fullName: string;
  upnCode: string;
}

// ----------------------------------------------------------------------------
// MÓDULO 1: RESERVA DE LABORATORIOS
// ----------------------------------------------------------------------------
export type ReservationOrigin = 'RESERVA_DIRECTA' | 'ASESORIA';
export type ReservationStatus = 'ACTIVA' | 'CANCELADA';

export interface LabReservation {
  id: string;
  code: string;
  origin: ReservationOrigin;
  linkedAdvisoryId?: string;
  labId: LabId;
  date: string; // YYYY-MM-DD
  blockIds: TimeBlockId[];
  leadStudent: StudentParticipant;
  participants: StudentParticipant[];
  projectName: string;
  career: string;
  course: string;
  nrc: string;
  teacherName?: string;
  safetyProtocolConfirmed?: boolean;
  status: ReservationStatus;
  createdAt: string;
  calendarEventUrl?: string;
  googleSynced?: boolean;
}

export interface CreateLabReservationPayload {
  labId: LabId;
  date: string;
  blockIds: TimeBlockId[];
  leadStudent: StudentParticipant;
  participants: StudentParticipant[];
  projectName: string;
  career: string;
  course: string;
  nrc: string;
  teacherName?: string;
  safetyProtocolConfirmed?: boolean;
}

export type LabSlotState =
  | 'DISPONIBLE'
  | 'CLASE'
  | 'BLOQUEADO'
  | 'COMPLETO'
  | 'PASADO';

export interface ComputedLabSlot {
  date: string;
  dayOfWeek: DayOfWeek;
  blockId: TimeBlockId;
  state: LabSlotState;
  maxGroups: number;
  occupiedGroups: number;
  availableGroups: number;
  classInfo?: {
    courseName: string;
    teacherName: string;
    nrc: string;
  };
  blockReason?: string;
  blockRecordId?: string;
  bookings?: {
    id: string;
    code: string;
    projectName: string;
    leadName: string;
    upnCode: string;
    origin: ReservationOrigin;
  }[];
}

export interface LabWeeklyScheduleResponse {
  lab: LaboratoryConfig;
  weekOffset: 0 | 1;
  weekStartDate: string; // YYYY-MM-DD (Lunes)
  weekEndDate: string;   // YYYY-MM-DD (Sábado)
  days: {
    dayOfWeek: DayOfWeek;
    dayName: string;
    date: string;
  }[];
  slots: ComputedLabSlot[];
}

// ----------------------------------------------------------------------------
// MÓDULO 2: ASESORÍAS CON 4 ASESORES
// ----------------------------------------------------------------------------
export interface AdvisorAvailabilitySlot {
  dayOfWeek: DayOfWeek;
  blockId: TimeBlockId;
  labId: LabId;
}

export interface AdvisorProfile {
  id: string; // 'adv-1' | 'adv-2' | 'adv-3' | 'adv-4' | ...
  fullName: string;
  roleTitle: string;
  career?: string; // Carrera profesional mostrada en la tarjeta de asesoría
  specialty: string; // Especialidad principal
  advisoryTopics?: string[]; // Temas en los que brinda asesoría
  email: string; // Cuenta asociada a Google Calendar y acceso
  username: string;
  avatarInitials: string;
  badgeColor: string;
  active: boolean;
  weeklyAvailability: AdvisorAvailabilitySlot[];
}

export interface CreateAdminAdvisorUserPayload {
  fullName: string;
  email: string;
  password: string;
  role: 'COORDINADOR' | 'ASISTENTE';
  roleTitle?: string;
  career?: string;
  specialty?: string;
  advisoryTopics?: string[];
  badgeColor?: string;
}

export type AdvisoryStatus = 'PROGRAMADA' | 'ATENDIDA' | 'CANCELADA';

export interface AdvisoryRequest {
  id: string;
  code: string;
  advisorId: string;
  advisorName: string;
  advisorEmail: string;
  labId: LabId;
  date: string; // YYYY-MM-DD
  blockIds: TimeBlockId[];
  projectName: string;
  course: string;
  nrc: string;
  topicNotes?: string;
  students: StudentParticipant[]; // Mínimo 1 estudiante, opción de añadir más
  linkedReservationId: string;    // Cuenta también como reserva realizada
  linkedReservationCode: string;
  status: AdvisoryStatus;
  calendarEventUrl: string;
  icsDownloadUrl: string;
  calendarNotified: boolean;
  createdAt: string;
}

export interface CreateAdvisoryPayload {
  advisorId: string;
  date: string;
  blockIds: TimeBlockId[];
  projectName: string;
  course: string;
  nrc: string;
  topicNotes?: string;
  students: StudentParticipant[];
}

export type AdvisorSlotState =
  | 'DISPONIBLE'
  | 'OCUPADO'
  | 'BLOQUEADO'
  | 'NO_ATIENDE'
  | 'LAB_SIN_CUPO';

export interface ComputedAdvisorSlot {
  date: string;
  dayOfWeek: DayOfWeek;
  blockId: TimeBlockId;
  state: AdvisorSlotState;
  labId?: LabId;
  labName?: string;
  labAvailableGroups?: number;
  blockReason?: string;
  blockRecordId?: string;
  advisoryBooking?: {
    id: string;
    code: string;
    projectName: string;
    course: string;
    leadStudentName: string;
  };
}

export interface AdvisorWeeklyScheduleResponse {
  advisor: AdvisorProfile;
  allAdvisors: AdvisorProfile[];
  weekOffset: 0 | 1;
  weekStartDate: string;
  weekEndDate: string;
  days: {
    dayOfWeek: DayOfWeek;
    dayName: string;
    date: string;
  }[];
  slots: ComputedAdvisorSlot[];
}

// ----------------------------------------------------------------------------
// MÓDULO 3: PRÉSTAMO DE EQUIPOS ("ENTREGA DE MATERIALES Y/O EQUIPOS")
// ----------------------------------------------------------------------------
export type EquipmentLoanStatus = 'PENDIENTE' | 'EN_USO' | 'ENTREGADO' | 'DEVUELTO';

export interface LabEquipmentCatalogItem {
  name: string;
  brand?: string;
  model?: string;
  totalUnits: number;
  sampleCodes: string[];
}

export interface EquipmentLoanItem {
  quantity: number;
  equipmentName: string;
  upnCode: string; // Código UPN / Patrimonial del equipo o material
}

export interface LoanGroupMember {
  fullName: string;
  nrc: string;
}

export interface EquipmentLoan {
  id: string;
  code: string; // ID único visible (ej. EQP-2026-0001)
  labId: LabId;
  teacherName: string;
  cycle: string;
  courseProgram: string;
  attendedByAdvisorId: string;
  attendedByName: string;
  items: EquipmentLoanItem[];
  groupMembers: LoanGroupMember[];
  responsibleName: string;
  responsibleUpnCode: string;
  signatureDataUrl: string; // PNG Base64 de la firma digital
  status: EquipmentLoanStatus;
  createdAt: string;
  handedOutAt?: string;
  handedOutByAdmin?: string;
  deliveredAt?: string;
  deliveredByAdmin?: string;
  adminNotes?: string;
  driveDocumentUrl?: string;
  driveSignatureUrl?: string;
  googleSynced?: boolean;
}

export interface CreateEquipmentLoanPayload {
  labId: LabId;
  teacherName: string;
  cycle: string;
  courseProgram: string;
  attendedByAdvisorId: string;
  items: EquipmentLoanItem[];
  groupMembers: LoanGroupMember[];
  responsibleName: string;
  responsibleUpnCode: string;
  signatureDataUrl: string;
}

// ----------------------------------------------------------------------------
// MÓDULO 4: IMPRESIÓN 3D Y SEGUIMIENTO
// ----------------------------------------------------------------------------
export type Print3DStatus =
  | 'ENVIADO'
  | 'EN REVISION'
  | 'OBSERVADO'
  | 'RECHAZADA'
  | 'EN COLA'
  | 'IMPRIMIENDO'
  | 'LISTA'
  | 'ENTREGADA';

export interface StlFileMetadata {
  id: string;
  originalName: string;
  storedFileName: string;
  sizeBytes: number;
  format: 'BINARY' | 'ASCII';
  triangleCount: number;
  dimensionsMm: {
    x: number;
    y: number;
    z: number;
  };
  estimatedVolumeCm3: number;
  version: number;
  uploadedAt: string;
  driveFileId?: string;
  driveViewUrl?: string;
  downloadUrl: string;
}

export interface Print3DStatusLog {
  status: Print3DStatus;
  timestamp: string;
  comment?: string;
  actor: string;
}

export interface Print3DRequest {
  id: string;
  code: string; // Ej: 3DP-2026-0001
  studentFullName: string;
  upnCode: string;
  teacherName: string;
  course: string;
  nrc: string;
  files: StlFileMetadata[];
  status: Print3DStatus;
  observationComment?: string;
  observedAt?: string;
  observationExpiresAt?: string; // Plazo exacto de +72 horas
  statusHistory: Print3DStatusLog[];
  driveFolderUrl?: string;
  googleSynced?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// ADMINISTRACIÓN Y GOOGLE WORKSPACE SYNC
// ----------------------------------------------------------------------------
export interface AdminSessionUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: 'COORDINADOR' | 'ASISTENTE';
  advisorId?: string;
}

export type CloudStorageProvider = 'LOCAL' | 'GOOGLE_DRIVE' | 'ONEDRIVE';

export interface OneDriveConfig {
  tenantId: string; // 'common', 'consumers' o 'organizations' / Tenant ID UPN
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  rootFolderPath: string;
  driveWebUrl?: string;
  connectedAccountEmail?: string;
}

export interface GoogleWorkspaceConfig {
  enabled: boolean;
  activeProvider?: CloudStorageProvider;
  appsScriptWebhookUrl: string;
  webhookSecret?: string;
  driveFolderName: string;
  spreadsheetUrl?: string;
  driveRootFolderUrl?: string;
  syncStlFilesToDrive: boolean;
  syncRecordsToSheets: boolean;
  syncCalendarAndEmail: boolean;
  persistFullStateInDrive?: boolean;
  generateLoanDocumentsInDrive?: boolean;
  onedrive?: OneDriveConfig;
  lastSyncAt?: string;
  lastSyncStatus?: 'SUCCESS' | 'ERROR';
  lastSyncMessage?: string;
}

export interface AdminDashboardSummary {
  stats: {
    activeReservationsCount: number;
    scheduledAdvisoriesCount: number;
    pendingLoansCount: number;
    deliveredLoansCount: number;
    active3DPrintsCount: number;
    observed3DPrintsCount: number;
  };
  labs: LaboratoryConfig[];
  advisors: AdvisorProfile[];
  recurringClasses: RecurringClassSlot[];
  slotBlocks: SlotBlock[];
  recentReservations: LabReservation[];
  advisories: AdvisoryRequest[];
  loans: EquipmentLoan[];
  printRequests: Print3DRequest[];
  teachersCatalog: string[];
  googleConfig: GoogleWorkspaceConfig;
}

