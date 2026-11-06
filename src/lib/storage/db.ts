import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  AdminSessionUser,
  AdvisorProfile,
  AdvisoryRequest,
  CloudStorageProvider,
  EquipmentLoan,
  GoogleWorkspaceConfig,
  LabId,
  LaboratoryConfig,
  LabReservation,
  Print3DRequest,
  RecurringClassSlot,
  SlotBlock,
} from '@/types/labhub';
import {
  DEFAULT_LABORATORIES,
  DEFAULT_TEACHERS_CATALOG,
  getWeekDaysForOffset,
} from '@/constants/schedule';
import { buildAdvisoryCalendarDetails, buildGoogleCalendarUrl } from '@/lib/calendar/ics';

export interface StoredAdminUser extends AdminSessionUser {
  passwordHash: string; // SHA-256
}

export interface LabHubDatabase {
  labs: LaboratoryConfig[];
  advisors: AdvisorProfile[];
  recurringClasses: RecurringClassSlot[];
  slotBlocks: SlotBlock[];
  reservations: LabReservation[];
  advisories: AdvisoryRequest[];
  loans: EquipmentLoan[];
  prints: Print3DRequest[];
  teachersCatalog: string[];
  googleConfig: GoogleWorkspaceConfig;
  adminUsers: StoredAdminUser[];
  sequences: {
    reservation: number;
    advisory: number;
    loan: number;
    print: number;
  };
}

export interface UpdateDbOptions {
  skipCloudStatePush?: boolean;
}

/**
 * Directorio resuelto en tiempo de ejecución.
 * En entornos locales o tradicionales usa process.cwd()/data.
 * En entornos serverless con sistema de archivos efímero/de solo lectura (como Vercel),
 * conmuta de forma transparente hacia os.tmpdir()/labhub-st-data.
 */
let resolvedDataDir: string | null = null;

function resolveDataDirectory(): string {
  if (resolvedDataDir) return resolvedDataDir;

  const primaryDir = path.join(process.cwd(), 'data');
  try {
    if (!fs.existsSync(primaryDir)) {
      fs.mkdirSync(primaryDir, { recursive: true });
    }
    // Probar escritura real para descartar discos de solo lectura
    const probeFile = path.join(primaryDir, `.write-probe-${Date.now()}-${Math.random().toString(36).substring(2)}.tmp`);
    fs.writeFileSync(probeFile, 'ok');
    fs.unlinkSync(probeFile);
    resolvedDataDir = primaryDir;
    return resolvedDataDir;
  } catch {
    const fallbackDir = path.join(os.tmpdir(), 'labhub-st-data');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    resolvedDataDir = fallbackDir;
    return resolvedDataDir;
  }
}

export function getDataDirectory(): string {
  return resolveDataDirectory();
}

export function getDatabaseFilePath(): string {
  return path.join(getDataDirectory(), 'db.json');
}

export function getStlUploadsDirectory(): string {
  return path.join(getDataDirectory(), 'uploads', 'stl');
}

export function hashPassword(plainText: string): string {
  return crypto.createHash('sha256').update(plainText).digest('hex');
}

export const DEFAULT_GOOGLE_WEBHOOK_URL =
  process.env.GOOGLE_APPS_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbyvaLcBQXOv4XfD5LUqhYNauu6LOEUyHkmgmSyZTDeBDtP6A75FlN1UYn0GOJy8d2ZA/exec';

/**
 * Genera un archivo STL binario válido con geometría de prisma 3D (12 triángulos).
 * Tamaño exacto: 80 bytes (header) + 4 bytes (triCount = 12) + 12 * 50 bytes = 684 bytes.
 */
export function createSampleBinaryStlBuffer(sizeX = 40, sizeY = 40, sizeZ = 25): Buffer {
  const triangleCount = 12;
  const buffer = Buffer.alloc(84 + triangleCount * 50);

  // 80 bytes de cabecera
  buffer.write('LabHub UPN 3D Sample Model - Binary STL Export', 0, 'utf-8');
  // 4 bytes uint32 número de triángulos
  buffer.writeUInt32LE(triangleCount, 80);

  // Los 8 vértices del prisma
  const v = [
    [0, 0, 0],
    [sizeX, 0, 0],
    [sizeX, sizeY, 0],
    [0, sizeY, 0],
    [0, 0, sizeZ],
    [sizeX, 0, sizeZ],
    [sizeX, sizeY, sizeZ],
    [0, sizeY, sizeZ],
  ];

  // 12 caras triangulares (2 por cada cara del cubo)
  const triangles = [
    // Fondo (z=0)
    [v[0], v[2], v[1]],
    [v[0], v[3], v[2]],
    // Techo (z=sizeZ)
    [v[4], v[5], v[6]],
    [v[4], v[6], v[7]],
    // Frente (y=0)
    [v[0], v[1], v[5]],
    [v[0], v[5], v[4]],
    // Posterior (y=sizeY)
    [v[3], v[6], v[2]],
    [v[3], v[7], v[6]],
    // Izquierda (x=0)
    [v[0], v[4], v[7]],
    [v[0], v[7], v[3]],
    // Derecha (x=sizeX)
    [v[1], v[2], v[6]],
    [v[1], v[6], v[5]],
  ];

  triangles.forEach((tri, i) => {
    const offset = 84 + i * 50;
    // Normal aproximada (0, 0, 1)
    buffer.writeFloatLE(0, offset);
    buffer.writeFloatLE(0, offset + 4);
    buffer.writeFloatLE(1, offset + 8);

    // Vértice 1
    buffer.writeFloatLE(tri[0][0], offset + 12);
    buffer.writeFloatLE(tri[0][1], offset + 16);
    buffer.writeFloatLE(tri[0][2], offset + 20);

    // Vértice 2
    buffer.writeFloatLE(tri[1][0], offset + 24);
    buffer.writeFloatLE(tri[1][1], offset + 28);
    buffer.writeFloatLE(tri[1][2], offset + 32);

    // Vértice 3
    buffer.writeFloatLE(tri[2][0], offset + 36);
    buffer.writeFloatLE(tri[2][1], offset + 40);
    buffer.writeFloatLE(tri[2][2], offset + 44);

    // Attribute byte count (2 bytes uint16 = 0)
    buffer.writeUInt16LE(0, offset + 48);
  });

  return buffer;
}

/**
 * Construye el estado inicial (seed) con datos universitarios de UPN realistas,
 * inicializando además las opciones en la nube a partir de variables de entorno si existen.
 */
