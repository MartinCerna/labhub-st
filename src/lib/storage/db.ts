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
      badgeColor: '#d97706',
      active: true,
      weeklyAvailability: [
        { dayOfWeek: 1, blockId: 'B2', labId: 'automatizacion' },
        { dayOfWeek: 1, blockId: 'B3', labId: 'automatizacion' },
        { dayOfWeek: 3, blockId: 'B5', labId: 'automatizacion' },
        { dayOfWeek: 3, blockId: 'B6', labId: 'automatizacion' },
        { dayOfWeek: 5, blockId: 'B3', labId: 'automatizacion' },
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
      badgeColor: '#0284c7',
      active: true,
      weeklyAvailability: [
        { dayOfWeek: 2, blockId: 'B3', labId: 'electronica' },
        { dayOfWeek: 2, blockId: 'B4', labId: 'electronica' },
        { dayOfWeek: 4, blockId: 'B5', labId: 'electronica' },
        { dayOfWeek: 4, blockId: 'B6', labId: 'electronica' },
        { dayOfWeek: 6, blockId: 'B2', labId: 'electronica' },
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
      badgeColor: '#059669',
      active: true,
      weeklyAvailability: [
        { dayOfWeek: 3, blockId: 'B2', labId: 'mecatronica' },
        { dayOfWeek: 3, blockId: 'B3', labId: 'mecatronica' },
        { dayOfWeek: 5, blockId: 'B5', labId: 'mecatronica' },
        { dayOfWeek: 5, blockId: 'B6', labId: 'mecatronica' },
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
      badgeColor: '#7c3aed',
      active: true,
      weeklyAvailability: [
        { dayOfWeek: 1, blockId: 'B6', labId: 'mecatronica' },
        { dayOfWeek: 1, blockId: 'B7', labId: 'mecatronica' },
        { dayOfWeek: 4, blockId: 'B3', labId: 'automatizacion' },
        { dayOfWeek: 4, blockId: 'B4', labId: 'automatizacion' },
      ],
    },
  ];

  const recurringClasses: RecurringClassSlot[] = [
    {
      id: 'class-aut-1',
      labId: 'automatizacion',
      dayOfWeek: 2,
      blockId: 'B1',
      courseName: 'Sistemas de Control Automático I',
      teacherName: 'Ing. Carlos Alberto Mendoza Ríos',
      nrc: '4512',
    },
    {
      id: 'class-aut-2',
      labId: 'automatizacion',
      dayOfWeek: 4,
      blockId: 'B7',
      courseName: 'Redes Industriales y SCADA',
      teacherName: 'Mg. Roberto Javier Paredes Luna',
      nrc: '4518',
    },
    {
      id: 'class-ele-1',
      labId: 'electronica',
      dayOfWeek: 1,
      blockId: 'B4',
      courseName: 'Circuitos Electrónicos II',
      teacherName: 'Dra. Elena Patricia Vargas Soto',
      nrc: '3205',
    },
    {
      id: 'class-ele-2',
      labId: 'electronica',
      dayOfWeek: 3,
      blockId: 'B8',
      courseName: 'Sistemas Digitales Embebidos',
      teacherName: 'Ing. Luis Fernando Quispe Huamán',
      nrc: '3210',
    },
    {
      id: 'class-mec-1',
      labId: 'mecatronica',
      dayOfWeek: 2,
      blockId: 'B5',
      courseName: 'Robótica Industrial y Móvil',
      teacherName: 'Dr. Marco Antonio Villanueva Castro',
      nrc: '5840',
    },
    {
      id: 'class-mec-2',
      labId: 'mecatronica',
      dayOfWeek: 5,
      blockId: 'B2',
      courseName: 'Manufactura Asistida por Computadora (CAM)',
      teacherName: 'Mg. Diana Carolina Salazar Torres',
      nrc: '5844',
    },
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
    calendarEventUrl:
      'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Asesoria+LabHub+UPN+-+ASE-2026-0001',
    icsDownloadUrl: `/api/advisories/${sampleAdvisoryId}/ics`,
    calendarNotified: false,
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
  };

  const sampleSignaturePng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJYAAAA8CAYAAACF0L/3AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAH1SURBVHhe7dsxattAFIXh/c89Z20JdpmN4AowKewZ...firma_simulada';

  const sampleLoan: EquipmentLoan = {
    id: 'loan-sample-001',
    code: 'EQP-2026-0001',
    labId: 'electronica',
    teacherName: 'Dra. Elena Patricia Vargas Soto',
    cycle: 'Ciclo VI',
    courseProgram: 'Ingeniería Electrónica - Circuitos II',
    attendedByAdvisorId: 'adv-2',
    attendedByName: 'Juan Daniel Gomez Montes',
    items: [
      {
        quantity: 1,
        equipmentName: 'Osciloscopio Digital Rigol 100MHz 2 Canales',
        upnCode: 'UPN-PAT-OSC-042',
      },
      {
        quantity: 1,
        equipmentName: 'Generador de Funciones Arbitrarias GW Instek',
        upnCode: 'UPN-PAT-GEN-019',
      },
      {
        quantity: 2,
        equipmentName: 'Sondas Pasivas 10X con Pinza BNC',
        upnCode: 'UPN-ACC-SND-088',
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
    teacherName: 'Dr. Marco Antonio Villanueva Castro',
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
    teacherName: 'Mg. Diana Carolina Salazar Torres',
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
    observationExpiresAt: new Date(observedNow.getTime() + 72 * 3600 * 1000).toISOString(),
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
          'El espesor de pared en el alma del engranaje es de 0.8mm (mínimo admitido: 1.5mm). Se concede plazo de 72 horas para subsanación.',
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
  fs.renameSync(tempPath, dbFile);
}

// ============================================================================
// API PÚBLICA DEL REPOSITORIO DE BASE DE DATOS
// ============================================================================

let coldStartHydrated = false;
let cloudPushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleBackgroundCloudSnapshotPush(db: LabHubDatabase): void {
  if (process.env.VITEST) return;
  if (!db.googleConfig?.enabled || db.googleConfig.persistFullStateInDrive === false) {
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

async function tryColdStartCloudHydration(): Promise<void> {
  if (coldStartHydrated || process.env.VITEST) return;
  coldStartHydrated = true;

  const hasEnvCloud =
    Boolean(process.env.GOOGLE_APPS_SCRIPT_URL) ||
    Boolean(process.env.ONEDRIVE_REFRESH_TOKEN);
  if (!hasEnvCloud) return;

  try {
    const { googleBridge } = await import('@/lib/google/bridge');
    await googleBridge.pullStateFromCloud();
  } catch {
    // Continuar con estado local si la nube aún no tiene snapshot previo
  }
}

export const dbRepository = {
  getDatabase: async (): Promise<LabHubDatabase> => {
    await tryColdStartCloudHydration();
    return withDbLock(async () => {
      return readDatabaseRaw();
    });
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
        advisors: Array.isArray(remoteDb.advisors) && remoteDb.advisors.length > 0 ? remoteDb.advisors : current.advisors,
        recurringClasses: Array.isArray(remoteDb.recurringClasses) ? remoteDb.recurringClasses : current.recurringClasses,
        slotBlocks: Array.isArray(remoteDb.slotBlocks) ? remoteDb.slotBlocks : current.slotBlocks,
        reservations: Array.isArray(remoteDb.reservations) ? remoteDb.reservations : current.reservations,
        advisories: Array.isArray(remoteDb.advisories) ? remoteDb.advisories : current.advisories,
        loans: Array.isArray(remoteDb.loans) ? remoteDb.loans : current.loans,
        prints: Array.isArray(remoteDb.prints) ? remoteDb.prints : current.prints,
        teachersCatalog: Array.isArray(remoteDb.teachersCatalog) ? remoteDb.teachersCatalog : current.teachersCatalog,
        googleConfig: remoteDb.googleConfig ? { ...current.googleConfig, ...remoteDb.googleConfig } : current.googleConfig,
        adminUsers: Array.isArray(remoteDb.adminUsers) && remoteDb.adminUsers.length > 0 ? remoteDb.adminUsers : current.adminUsers,
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