function buildInitialDatabase(): LabHubDatabase {
  const currentWeek = getWeekDaysForOffset(0);
  const nextWeek = getWeekDaysForOffset(1);

  const mondayCurrent = currentWeek.days[0].date;
  const wednesdayCurrent = currentWeek.days[2].date;

  const defaultPasswordHash = hashPassword('upn2026');

  const adminUsers: StoredAdminUser[] = [
    {
      id: 'admin-martin',
      username: 'martin.cernaa@gmail.com',
      fullName: 'Martín Aarón León Cerna',
      email: 'martin.cernaa@gmail.com',
      role: 'COORDINADOR',
      advisorId: 'adv-1',
      passwordHash: hashPassword('StitchUPN'),
    },
    {
      id: 'admin-martin-upn',
      username: 'martin.leon@upn.edu.pe',
      fullName: 'Martín Aarón León Cerna',
      email: 'martin.leon@upn.edu.pe',
      role: 'COORDINADOR',
      advisorId: 'adv-1',
      passwordHash: hashPassword('StitchUPN'),
    },
    {
      id: 'admin-juan',
      username: 'juan.gomez@upn.edu.pe',
      fullName: 'Juan Daniel Gomez Montes',
      email: 'juan.gomez@upn.edu.pe',
      role: 'ASISTENTE',
      advisorId: 'adv-2',
      passwordHash: hashPassword('JuanUPN'),
    },
    {
      id: 'admin-fernando',
      username: 'fernando.alva@upn.edu.pe',
      fullName: 'Luis Fernando Rodriguez Alva',
      email: 'fernando.alva@upn.edu.pe',
      role: 'ASISTENTE',
      advisorId: 'adv-3',
      passwordHash: hashPassword('BetoUPN'),
    },
    {
      id: 'admin-saul',
      username: 'saul.linares@upn.edu.pe',
      fullName: 'Saul Alexander Linares Franco',
      email: 'saul.linares@upn.edu.pe',
      role: 'ASISTENTE',
      advisorId: 'adv-4',
      passwordHash: hashPassword('SaulUPN'),
    },
  ];

  const advisors: AdvisorProfile[] = [
    {
      id: 'adv-1',
      fullName: 'Martín Aarón León Cerna',
      roleTitle: 'Coordinador y Administrador General',
      career: 'Ingeniería Mecatrónica',
      specialty: 'Automatización Industrial, Robótica y Control de Procesos',
      advisoryTopics: [
        'PLC y Redes Industriales',
        'Robótica y Control PID',
        'Diseño Mecatrónico y CAD 3D',
        'Integración de Proyectos',
      ],
      email: 'martin.cernaa@gmail.com',
      username: 'martin.cernaa@gmail.com',
      avatarInitials: 'ML',
      badgeColor: '#2563eb',
      active: true,
      weeklyAvailability: [
        { dayOfWeek: 3, blockId: 'B1', labId: 'electronica' },
        { dayOfWeek: 3, blockId: 'B2', labId: 'mecatronica' },
        { dayOfWeek: 3, blockId: 'B3', labId: 'electronica' },
        { dayOfWeek: 3, blockId: 'B4', labId: 'automatizacion' },
        { dayOfWeek: 3, blockId: 'B5', labId: 'electronica' },
        { dayOfWeek: 3, blockId: 'B6', labId: 'electronica' },
        { dayOfWeek: 4, blockId: 'B2', labId: 'electronica' },
        { dayOfWeek: 4, blockId: 'B3', labId: 'electronica' },
        { dayOfWeek: 4, blockId: 'B4', labId: 'automatizacion' },
        { dayOfWeek: 4, blockId: 'B5', labId: 'mecatronica' },
        { dayOfWeek: 4, blockId: 'B6', labId: 'mecatronica' },
        { dayOfWeek: 4, blockId: 'B7', labId: 'automatizacion' },
        { dayOfWeek: 4, blockId: 'B8', labId: 'automatizacion' },
        { dayOfWeek: 4, blockId: 'B9', labId: 'automatizacion' },
        { dayOfWeek: 5, blockId: 'B2', labId: 'automatizacion' },
        { dayOfWeek: 5, blockId: 'B3', labId: 'automatizacion' },
        { dayOfWeek: 5, blockId: 'B4', labId: 'automatizacion' },
        { dayOfWeek: 5, blockId: 'B5', labId: 'automatizacion' },
        { dayOfWeek: 5, blockId: 'B6', labId: 'automatizacion' },
        { dayOfWeek: 5, blockId: 'B7', labId: 'electronica' },
        { dayOfWeek: 5, blockId: 'B8', labId: 'automatizacion' },
        { dayOfWeek: 6, blockId: 'B1', labId: 'automatizacion' },
        { dayOfWeek: 6, blockId: 'B2', labId: 'automatizacion' },
        { dayOfWeek: 6, blockId: 'B3', labId: 'automatizacion' },
        { dayOfWeek: 6, blockId: 'B4', labId: 'automatizacion' },
      ],
    },
    {
      id: 'adv-2',
      fullName: 'Juan Daniel Gomez Montes',
      roleTitle: 'Administrador de Laboratorio',
      career: 'Ingeniería Electrónica',
      specialty: 'Sistemas Embebidos, Microcontroladores e Instrumentación',
      advisoryTopics: [
        'Microcontroladores y Arduino/ESP32',
        'Diseño de PCB y Circuitos',
        'Instrumentación Electrónica',
        'Sensores e IoT',
      ],
      email: 'juan.gomez@upn.edu.pe',
      username: 'juan.gomez@upn.edu.pe',
      avatarInitials: 'JG',
      badgeColor: '#16a34a',
      active: true,
      weeklyAvailability: [
        { dayOfWeek: 1, blockId: 'B1', labId: 'electronica' },
        { dayOfWeek: 1, blockId: 'B2', labId: 'electronica' },
        { dayOfWeek: 1, blockId: 'B3', labId: 'electronica' },
        { dayOfWeek: 1, blockId: 'B4', labId: 'automatizacion' },
        { dayOfWeek: 1, blockId: 'B5', labId: 'electronica' },
        { dayOfWeek: 1, blockId: 'B6', labId: 'electronica' },
        { dayOfWeek: 2, blockId: 'B1', labId: 'mecatronica' },
        { dayOfWeek: 2, blockId: 'B2', labId: 'automatizacion' },
        { dayOfWeek: 2, blockId: 'B3', labId: 'automatizacion' },
        { dayOfWeek: 2, blockId: 'B4', labId: 'mecatronica' },
        { dayOfWeek: 2, blockId: 'B5', labId: 'electronica' },
        { dayOfWeek: 2, blockId: 'B6', labId: 'electronica' },
        { dayOfWeek: 3, blockId: 'B3', labId: 'electronica' },
        { dayOfWeek: 3, blockId: 'B4', labId: 'automatizacion' },
        { dayOfWeek: 3, blockId: 'B5', labId: 'electronica' },
        { dayOfWeek: 3, blockId: 'B6', labId: 'electronica' },
        { dayOfWeek: 3, blockId: 'B7', labId: 'automatizacion' },
        { dayOfWeek: 3, blockId: 'B8', labId: 'electronica' },
        { dayOfWeek: 4, blockId: 'B1', labId: 'automatizacion' },
        { dayOfWeek: 4, blockId: 'B2', labId: 'electronica' },
        { dayOfWeek: 4, blockId: 'B3', labId: 'electronica' },
        { dayOfWeek: 4, blockId: 'B4', labId: 'automatizacion' },
        { dayOfWeek: 4, blockId: 'B5', labId: 'mecatronica' },
        { dayOfWeek: 4, blockId: 'B6', labId: 'mecatronica' },
        { dayOfWeek: 4, blockId: 'B7', labId: 'automatizacion' },
      ],
    },
    {
      id: 'adv-3',
      fullName: 'Luis Fernando Rodriguez Alva',
      roleTitle: 'Administrador de Laboratorio',
      career: 'Ingeniería Mecatrónica',
      specialty: 'Control Automático, Electroneumática y Manufactura',
      advisoryTopics: [
        'Electroneumática y Actuadores',
        'Control Automático',
        'Modelado CAD e Impresión 3D',
        'Mecanismos y Robótica',
      ],
      email: 'fernando.alva@upn.edu.pe',
      username: 'fernando.alva@upn.edu.pe',
      avatarInitials: 'LR',
      badgeColor: '#ea580c',
      active: true,
      weeklyAvailability: [
        { dayOfWeek: 1, blockId: 'B4', labId: 'automatizacion' },
        { dayOfWeek: 1, blockId: 'B5', labId: 'mecatronica' },
        { dayOfWeek: 1, blockId: 'B6', labId: 'mecatronica' },
        { dayOfWeek: 1, blockId: 'B7', labId: 'automatizacion' },
        { dayOfWeek: 1, blockId: 'B8', labId: 'automatizacion' },
        { dayOfWeek: 1, blockId: 'B9', labId: 'mecatronica' },
        { dayOfWeek: 2, blockId: 'B2', labId: 'automatizacion' },
        { dayOfWeek: 2, blockId: 'B3', labId: 'automatizacion' },
        { dayOfWeek: 2, blockId: 'B4', labId: 'mecatronica' },
        { dayOfWeek: 2, blockId: 'B5', labId: 'mecatronica' },
        { dayOfWeek: 3, blockId: 'B4', labId: 'automatizacion' },
        { dayOfWeek: 3, blockId: 'B5', labId: 'mecatronica' },
        { dayOfWeek: 3, blockId: 'B6', labId: 'mecatronica' },
        { dayOfWeek: 3, blockId: 'B7', labId: 'automatizacion' },
        { dayOfWeek: 3, blockId: 'B8', labId: 'mecatronica' },
        { dayOfWeek: 3, blockId: 'B9', labId: 'mecatronica' },
        { dayOfWeek: 4, blockId: 'B2', labId: 'mecatronica' },
        { dayOfWeek: 4, blockId: 'B3', labId: 'mecatronica' },
        { dayOfWeek: 4, blockId: 'B4', labId: 'mecatronica' },
        { dayOfWeek: 4, blockId: 'B5', labId: 'mecatronica' },
        { dayOfWeek: 5, blockId: 'B1', labId: 'mecatronica' },
        { dayOfWeek: 5, blockId: 'B2', labId: 'automatizacion' },
        { dayOfWeek: 5, blockId: 'B3', labId: 'automatizacion' },
        { dayOfWeek: 5, blockId: 'B4', labId: 'automatizacion' },
        { dayOfWeek: 5, blockId: 'B5', labId: 'mecatronica' },
      ],
    },
    {
      id: 'adv-4',
      fullName: 'Saul Alexander Linares Franco',
      roleTitle: 'Administrador de Laboratorio',
      career: 'Ingeniería Mecatrónica',
      specialty: 'Electrónica de Potencia, Prototipado Rápido e Impresión 3D',
      advisoryTopics: [
        'Electrónica de Potencia',
        'Impresión 3D y Laminado STL',
        'Prototipado Electrónico',
        'Programación de Sistemas',
      ],
      email: 'saul.linares@upn.edu.pe',
      username: 'saul.linares@upn.edu.pe',
      avatarInitials: 'SL',
      badgeColor: '#ec4899',
      active: true,
      weeklyAvailability: [
        { dayOfWeek: 1, blockId: 'B2', labId: 'automatizacion' },
        { dayOfWeek: 1, blockId: 'B3', labId: 'electronica' },
        { dayOfWeek: 1, blockId: 'B4', labId: 'automatizacion' },
        { dayOfWeek: 1, blockId: 'B5', labId: 'automatizacion' },
        { dayOfWeek: 1, blockId: 'B6', labId: 'automatizacion' },
        { dayOfWeek: 2, blockId: 'B1', labId: 'mecatronica' },
        { dayOfWeek: 2, blockId: 'B2', labId: 'automatizacion' },
        { dayOfWeek: 2, blockId: 'B3', labId: 'automatizacion' },
        { dayOfWeek: 2, blockId: 'B4', labId: 'mecatronica' },
        { dayOfWeek: 2, blockId: 'B5', labId: 'automatizacion' },
        { dayOfWeek: 2, blockId: 'B6', labId: 'automatizacion' },
        { dayOfWeek: 2, blockId: 'B7', labId: 'automatizacion' },
        { dayOfWeek: 2, blockId: 'B8', labId: 'automatizacion' },
        { dayOfWeek: 2, blockId: 'B9', labId: 'mecatronica' },
        { dayOfWeek: 3, blockId: 'B2', labId: 'mecatronica' },
        { dayOfWeek: 3, blockId: 'B3', labId: 'automatizacion' },
        { dayOfWeek: 3, blockId: 'B4', labId: 'automatizacion' },
        { dayOfWeek: 3, blockId: 'B5', labId: 'automatizacion' },
        { dayOfWeek: 3, blockId: 'B6', labId: 'automatizacion' },
        { dayOfWeek: 6, blockId: 'B5', labId: 'automatizacion' },
        { dayOfWeek: 6, blockId: 'B6', labId: 'automatizacion' },
        { dayOfWeek: 6, blockId: 'B7', labId: 'mecatronica' },
        { dayOfWeek: 6, blockId: 'B8', labId: 'automatizacion' },
      ],
    },
  ];

  const recurringClasses: RecurringClassSlot[] = [
    // ==========================================
    // LABORATORIO DE MECATRÓNICA A-207
    // ==========================================
    // Lunes (1)
    { id: 'class-mec-1', labId: 'mecatronica', dayOfWeek: 1, blockId: 'B1', courseName: 'Circuitos Eléctricos 2', teacherName: 'Saldaña Milla Fernando Aristides', nrc: '21251' },
    { id: 'class-mec-2', labId: 'mecatronica', dayOfWeek: 1, blockId: 'B2', courseName: 'Circuitos Eléctricos 2', teacherName: 'Saldaña Milla Fernando Aristides', nrc: '21251' },
    { id: 'class-mec-3', labId: 'mecatronica', dayOfWeek: 1, blockId: 'B3', courseName: 'Manufactura Asistida por Computadora', teacherName: 'Alayo Miguel Raul Fernando', nrc: '26818' },
    { id: 'class-mec-4', labId: 'mecatronica', dayOfWeek: 1, blockId: 'B4', courseName: 'Manufactura Asistida por Computadora', teacherName: 'Alayo Miguel Raul Fernando', nrc: '26818' },
    { id: 'class-mec-5', labId: 'mecatronica', dayOfWeek: 1, blockId: 'B5', courseName: 'Circuitos Eléctricos', teacherName: 'Saldaña Milla Fernando Aristides', nrc: '21258' },
    { id: 'class-mec-6', labId: 'mecatronica', dayOfWeek: 1, blockId: 'B6', courseName: 'Circuitos Eléctricos', teacherName: 'Saldaña Milla Fernando Aristides', nrc: '21258' },
    { id: 'class-mec-7', labId: 'mecatronica', dayOfWeek: 1, blockId: 'B7', courseName: 'Circuitos y Sistemas Digitales', teacherName: 'Araujo Castillo Lenin', nrc: '65500' },
    { id: 'class-mec-8', labId: 'mecatronica', dayOfWeek: 1, blockId: 'B8', courseName: 'Circuitos y Sistemas Digitales', teacherName: 'Araujo Castillo Lenin', nrc: '65500' },
    // Martes (2)
    { id: 'class-mec-9', labId: 'mecatronica', dayOfWeek: 2, blockId: 'B2', courseName: 'Circuitos Eléctricos', teacherName: 'Saldaña Milla Fernando Aristides', nrc: '21259' },
    { id: 'class-mec-10', labId: 'mecatronica', dayOfWeek: 2, blockId: 'B3', courseName: 'Circuitos Eléctricos', teacherName: 'Saldaña Milla Fernando Aristides', nrc: '21259' },
    { id: 'class-mec-11', labId: 'mecatronica', dayOfWeek: 2, blockId: 'B5', courseName: 'Procesamiento de Señales', teacherName: 'Gutierrez Magan Luis Mauricio', nrc: '21286' },
    { id: 'class-mec-12', labId: 'mecatronica', dayOfWeek: 2, blockId: 'B6', courseName: 'Circuitos Eléctricos', teacherName: 'Saldaña Milla Fernando Aristides', nrc: '21260' },
    { id: 'class-mec-13', labId: 'mecatronica', dayOfWeek: 2, blockId: 'B7', courseName: 'Circuitos Eléctricos', teacherName: 'Saldaña Milla Fernando Aristides', nrc: '21260' },
    { id: 'class-mec-14', labId: 'mecatronica', dayOfWeek: 2, blockId: 'B8', courseName: 'Ingeniería de Control', teacherName: 'Romero Alvarado Juan Alfredo', nrc: '28570' },
    // Miércoles (3)
    { id: 'class-mec-15', labId: 'mecatronica', dayOfWeek: 3, blockId: 'B1', courseName: 'Máquinas Eléctricas', teacherName: 'León Cruz Kelly Lidia', nrc: '21251' },
    { id: 'class-mec-16', labId: 'mecatronica', dayOfWeek: 3, blockId: 'B3', courseName: 'Máquinas Eléctricas', teacherName: 'León Cruz Kelly Lidia', nrc: '21282' },
    { id: 'class-mec-17', labId: 'mecatronica', dayOfWeek: 3, blockId: 'B4', courseName: 'Máquinas Eléctricas', teacherName: 'León Cruz Kelly Lidia', nrc: '28549' },
    { id: 'class-mec-18', labId: 'mecatronica', dayOfWeek: 3, blockId: 'B5', courseName: 'Manufactura Asistida por Computadora', teacherName: 'Alayo Miguel Raul Fernando', nrc: '26816' },
    { id: 'class-mec-19', labId: 'mecatronica', dayOfWeek: 3, blockId: 'B6', courseName: 'Manufactura Asistida por Computadora', teacherName: 'Alayo Miguel Raul Fernando', nrc: '26816' },
    { id: 'class-mec-20', labId: 'mecatronica', dayOfWeek: 3, blockId: 'B7', courseName: 'Manufactura Asistida por Computadora', teacherName: 'Alayo Miguel Raul Fernando', nrc: '26817' },
    { id: 'class-mec-21', labId: 'mecatronica', dayOfWeek: 3, blockId: 'B8', courseName: 'Manufactura Asistida por Computadora', teacherName: 'Alayo Miguel Raul Fernando', nrc: '26817' },
    // Jueves (4)
    { id: 'class-mec-22', labId: 'mecatronica', dayOfWeek: 4, blockId: 'B2', courseName: 'Introducción a la Ingeniería Mecatrónica', teacherName: 'Rodriguez Ochoa Jairo Javier', nrc: '65257' },
    { id: 'class-mec-23', labId: 'mecatronica', dayOfWeek: 4, blockId: 'B3', courseName: 'Introducción a la Ingeniería Mecatrónica', teacherName: 'Rodriguez Ochoa Jairo Javier', nrc: '63872' },
    { id: 'class-mec-24', labId: 'mecatronica', dayOfWeek: 4, blockId: 'B7', courseName: 'Ingeniería de Control', teacherName: 'Manzano Ramos Edgar Andre', nrc: '21291' },
    // Viernes (5)
    { id: 'class-mec-25', labId: 'mecatronica', dayOfWeek: 5, blockId: 'B2', courseName: 'Procesamiento de Señales', teacherName: 'Gutierrez Magan Luis Mauricio', nrc: '21285' },
    { id: 'class-mec-26', labId: 'mecatronica', dayOfWeek: 5, blockId: 'B3', courseName: 'Procesamiento de Señales', teacherName: 'Gutierrez Magan Luis Mauricio', nrc: '21285' },
    { id: 'class-mec-27', labId: 'mecatronica', dayOfWeek: 5, blockId: 'B4', courseName: 'Procesamiento de Señales', teacherName: 'Gutierrez Magan Luis Mauricio', nrc: '21289' },
    { id: 'class-mec-28', labId: 'mecatronica', dayOfWeek: 5, blockId: 'B7', courseName: 'Circuitos y Sistemas Digitales', teacherName: 'Araujo Castillo Lenin', nrc: '28543' },
    { id: 'class-mec-29', labId: 'mecatronica', dayOfWeek: 5, blockId: 'B8', courseName: 'Circuitos y Sistemas Digitales', teacherName: 'Araujo Castillo Lenin', nrc: '28543' },

    // ==========================================
    // LABORATORIO DE AUTOMATIZACIÓN B-210
    // ==========================================
    // Lunes (1)
    { id: 'class-aut-1', labId: 'automatizacion', dayOfWeek: 1, blockId: 'B2', courseName: 'Ingeniería Eléctrica y Automatización', teacherName: 'León León Ryan Abraham', nrc: '21317' },
    { id: 'class-aut-2', labId: 'automatizacion', dayOfWeek: 1, blockId: 'B3', courseName: 'Ingeniería Eléctrica y Automatización', teacherName: 'León León Ryan Abraham', nrc: '21318' },
    { id: 'class-aut-3', labId: 'automatizacion', dayOfWeek: 1, blockId: 'B5', courseName: 'Ingeniería Eléctrica y Automatización', teacherName: 'León León Ryan Abraham', nrc: '21319' },
    { id: 'class-aut-4', labId: 'automatizacion', dayOfWeek: 1, blockId: 'B6', courseName: 'Ingeniería Eléctrica y Automatización', teacherName: 'León León Ryan Abraham', nrc: '21320' },
    // Martes (2)
    { id: 'class-aut-5', labId: 'automatizacion', dayOfWeek: 2, blockId: 'B1', courseName: 'Electrohidráulica y Electroneumática', teacherName: 'Paredes Corcuera Edwin Danilo', nrc: '26822' },
    { id: 'class-aut-6', labId: 'automatizacion', dayOfWeek: 2, blockId: 'B4', courseName: 'Instrumentación Industrial', teacherName: 'Grijalba Mauricio Jean Marco', nrc: '21311' },
    { id: 'class-aut-7', labId: 'automatizacion', dayOfWeek: 2, blockId: 'B5', courseName: 'Arquitectura del Computador', teacherName: 'Peralta Lujan Jose Luis', nrc: '21447' },
    { id: 'class-aut-8', labId: 'automatizacion', dayOfWeek: 2, blockId: 'B6', courseName: 'Arquitectura del Computador', teacherName: 'Peralta Lujan Jose Luis', nrc: '21448' },
    { id: 'class-aut-9', labId: 'automatizacion', dayOfWeek: 2, blockId: 'B8', courseName: 'Ingeniería de Control 2', teacherName: 'Mendoza Chomba Jorge Esteban', nrc: '25365' },
    { id: 'class-aut-10', labId: 'automatizacion', dayOfWeek: 2, blockId: 'B9', courseName: 'Ingeniería de Control 2', teacherName: 'Mendoza Chomba Jorge Esteban', nrc: '25365' },
    // Miércoles (3)
    { id: 'class-aut-11', labId: 'automatizacion', dayOfWeek: 3, blockId: 'B2', courseName: 'Ingeniería Eléctrica y Automatización', teacherName: 'León León Ryan Abraham', nrc: '25161' },
    { id: 'class-aut-12', labId: 'automatizacion', dayOfWeek: 3, blockId: 'B3', courseName: 'Ingeniería Eléctrica y Automatización', teacherName: 'León León Ryan Abraham', nrc: '25162' },
    { id: 'class-aut-13', labId: 'automatizacion', dayOfWeek: 3, blockId: 'B5', courseName: 'Ingeniería Eléctrica y Automatización', teacherName: 'León León Ryan Abraham', nrc: '25163' },
    { id: 'class-aut-14', labId: 'automatizacion', dayOfWeek: 3, blockId: 'B6', courseName: 'Ingeniería Eléctrica y Automatización', teacherName: 'León León Ryan Abraham', nrc: '25164' },
    { id: 'class-aut-15', labId: 'automatizacion', dayOfWeek: 3, blockId: 'B8', courseName: 'Electrónica Digital', teacherName: 'Valqui Sipiran Alexanders', nrc: '21407' },
    // Jueves (4)
    { id: 'class-aut-16', labId: 'automatizacion', dayOfWeek: 4, blockId: 'B2', courseName: 'Ingeniería de Procesos Industriales', teacherName: 'Romero Alvarado Juan Alfredo', nrc: '25367' },
    { id: 'class-aut-17', labId: 'automatizacion', dayOfWeek: 4, blockId: 'B3', courseName: 'Ingeniería de Procesos Industriales', teacherName: 'Romero Alvarado Juan Alfredo', nrc: '25367' },
    { id: 'class-aut-18', labId: 'automatizacion', dayOfWeek: 4, blockId: 'B5', courseName: 'Electrohidráulica y Electroneumática', teacherName: 'Paredes Corcuera Edwin Danilo', nrc: '26820' },
    { id: 'class-aut-19', labId: 'automatizacion', dayOfWeek: 4, blockId: 'B6', courseName: 'Electrohidráulica y Electroneumática', teacherName: 'Paredes Corcuera Edwin Danilo', nrc: '26821' },
    // Viernes (5)
    { id: 'class-aut-20', labId: 'automatizacion', dayOfWeek: 5, blockId: 'B9', courseName: 'Ingeniería Eléctrica y Automatización', teacherName: 'De La Cruz Rodriguez Oscar Miguel', nrc: '21165' },
    // Sábado (6)
    { id: 'class-aut-21', labId: 'automatizacion', dayOfWeek: 6, blockId: 'B7', courseName: 'Taller de Robótica', teacherName: 'Valqui Sipiran Alexanders', nrc: '6723' },
    // Domingo (7)
    { id: 'class-aut-22', labId: 'automatizacion', dayOfWeek: 7, blockId: 'B1', courseName: 'Ingeniería Eléctrica y Automatización', teacherName: 'De La Cruz Rodriguez Oscar Miguel', nrc: '6678' },
    { id: 'class-aut-23', labId: 'automatizacion', dayOfWeek: 7, blockId: 'B2', courseName: 'Ingeniería Eléctrica y Automatización', teacherName: 'De La Cruz Rodriguez Oscar Miguel', nrc: '6678' },

    // ==========================================
    // LABORATORIO DE ELECTRÓNICA B-209
    // ==========================================
    // Lunes (1)
    { id: 'class-ele-1', labId: 'electronica', dayOfWeek: 1, blockId: 'B2', courseName: 'Introducción a la Ingeniería Electrónica', teacherName: 'León Cruz Kelly Lidia', nrc: '23521' },
    { id: 'class-ele-2', labId: 'electronica', dayOfWeek: 1, blockId: 'B4', courseName: 'Electrónica Digital', teacherName: 'Alfaro Bazan Pablo Martin', nrc: '26777' },
    { id: 'class-ele-3', labId: 'electronica', dayOfWeek: 1, blockId: 'B5', courseName: 'Arquitectura del Computador', teacherName: 'Peralta Lujan Jose Luis', nrc: '21446' },
    { id: 'class-ele-4', labId: 'electronica', dayOfWeek: 1, blockId: 'B6', courseName: 'Arquitectura del Computador', teacherName: 'Peralta Lujan Jose Luis', nrc: '21451' },
    { id: 'class-ele-5', labId: 'electronica', dayOfWeek: 1, blockId: 'B7', courseName: 'Ingeniería de Control', teacherName: 'Manzano Ramos Edgar Andre', nrc: '21289' },
    { id: 'class-ele-6', labId: 'electronica', dayOfWeek: 1, blockId: 'B8', courseName: 'Electrónica Digital', teacherName: 'Valqui Sipiran Alexanders', nrc: '21405' },
    { id: 'class-ele-7', labId: 'electronica', dayOfWeek: 1, blockId: 'B9', courseName: 'Electrónica Digital', teacherName: 'Valqui Sipiran Alexanders', nrc: '21406' },
    // Martes (2)
    { id: 'class-ele-8', labId: 'electronica', dayOfWeek: 2, blockId: 'B1', courseName: 'Electrónica Digital', teacherName: 'Alfaro Bazan Pablo Martin', nrc: '26777' },
    { id: 'class-ele-9', labId: 'electronica', dayOfWeek: 2, blockId: 'B2', courseName: 'Taller de Robótica', teacherName: 'Leon Soto Juan Carlos', nrc: '23463' },
    { id: 'class-ele-10', labId: 'electronica', dayOfWeek: 2, blockId: 'B3', courseName: 'Taller de Robótica', teacherName: 'Leon Soto Juan Carlos', nrc: '23464' },
    { id: 'class-ele-11', labId: 'electronica', dayOfWeek: 2, blockId: 'B4', courseName: 'Electrónica Digital', teacherName: 'Gomez Montes Juan Daniel', nrc: '69101' },
    { id: 'class-ele-12', labId: 'electronica', dayOfWeek: 2, blockId: 'B5', courseName: 'Microprocesadores y Microcontroladores', teacherName: 'Mendoza Chomba Jorge Esteban', nrc: '26812' },
    { id: 'class-ele-13', labId: 'electronica', dayOfWeek: 2, blockId: 'B6', courseName: 'Microprocesadores y Microcontroladores', teacherName: 'Mendoza Chomba Jorge Esteban', nrc: '26813' },
    { id: 'class-ele-14', labId: 'electronica', dayOfWeek: 2, blockId: 'B7', courseName: 'Arquitectura del Computador', teacherName: 'Peralta Lujan Jose Luis', nrc: '21449' },
    { id: 'class-ele-15', labId: 'electronica', dayOfWeek: 2, blockId: 'B8', courseName: 'Arquitectura del Computador', teacherName: 'Peralta Lujan Jose Luis', nrc: '21450' },
    { id: 'class-ele-16', labId: 'electronica', dayOfWeek: 2, blockId: 'B9', courseName: 'Arquitectura del Computador', teacherName: 'Rojas Arce Henry', nrc: '30245' },
    // Miércoles (3)
    { id: 'class-ele-17', labId: 'electronica', dayOfWeek: 3, blockId: 'B2', courseName: 'Taller de Robótica', teacherName: 'Leon Soto Juan Carlos', nrc: '23465' },
    { id: 'class-ele-18', labId: 'electronica', dayOfWeek: 3, blockId: 'B3', courseName: 'Taller de Robótica', teacherName: 'Leon Soto Juan Carlos', nrc: '23466' },
    { id: 'class-ele-19', labId: 'electronica', dayOfWeek: 3, blockId: 'B4', courseName: 'Electrónica Digital', teacherName: 'Gomez Montes Juan Daniel', nrc: '69101' },
    { id: 'class-ele-20', labId: 'electronica', dayOfWeek: 3, blockId: 'B5', courseName: 'Ingeniería de Control', teacherName: 'Romero Alvarado Juan Alfredo', nrc: '28571' },
    { id: 'class-ele-21', labId: 'electronica', dayOfWeek: 3, blockId: 'B6', courseName: 'Circuitos Digitales 2', teacherName: 'Araujo Castillo Lenin', nrc: '25049' },
    { id: 'class-ele-22', labId: 'electronica', dayOfWeek: 3, blockId: 'B7', courseName: 'Circuitos Digitales 2', teacherName: 'Araujo Castillo Lenin', nrc: '25049' },
    { id: 'class-ele-23', labId: 'electronica', dayOfWeek: 3, blockId: 'B8', courseName: 'Medios de Transmisión y Antenas', teacherName: 'Hurtado Terranova Edwin Ricardo', nrc: '21056' },
    { id: 'class-ele-24', labId: 'electronica', dayOfWeek: 3, blockId: 'B9', courseName: 'Telecomunicaciones 2', teacherName: 'Hurtado Terranova Edwin Ricardo', nrc: '21019' },
    // Jueves (4)
    { id: 'class-ele-25', labId: 'electronica', dayOfWeek: 4, blockId: 'B1', courseName: 'Circuitos Digitales 2', teacherName: 'Araujo Castillo Lenin', nrc: '25049' },
    { id: 'class-ele-26', labId: 'electronica', dayOfWeek: 4, blockId: 'B2', courseName: 'Electrónica Digital', teacherName: 'Alfaro Bazan Pablo Martin', nrc: '21299' },
    { id: 'class-ele-27', labId: 'electronica', dayOfWeek: 4, blockId: 'B3', courseName: 'Electrónica Digital', teacherName: 'Alfaro Bazan Pablo Martin', nrc: '21299' },
    { id: 'class-ele-28', labId: 'electronica', dayOfWeek: 4, blockId: 'B4', courseName: 'Procesamiento de Señales Ing. Electrónica', teacherName: 'Gutierrez Magan Luis Mauricio', nrc: '21063' },
    { id: 'class-ele-29', labId: 'electronica', dayOfWeek: 4, blockId: 'B5', courseName: 'Procesamiento de Señales Ing. Electrónica', teacherName: 'Gutierrez Magan Luis Mauricio', nrc: '21063' },
    { id: 'class-ele-30', labId: 'electronica', dayOfWeek: 4, blockId: 'B6', courseName: 'Microprocesadores y Microcontroladores', teacherName: 'Mendoza Chomba Jorge Esteban', nrc: '21061' },
    { id: 'class-ele-31', labId: 'electronica', dayOfWeek: 4, blockId: 'B7', courseName: 'Dispositivos Electrónicos', teacherName: 'León Cerna Martín Aarón', nrc: '21015' },
    { id: 'class-ele-32', labId: 'electronica', dayOfWeek: 4, blockId: 'B8', courseName: 'Robótica', teacherName: 'Mendoza Chomba Jorge Esteban', nrc: '21053' },
    { id: 'class-ele-33', labId: 'electronica', dayOfWeek: 4, blockId: 'B9', courseName: 'Robótica', teacherName: 'Mendoza Chomba Jorge Esteban', nrc: '21053' },
    // Viernes (5)
    { id: 'class-ele-34', labId: 'electronica', dayOfWeek: 5, blockId: 'B1', courseName: 'Microprocesadores y Microcontroladores', teacherName: 'Mendoza Chomba Jorge Esteban', nrc: '26814' },
    { id: 'class-ele-35', labId: 'electronica', dayOfWeek: 5, blockId: 'B2', courseName: 'Microprocesadores y Microcontroladores', teacherName: 'Mendoza Chomba Jorge Esteban', nrc: '26815' },
    { id: 'class-ele-36', labId: 'electronica', dayOfWeek: 5, blockId: 'B3', courseName: 'Taller de Robótica', teacherName: 'Leon Soto Juan Carlos', nrc: '30313' },
    { id: 'class-ele-37', labId: 'electronica', dayOfWeek: 5, blockId: 'B4', courseName: 'Taller de Robótica', teacherName: 'Leon Soto Juan Carlos', nrc: '30314' },
    { id: 'class-ele-38', labId: 'electronica', dayOfWeek: 5, blockId: 'B5', courseName: 'Procesamiento de Señales', teacherName: 'Gutierrez Magan Luis Mauricio', nrc: '21286' },
    { id: 'class-ele-39', labId: 'electronica', dayOfWeek: 5, blockId: 'B6', courseName: 'Procesamiento de Señales', teacherName: 'Gutierrez Magan Luis Mauricio', nrc: '21286' },
    { id: 'class-ele-40', labId: 'electronica', dayOfWeek: 5, blockId: 'B8', courseName: 'Inteligencia Artificial y Sistemas Expertos', teacherName: 'Grijalba Mauricio Jean Marco', nrc: '25054' },
    // Sábado (6)
    { id: 'class-ele-41', labId: 'electronica', dayOfWeek: 6, blockId: 'B1', courseName: 'Circuitos y Sistemas Digitales', teacherName: 'Araujo Castillo Lenin', nrc: '28541' },
    { id: 'class-ele-42', labId: 'electronica', dayOfWeek: 6, blockId: 'B2', courseName: 'Circuitos y Sistemas Digitales', teacherName: 'Araujo Castillo Lenin', nrc: '28541' },
    { id: 'class-ele-43', labId: 'electronica', dayOfWeek: 6, blockId: 'B3', courseName: 'Circuitos y Sistemas Digitales', teacherName: 'Araujo Castillo Lenin', nrc: '28538' },
    { id: 'class-ele-44', labId: 'electronica', dayOfWeek: 6, blockId: 'B4', courseName: 'Circuitos y Sistemas Digitales', teacherName: 'Araujo Castillo Lenin', nrc: '28538' },
    { id: 'class-ele-45', labId: 'electronica', dayOfWeek: 6, blockId: 'B5', courseName: 'Inteligencia Artificial y Sistemas Expertos', teacherName: 'Grijalba Mauricio Jean Marco', nrc: '26824' },
    { id: 'class-ele-46', labId: 'electronica', dayOfWeek: 6, blockId: 'B6', courseName: 'Inteligencia Artificial y Sistemas Expertos', teacherName: 'Grijalba Mauricio Jean Marco', nrc: '26825' },
    { id: 'class-ele-47', labId: 'electronica', dayOfWeek: 6, blockId: 'B7', courseName: 'Arquitectura del Computador', teacherName: 'Valqui Sipiran Alexanders', nrc: '6770' },
    { id: 'class-ele-48', labId: 'electronica', dayOfWeek: 6, blockId: 'B8', courseName: 'Inteligencia Artificial y Sistemas Expertos', teacherName: 'Grijalba Mauricio Jean Marco', nrc: '26825' },
  ];

  const reservation1: LabReservation = {
    id: 'res-sample-001',
    code: 'RES-2026-0001',
    origin: 'RESERVA_DIRECTA',
    labId: 'automatizacion',
    date: mondayCurrent,
    blockIds: ['B4'],
    leadStudent: {
      fullName: 'Kevin Alexander Quispe Ramos',
      upnCode: 'N00142851',
    },
    participants: [
      { fullName: 'Mariana Nicole Rojas Vega', upnCode: 'N00193420' },
      { fullName: 'Renzo Fabian Díaz Castillo', upnCode: 'N00185412' },
    ],
    projectName: 'Banda Transportadora con Clasificador Neumático',
    career: 'Ingeniería Mecatrónica',
    course: 'Automatización Industrial',
    nrc: '4512',
    status: 'ACTIVA',
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    googleSynced: false,
  };

  const reservation2: LabReservation = {
    id: 'res-sample-002',
    code: 'RES-2026-0002',
    origin: 'RESERVA_DIRECTA',
    labId: 'electronica',
    date: wednesdayCurrent,
    blockIds: ['B3'],
    leadStudent: {
      fullName: 'Daniela Stephanie Flores Gómez',
      upnCode: 'N00165842',
    },
    participants: [
      { fullName: 'Alvaro Sebastián Morales Ruiz', upnCode: 'N00174129' },
    ],
    projectName: 'Fuente Regulada Lineal con Protección Contra Cortocircuito',
    career: 'Ingeniería Electrónica',
    course: 'Electrónica de Potencia',
    nrc: '3205',
    status: 'ACTIVA',
    createdAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    googleSynced: false,
  };

  const advisoryReservationId = 'res-sample-advisory-003';
  const sampleAdvisoryId = 'adv-req-sample-001';

  const reservationLinkedToAdvisory: LabReservation = {
    id: advisoryReservationId,
    code: 'RES-2026-0003',
    origin: 'ASESORIA',
    linkedAdvisoryId: sampleAdvisoryId,
    labId: 'automatizacion',
    date: wednesdayCurrent,
    blockIds: ['B5'],
    leadStudent: {
      fullName: 'Lucía Fernanda Herrera Salas',
      upnCode: 'N00189345',
    },
    participants: [
      { fullName: 'Carlos Enrique Alarcón Peña', upnCode: 'N00182390' },
    ],
    projectName: 'Configuración de Comunicación Profinet PLC S7-1500 y HMI KTP700',
    career: 'Ingeniería Mecatrónica',
    course: 'Redes Industriales y SCADA',
    nrc: '4518',
    status: 'ACTIVA',
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    googleSynced: false,
  };

  const sampleAdvisory: AdvisoryRequest = {
    id: sampleAdvisoryId,
    code: 'ASE-2026-0001',
    advisorId: 'adv-1',
    advisorName: 'Ing. José Luis Morales Ríos',
    advisorEmail: 'jose.morales@upn.pe',
    labId: 'automatizacion',
    date: wednesdayCurrent,
    blockIds: ['B5'],
    projectName: 'Configuración de Comunicación Profinet PLC S7-1500 y HMI KTP700',
    course: 'Redes Industriales y SCADA',
    nrc: '4518',
    topicNotes:
      'Requerimos soporte para resolver una falla de sincronización en la topología Profinet y direccionamiento IP estático con la HMI.',
    students: [
      { fullName: 'Lucía Fernanda Herrera Salas', upnCode: 'N00189345' },
      { fullName: 'Carlos Enrique Alarcón Peña', upnCode: 'N00182390' },
    ],
    linkedReservationId: advisoryReservationId,
    linkedReservationCode: 'RES-2026-0003',
    status: 'PROGRAMADA',
    calendarEventUrl: '',
    icsDownloadUrl: `/api/advisories/${sampleAdvisoryId}/ics`,
    calendarNotified: false,
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
  };
  sampleAdvisory.calendarEventUrl = buildGoogleCalendarUrl(
    buildAdvisoryCalendarDetails(sampleAdvisory)
  );

  const sampleSignaturePng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJYAAAA8CAYAAACF0L/3AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAH1SURBVHhe7dsxattAFIXh/c89Z20JdpmN4AowKewZ...firma_simulada';

  const sampleLoan: EquipmentLoan = {
    id: 'loan-sample-001',
    code: 'EQP-2026-0001',
    labId: 'electronica',
    teacherName: 'Kelly Lidia León Cruz',
    cycle: 'Ciclo VI',
    courseProgram: 'Ingeniería Electrónica - Circuitos II',
    attendedByAdvisorId: 'adv-2',
    attendedByName: 'Juan Daniel Gomez Montes',
    items: [
      {
        quantity: 1,
        equipmentName: 'Kit de Entrenamiento en Microcontroladores (Microchip AC164162)',
        upnCode: '4-001358',
      },
      {
        quantity: 1,
        equipmentName: 'Tarjeta de Desarrollo FPGA DE0-CV (Terasic)',
        upnCode: '4-000560',
      },
    ],
    groupMembers: [
      { fullName: 'César Augusto Miranda Vela', nrc: '3205' },
      { fullName: 'Patricia Lorena Romero Cruz', nrc: '3205' },
    ],
    responsibleName: 'César Augusto Miranda Vela',
    responsibleUpnCode: 'N00159483',
    signatureDataUrl: sampleSignaturePng,
    status: 'PENDIENTE',
    createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
    googleSynced: false,
  };

  const samplePrintQueued: Print3DRequest = {
    id: 'print-sample-001',
    code: '3DP-2026-0001',
    studentFullName: 'Giacomo Pierro Rossi Navarro',
    upnCode: 'N00178302',
    teacherName: 'Fernando Aristides Saldaña Milla',
    course: 'Robótica Industrial y Móvil',
    nrc: '5840',
    files: [
      {
        id: 'file-stl-001',
        originalName: 'soporte_gripper_robotico.stl',
        storedFileName: 'soporte_gripper_robotico.stl',
        sizeBytes: 684,
        format: 'BINARY',
        triangleCount: 12,
        dimensionsMm: { x: 40, y: 40, z: 25 },
        estimatedVolumeCm3: 40.0,
        version: 1,
        uploadedAt: new Date(Date.now() - 3600000 * 20).toISOString(),
        downloadUrl: '/api/prints/files/3DP-2026-0001/soporte_gripper_robotico.stl',
      },
    ],
    status: 'EN COLA',
    statusHistory: [
      {
        status: 'ENVIADO',
        timestamp: new Date(Date.now() - 3600000 * 20).toISOString(),
        actor: 'Giacomo Pierro Rossi Navarro',
      },
      {
        status: 'EN REVISION',
        timestamp: new Date(Date.now() - 3600000 * 16).toISOString(),
        actor: 'Saul Alexander Linares Franco',
        comment: 'Geometría validada. Sin voladizos críticos que requieran soporte denso.',
      },
      {
        status: 'EN COLA',
        timestamp: new Date(Date.now() - 3600000 * 10).toISOString(),
        actor: 'Saul Alexander Linares Franco',
        comment: 'Asignado a impresora Prusa i3 MK3S+ #2 con filamento PLA Negro.',
      },
    ],
    googleSynced: false,
    createdAt: new Date(Date.now() - 3600000 * 20).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 10).toISOString(),
  };

  const observedNow = new Date(Date.now() - 3600000 * 8);
  const samplePrintObserved: Print3DRequest = {
    id: 'print-sample-002',
    code: '3DP-2026-0002',
    studentFullName: 'Andrea Nicole Tapia Salcedo',
    upnCode: 'N00192348',
    teacherName: 'Lenin Araujo Castillo',
    course: 'Manufactura Asistida por Computadora (CAM)',
    nrc: '5844',
    files: [
      {
        id: 'file-stl-002',
        originalName: 'engranaje_planetario_eje.stl',
        storedFileName: 'engranaje_planetario_eje.stl',
        sizeBytes: 684,
        format: 'BINARY',
        triangleCount: 12,
        dimensionsMm: { x: 50, y: 50, z: 18 },
        estimatedVolumeCm3: 45.0,
        version: 1,
        uploadedAt: new Date(Date.now() - 3600000 * 14).toISOString(),
        downloadUrl: '/api/prints/files/3DP-2026-0002/engranaje_planetario_eje.stl',
      },
    ],
    status: 'OBSERVADO',
    observationComment:
      'El espesor de pared en el alma del engranaje es de 0.8mm (mínimo admitido: 1.5mm). Además los dientes tienen caras no conformadas (non-manifold). Favor de reforzar espesor y resubir archivo STL corregido antes del vencimiento del plazo.',
    observedAt: observedNow.toISOString(),
    observationExpiresAt: new Date(observedNow.getTime() + 48 * 3600 * 1000).toISOString(),
    statusHistory: [
      {
        status: 'ENVIADO',
        timestamp: new Date(Date.now() - 3600000 * 14).toISOString(),
        actor: 'Andrea Nicole Tapia Salcedo',
      },
      {
        status: 'EN REVISION',
        timestamp: new Date(Date.now() - 3600000 * 11).toISOString(),
        actor: 'Saul Alexander Linares Franco',
      },
      {
        status: 'OBSERVADO',
        timestamp: observedNow.toISOString(),
        actor: 'Saul Alexander Linares Franco',
        comment:
          'El espesor de pared en el alma del engranaje es de 0.8mm (mínimo admitido: 1.5mm). Se concede plazo de 48 horas para subsanación.',
      },
    ],
    googleSynced: false,
    createdAt: new Date(Date.now() - 3600000 * 14).toISOString(),
    updatedAt: observedNow.toISOString(),
  };

  // Preconfiguración inteligente desde variables de entorno
  const envProvider = (process.env.LABHUB_STORAGE_PROVIDER as CloudStorageProvider) ||
    (process.env.ONEDRIVE_REFRESH_TOKEN ? 'ONEDRIVE' : 'GOOGLE_DRIVE');

  const googleConfig: GoogleWorkspaceConfig & Record<string, any> = {
    enabled: true,
    activeProvider: envProvider,
    appsScriptWebhookUrl: DEFAULT_GOOGLE_WEBHOOK_URL,
    webhookSecret: process.env.GOOGLE_WEBHOOK_SECRET || '',
    driveFolderName: process.env.ONEDRIVE_ROOT_FOLDER || 'LabHub_ST_UPN',
    syncStlFilesToDrive: true,
    syncRecordsToSheets: true,
    syncCalendarAndEmail: true,
    syncDriveLoans: true,
    syncDrivePrints3D: true,
    syncCalendarAdvisories: true,
    syncSheetsDatabase: true,
    persistFullStateInDrive: true,
    generateLoanDocumentsInDrive: true,
    onedrive: {
      tenantId: process.env.ONEDRIVE_TENANT_ID || 'common',
      clientId: process.env.ONEDRIVE_CLIENT_ID || '',
      clientSecret: process.env.ONEDRIVE_CLIENT_SECRET || '',
      refreshToken: process.env.ONEDRIVE_REFRESH_TOKEN || '',
      rootFolderPath: process.env.ONEDRIVE_ROOT_FOLDER || 'LabHub_ST_UPN',
    },
  };

  return {
    labs: DEFAULT_LABORATORIES,
    advisors,
    recurringClasses,
    slotBlocks: [],
    reservations: [],
    advisories: [],
    loans: [sampleLoan],
    prints: [samplePrintQueued],
    teachersCatalog: DEFAULT_TEACHERS_CATALOG,
    googleConfig,
    adminUsers,
    sequences: {
      reservation: 1,
      advisory: 1,
      loan: 2,
      print: 2,
    },
  };
}

export function createDefaultDatabase(): LabHubDatabase {
  return buildInitialDatabase();
}

export function normalizeDatabase(db: LabHubDatabase): LabHubDatabase {
  if (!db.googleConfig) {
    db.googleConfig = {} as GoogleWorkspaceConfig;
  }
  db.googleConfig.enabled = true;
  if (!process.env.VITEST) {
    db.googleConfig.appsScriptWebhookUrl =
      db.googleConfig.appsScriptWebhookUrl || DEFAULT_GOOGLE_WEBHOOK_URL;
  } else {
    if (db.googleConfig.appsScriptWebhookUrl === undefined) {
      db.googleConfig.appsScriptWebhookUrl = DEFAULT_GOOGLE_WEBHOOK_URL;
    }
  }
  if (!db.googleConfig.activeProvider) {
    db.googleConfig.activeProvider = 'GOOGLE_DRIVE';
  }
  const gc = db.googleConfig as any;
  gc.syncDriveLoans = true;
  gc.syncDrivePrints3D = true;
  gc.syncCalendarAdvisories = true;
  gc.syncSheetsDatabase = true;
  if (gc.syncStlFilesToDrive === undefined) gc.syncStlFilesToDrive = true;
  if (gc.syncRecordsToSheets === undefined) gc.syncRecordsToSheets = true;
  if (gc.syncCalendarAndEmail === undefined) gc.syncCalendarAndEmail = true;

  const hasOldFictitiousTeachers =
    Array.isArray(db.teachersCatalog) &&
    db.teachersCatalog.some(
      (t) =>
        t.includes('Carlos Alberto Mendoza Ríos') ||
        t.includes('Elena Patricia Vargas Soto') ||
        t.includes('Marco Antonio Villanueva Castro')
    );
  if (!Array.isArray(db.teachersCatalog) || db.teachersCatalog.length === 0 || hasOldFictitiousTeachers) {
    db.teachersCatalog = DEFAULT_TEACHERS_CATALOG;
  }

  // Normalizar disponibilidad de asesores oficiales si tienen menos de 20 bloques
  const initialAdvisors = buildInitialDatabase().advisors;
  if (!Array.isArray(db.advisors) || db.advisors.length === 0) {
    db.advisors = initialAdvisors;
  } else {
    for (const adv of db.advisors) {
      if (!Array.isArray(adv.weeklyAvailability) || adv.weeklyAvailability.length < 20) {
        const official = initialAdvisors.find((a) => a.id === adv.id);
        if (official) {
          adv.weeklyAvailability = official.weeklyAvailability;
          adv.badgeColor = official.badgeColor;
        }
      }
    }
  }

  if (Array.isArray(db.prints)) {
    const nowMs = Date.now();
    db.prints = db.prints.filter((p) => {
      if ((p.status === 'OBSERVADO' || p.status === 'RECHAZADA') && p.observationExpiresAt) {
        const expMs = new Date(p.observationExpiresAt).getTime();
        if (!Number.isNaN(expMs) && expMs <= nowMs) {
          return false; // Ticket eliminado automáticamente tras vencer las 48h
        }
      }
      return true;
    });
  }

  if (Array.isArray(db.advisories)) {
    for (const adv of db.advisories) {
      if (adv.blockIds && adv.blockIds.length > 0 && adv.date) {
        try {
          adv.calendarEventUrl = buildGoogleCalendarUrl(buildAdvisoryCalendarDetails(adv));
        } catch {}
      }
    }
  }

  if (Array.isArray(db.adminUsers)) {
    const hasMartinUpn = db.adminUsers.some(
      (u) => (u.email || '').toLowerCase() === 'martin.leon@upn.edu.pe' || (u.username || '').toLowerCase() === 'martin.leon@upn.edu.pe'
    );
    const martinUser = db.adminUsers.find(
      (u) => u.id === 'admin-martin' || (u.email || '').toLowerCase() === 'martin.cernaa@gmail.com'
    );
    if (!hasMartinUpn && martinUser) {
      db.adminUsers.push({
        id: 'admin-martin-upn',
        username: 'martin.leon@upn.edu.pe',
        fullName: martinUser.fullName || 'Martín Aarón León Cerna',
        email: 'martin.leon@upn.edu.pe',
        role: 'COORDINADOR',
        advisorId: martinUser.advisorId || 'adv-1',
        passwordHash: martinUser.passwordHash,
      });
    }
  }

  return db;
}

/**
 * Cadena de promesas en memoria como mutex para serializar lecturas y escrituras atómicas.
 */
let dbLockChain: Promise<unknown> = Promise.resolve();

function withDbLock<T>(fn: () => Promise<T>): Promise<T> {
  const nextLock = dbLockChain.then(fn, fn);
  dbLockChain = nextLock.then(
    () => {},
    () => {}
  );
  return nextLock;
}

/**
 * Asegura la existencia de directorios y datos semilla.
 */
function ensureStorageDirectories(): void {
  const dataDir = getDataDirectory();
  const stlDir = getStlUploadsDirectory();
  const dbFile = getDatabaseFilePath();

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(stlDir)) {
    fs.mkdirSync(stlDir, { recursive: true });
  }

  // Generamos los archivos binarios STL semilla de prueba en disco para que puedan descargarse y visualizarse
  const dir1 = path.join(stlDir, '3DP-2026-0001');
  if (!fs.existsSync(dir1)) {
    fs.mkdirSync(dir1, { recursive: true });
  }
  const file1Path = path.join(dir1, 'soporte_gripper_robotico.stl');
  if (!fs.existsSync(file1Path)) {
    fs.writeFileSync(file1Path, createSampleBinaryStlBuffer(40, 40, 25));
  }

  const dir2 = path.join(stlDir, '3DP-2026-0002');
  if (!fs.existsSync(dir2)) {
    fs.mkdirSync(dir2, { recursive: true });
  }
  const file2Path = path.join(dir2, 'engranaje_planetario_eje.stl');
  if (!fs.existsSync(file2Path)) {
    fs.writeFileSync(file2Path, createSampleBinaryStlBuffer(50, 50, 18));
  }

  if (!fs.existsSync(dbFile)) {
    const initialDb = buildInitialDatabase();
    fs.writeFileSync(dbFile, JSON.stringify(initialDb, null, 2), 'utf-8');
  }
}

/**
 * Lectura segura de la base de datos JSON.
 */
async function readDatabaseRaw(): Promise<LabHubDatabase> {
  ensureStorageDirectories();
  const dbFile = getDatabaseFilePath();
  try {
    const raw = fs.readFileSync(dbFile, 'utf-8');
    const parsed = JSON.parse(raw) as LabHubDatabase;
    return normalizeDatabase(parsed);
  } catch {
    const fresh = buildInitialDatabase();
    fs.writeFileSync(dbFile, JSON.stringify(fresh, null, 2), 'utf-8');
    return fresh;
  }
}

/**
 * Escritura atómica mediante archivo temporal.
 */
async function writeDatabaseRaw(db: LabHubDatabase): Promise<void> {
  ensureStorageDirectories();
  const dbFile = getDatabaseFilePath();
  const tempPath = `${dbFile}.${Date.now()}.${Math.random().toString(36).substring(2)}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), 'utf-8');
  try {
    fs.renameSync(tempPath, dbFile);
  } catch (err: any) {
    if (err?.code === 'EPERM' || err?.code === 'EBUSY' || err?.code === 'EEXIST') {
      try {
        fs.copyFileSync(tempPath, dbFile);
        fs.unlinkSync(tempPath);
      } catch {
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf-8');
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // Ignorar limpieza de temp
        }
      }
    } else {
      throw err;
    }
  }
}

// ============================================================================
// API PÚBLICA DEL REPOSITORIO DE BASE DE DATOS
// ============================================================================

let coldStartHydrationPromise: Promise<void> | null = null;
let coldStartHydrationFailed = false;
let cloudPushTimer: ReturnType<typeof setTimeout> | null = null;
let isPullingStateFromCloud = false;
let cloudPullPromise: Promise<boolean> | null = null;

function scheduleBackgroundCloudSnapshotPush(db: LabHubDatabase): void {
  if (process.env.VITEST) return;
  if (!db.googleConfig?.enabled || db.googleConfig.persistFullStateInDrive === false) {
    return;
  }

  // Protección anti-pérdida de datos:
  // No permitir que un push automático en segundo plano sobrescriba la nube si la base de datos
  // local está completamente vacía de actividad y la hidratación inicial falló por red.
  const isActivityEmpty =
    (!db.advisories || db.advisories.length === 0) &&
    (!db.reservations || db.reservations.length === 0) &&
    (!db.slotBlocks || db.slotBlocks.length === 0);

  if (isActivityEmpty && coldStartHydrationFailed) {
    console.warn(
      '[CloudStorage] Push automático en segundo plano omitido: la base de datos local está completamente vacía de actividad y la hidratación inicial falló por red.'
    );
    return;
  }

  if (cloudPushTimer) {
    clearTimeout(cloudPushTimer);
  }
  cloudPushTimer = setTimeout(() => {
    import('@/lib/google/bridge')
      .then(({ googleBridge }) => googleBridge.pushStateOnly?.())
      .catch(() => {});
  }, 800);
}

function tryColdStartCloudHydration(): Promise<void> {
  if (process.env.VITEST) return Promise.resolve();
  if (coldStartHydrationPromise) {
    return coldStartHydrationPromise;
  }

  coldStartHydrationPromise = (async () => {
    try {
      const localDb = await readDatabaseRaw();
      const provider = localDb.googleConfig?.activeProvider || 'GOOGLE_DRIVE';

      if (provider === 'ONEDRIVE' && localDb.googleConfig?.onedrive?.refreshToken) {
        try {
          const { oneDriveClient } = await import('@/lib/cloud/onedrive-client');
          const remoteState = await oneDriveClient.loadDatabaseSnapshot(localDb.googleConfig.onedrive);
          if (remoteState) {
            await dbRepository.replaceDatabaseState(remoteState);
            coldStartHydrationFailed = false;
          }
        } catch (e) {
          coldStartHydrationFailed = true;
          console.warn('[ColdStart] Error al hidratar base de datos desde Microsoft OneDrive:', e);
        }
        return;
      }

      // Proveedor GOOGLE_DRIVE (por defecto)
      const webhookUrl = localDb.googleConfig?.appsScriptWebhookUrl || DEFAULT_GOOGLE_WEBHOOK_URL;
      if (webhookUrl) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout para Apps Script cold start
        try {
          const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'GET_STATE',
              webhookSecret: localDb.googleConfig?.webhookSecret || '',
              payload: {},
            }),
            signal: controller.signal,
          });

          if (res.ok) {
            const json = (await res.json()) as { ok?: boolean; state?: any; error?: string };
            if (json && json.ok && json.state) {
              coldStartHydrationFailed = false;
              await dbRepository.replaceDatabaseState(json.state);
            } else if (json && json.ok === false) {
              coldStartHydrationFailed = true;
              console.warn('[ColdStart] Google Apps Script reportó error en GET_STATE:', json.error);
            }
          } else {
            coldStartHydrationFailed = true;
            console.warn(`[ColdStart] Webhook respondió con status HTTP ${res.status}`);
          }
        } catch (e) {
          coldStartHydrationFailed = true;
          console.warn('[ColdStart] Error de red al hidratar base de datos desde Google Drive:', e);
        } finally {
          clearTimeout(timeoutId);
        }
      }
    } catch (e) {
      coldStartHydrationFailed = true;
      console.warn('[ColdStart] Error general durante arranque en frío:', e);
    } finally {
      if (coldStartHydrationFailed) {
        coldStartHydrationPromise = null;
      }
    }
  })();

  return coldStartHydrationPromise;
}

export const dbRepository = {
  getDatabase: async (): Promise<LabHubDatabase> => {
    await tryColdStartCloudHydration();
    let db = await withDbLock(async () => {
      const current = await readDatabaseRaw();
      if (Array.isArray(current.advisories)) {
        for (const adv of current.advisories) {
          if (adv.blockIds && adv.blockIds.length > 0 && adv.date) {
            try {
              adv.calendarEventUrl = buildGoogleCalendarUrl(buildAdvisoryCalendarDetails(adv));
            } catch {}
          }
        }
      }
      return current;
    });

    if (isPullingStateFromCloud) {
      return db;
    }

    // Comprobar si la base de datos leída está vacía de actividad en producción
    const isActivityEmpty =
      !process.env.VITEST &&
      (!db.advisories || db.advisories.length === 0) &&
      (!db.reservations || db.reservations.length === 0) &&
      (!db.slotBlocks || db.slotBlocks.length === 0);

    if (isActivityEmpty) {
      if (!cloudPullPromise) {
        cloudPullPromise = (async () => {
          isPullingStateFromCloud = true;
          try {
            const { googleBridge } = await import('@/lib/google/bridge');
            const pullRes = await googleBridge.pullStateFromCloud();
            return Boolean(pullRes && pullRes.ok && pullRes.restored);
          } catch (err) {
            console.warn('[ColdStart] Error al intentar recuperación directa de estado desde la nube:', err);
            return false;
          } finally {
            isPullingStateFromCloud = false;
          }
        })();
      }

      const restored = await cloudPullPromise;
      cloudPullPromise = null;

      if (restored) {
        db = await withDbLock(async () => {
          const refreshed = await readDatabaseRaw();
          if (Array.isArray(refreshed.advisories)) {
            for (const adv of refreshed.advisories) {
              if (adv.blockIds && adv.blockIds.length > 0 && adv.date) {
                try {
                  adv.calendarEventUrl = buildGoogleCalendarUrl(buildAdvisoryCalendarDetails(adv));
                } catch {}
              }
            }
          }
          return refreshed;
        });
      }
    }

    return db;
  },

  updateDatabase: async <T>(
    mutator: (db: LabHubDatabase) => Promise<T> | T,
    options?: UpdateDbOptions
  ): Promise<T> => {
    await tryColdStartCloudHydration();
    return withDbLock(async () => {
      const db = await readDatabaseRaw();
      const result = await mutator(db);
      await writeDatabaseRaw(db);
      if (!options?.skipCloudStatePush) {
        scheduleBackgroundCloudSnapshotPush(db);
      }
      return result;
    });
  },

  /**
   * Reemplaza e hidrata de forma atómica el estado de la base de datos local
   * con un snapshot íntegro descargado desde Google Drive o Microsoft OneDrive.
   */
  replaceDatabaseState: async (remoteDb: Partial<LabHubDatabase>): Promise<LabHubDatabase> => {
    return withDbLock(async () => {
      const current = await readDatabaseRaw();
      const merged: LabHubDatabase = {
        labs: Array.isArray(remoteDb.labs) && remoteDb.labs.length > 0 ? remoteDb.labs : current.labs,
        advisors: (() => {
          const list = Array.isArray(remoteDb.advisors) && remoteDb.advisors.length > 0 ? remoteDb.advisors : current.advisors;
          const initialAdvisors = buildInitialDatabase().advisors;
          for (const adv of list) {
            if (!Array.isArray(adv.weeklyAvailability) || adv.weeklyAvailability.length < 20) {
              const official = initialAdvisors.find((a) => a.id === adv.id);
              if (official) {
                adv.weeklyAvailability = official.weeklyAvailability;
                adv.badgeColor = official.badgeColor;
              }
            }
          }
          return list;
        })(),
        recurringClasses:
          Array.isArray(remoteDb.recurringClasses) && remoteDb.recurringClasses.length >= current.recurringClasses.length
            ? remoteDb.recurringClasses
            : current.recurringClasses,
        slotBlocks: Array.isArray(remoteDb.slotBlocks) ? remoteDb.slotBlocks : current.slotBlocks,
        reservations: Array.isArray(remoteDb.reservations) ? remoteDb.reservations : current.reservations,
        advisories: Array.isArray(remoteDb.advisories) ? remoteDb.advisories : current.advisories,
        loans: Array.isArray(remoteDb.loans) ? remoteDb.loans : current.loans,
        prints: Array.isArray(remoteDb.prints) ? remoteDb.prints : current.prints,
        teachersCatalog: (() => {
          if (!Array.isArray(remoteDb.teachersCatalog) || remoteDb.teachersCatalog.length === 0) {
            return current.teachersCatalog && current.teachersCatalog.length > 0
              ? current.teachersCatalog
              : DEFAULT_TEACHERS_CATALOG;
          }
          const hasOldFictitious = remoteDb.teachersCatalog.some((t) =>
            t.includes('Carlos Alberto Mendoza Ríos') ||
            t.includes('Elena Patricia Vargas Soto') ||
            t.includes('Roberto Javier Paredes Luna') ||
            t.includes('Marco Antonio Villanueva Castro')
          );
          const hasOfficialTeachers = DEFAULT_TEACHERS_CATALOG.every((t) =>
            remoteDb.teachersCatalog!.includes(t)
          );
          if (hasOldFictitious || !hasOfficialTeachers) {
            return DEFAULT_TEACHERS_CATALOG;
          }
          return remoteDb.teachersCatalog;
        })(),
        googleConfig: remoteDb.googleConfig ? { ...current.googleConfig, ...remoteDb.googleConfig } : current.googleConfig,
        adminUsers: (() => {
          const list = Array.isArray(remoteDb.adminUsers) && remoteDb.adminUsers.length > 0 ? [...remoteDb.adminUsers] : [...current.adminUsers];
          const hasMartinUpn = list.some(
            (u) => (u.email || '').toLowerCase() === 'martin.leon@upn.edu.pe' || (u.username || '').toLowerCase() === 'martin.leon@upn.edu.pe'
          );
          const martinUser = list.find(
            (u) => u.id === 'admin-martin' || (u.email || '').toLowerCase() === 'martin.cernaa@gmail.com'
          );
          if (!hasMartinUpn && martinUser) {
            list.push({
              id: 'admin-martin-upn',
              username: 'martin.leon@upn.edu.pe',
              fullName: martinUser.fullName || 'Martín Aarón León Cerna',
              email: 'martin.leon@upn.edu.pe',
              role: 'COORDINADOR',
              advisorId: martinUser.advisorId || 'adv-1',
              passwordHash: martinUser.passwordHash,
            });
          }
          return list;
        })(),
        sequences: remoteDb.sequences || current.sequences,
      };

      await writeDatabaseRaw(merged);
      return merged;
    });
  },

  // Generadores de códigos secuenciales
  getNextReservationCode: async (): Promise<string> => {
    return withDbLock(async () => {
      const db = await readDatabaseRaw();
      const seq = db.sequences.reservation;
      db.sequences.reservation += 1;
      await writeDatabaseRaw(db);
      return `RES-2026-${String(seq).padStart(4, '0')}`;
    });
  },

  getNextAdvisoryCode: async (): Promise<string> => {
    return withDbLock(async () => {
      const db = await readDatabaseRaw();
      const seq = db.sequences.advisory;
      db.sequences.advisory += 1;
      await writeDatabaseRaw(db);
      return `ASE-2026-${String(seq).padStart(4, '0')}`;
    });
  },

  getNextLoanCode: async (): Promise<string> => {
    return withDbLock(async () => {
      const db = await readDatabaseRaw();
      const seq = db.sequences.loan;
      db.sequences.loan += 1;
      await writeDatabaseRaw(db);
      return `EQP-2026-${String(seq).padStart(4, '0')}`;
    });
  },

  getNextPrintCode: async (): Promise<string> => {
    return withDbLock(async () => {
      const db = await readDatabaseRaw();
      const seq = db.sequences.print;
      db.sequences.print += 1;
      await writeDatabaseRaw(db);
      return `3DP-2026-${String(seq).padStart(4, '0')}`;
    });
  },

  // Manejo de archivos STL en disco
  getStlUploadsDirectory: (): string => {
    ensureStorageDirectories();
    return getStlUploadsDirectory();
  },

  saveStlFile: async (
    code: string,
    fileName: string,
    buffer: Buffer
  ): Promise<{ storedFileName: string; filePath: string }> => {
    ensureStorageDirectories();
    const stlDir = getStlUploadsDirectory();
    const sanitizedCode = code.replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedFileName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const folder = path.join(stlDir, sanitizedCode);
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
    const finalPath = path.join(folder, sanitizedFileName);
    fs.writeFileSync(finalPath, buffer);
    return {
      storedFileName: sanitizedFileName,
      filePath: finalPath,
    };
  },

  readStlFile: (code: string, fileName: string): Buffer | null => {
    ensureStorageDirectories();
    const stlDir = getStlUploadsDirectory();
    const sanitizedCode = code.replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedFileName = path.basename(fileName);
    const filePath = path.join(stlDir, sanitizedCode, sanitizedFileName);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath);
  },
};

export const _storageTesting = {
  tryColdStartCloudHydration,
  scheduleBackgroundCloudSnapshotPush,
  getColdStartHydrationPromise: () => coldStartHydrationPromise,
  resetColdStartHydrationForTest: () => {
    coldStartHydrationPromise = null;
    coldStartHydrationFailed = false;
    cloudPullPromise = null;
    isPullingStateFromCloud = false;
  },
  setColdStartHydrationFailed: (val: boolean) => {
    coldStartHydrationFailed = val;
  },
  isColdStartHydrationFailed: () => coldStartHydrationFailed,
};
