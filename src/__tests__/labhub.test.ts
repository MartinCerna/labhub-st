import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(buf.byteLength);
  const view = new Uint8Array(ab);
  view.set(buf);
  return ab;
}

// Domain imports
import {
  TIME_BLOCKS,
  TIME_BLOCK_MAP,
  DAYS_OF_WEEK,
  DEFAULT_LABORATORIES,
  DEFAULT_TEACHERS_CATALOG,
  getWeekDaysForOffset,
  formatLocalIsoDate,
  OBSERVATION_WINDOW_HOURS,
} from '@/constants/schedule';
import {
  validateStlFileName,
  parseStlBuffer,
  ParsedStlGeometry,
} from '@/lib/stl-parser';
import {
  generateIcsCalendar,
  buildGoogleCalendarUrl,
  buildAdvisoryCalendarDetails,
  buildReservationCalendarDetails,
  CalendarEventDetails,
} from '@/lib/calendar/ics';
import {
  createSessionToken,
  verifySessionToken,
  buildSessionCookieValue,
  buildClearSessionCookieValue,
  parseCookiesFromHeader,
  AUTH_COOKIE_NAME,
} from '@/lib/auth';
import {
  dbRepository,
  createSampleBinaryStlBuffer,
  LabHubDatabase,
} from '@/lib/storage/db';
import { AdminSessionUser, AdvisoryRequest, LabReservation } from '@/types/labhub';

// Route Handlers
import { GET as getCatalog } from '@/app/api/catalog/route';
import { POST as postAdvisory } from '@/app/api/advisories/route';
import { GET as getLoans, POST as postLoan, PATCH as patchLoan } from '@/app/api/loans/route';
import { GET as getPrints, POST as postPrint, PATCH as patchPrint } from '@/app/api/prints/route';

describe('LabHub ST — Suite Integral de Pruebas de Calidad (QA)', () => {
  // Snapshot para restaurar db.json al finalizar y no alterar los datos demo
  const dbFilePath = path.join(process.cwd(), 'data', 'db.json');
  const uploadsDir = path.join(process.cwd(), 'data', 'uploads', 'stl');
  let originalDbRaw: string | null = null;
  let testCreatedPrintCodes: string[] = [];

  beforeAll(async () => {
    // Asegurar que la base de datos se inicialice con la semilla
    await dbRepository.getDatabase();
    if (fs.existsSync(dbFilePath)) {
      originalDbRaw = fs.readFileSync(dbFilePath, 'utf-8');
    }
  });

  afterAll(async () => {
    // Restaurar el estado original de db.json
    if (originalDbRaw !== null) {
      fs.writeFileSync(dbFilePath, originalDbRaw, 'utf-8');
    }

    // Limpiar carpetas STL de prueba creadas durante los tests
    for (const code of testCreatedPrintCodes) {
      const folderPath = path.join(uploadsDir, code);
      if (fs.existsSync(folderPath)) {
        try {
          fs.rmSync(folderPath, { recursive: true, force: true });
        } catch {
          // Ignorar errores al limpiar
        }
      }
    }
  });

  // ==========================================================================
  // 1. HORARIOS OFICIALES Y MATRIZ SEMANAL
  // ==========================================================================
  describe('1. Horarios Oficiales y Matriz Semanal (Schedule)', () => {
    it('debe contener exactamente los 9 bloques horarios oficiales con rangos y orden correcto', () => {
      expect(TIME_BLOCKS).toHaveLength(9);

      const expectedBlocks = [
        { id: 'B1', startTime: '07:30', endTime: '09:00', label: '07:30 - 09:00', order: 1 },
        { id: 'B2', startTime: '09:10', endTime: '10:40', label: '09:10 - 10:40', order: 2 },
        { id: 'B3', startTime: '10:50', endTime: '12:20', label: '10:50 - 12:20', order: 3 },
        { id: 'B4', startTime: '12:30', endTime: '14:00', label: '12:30 - 14:00', order: 4 },
        { id: 'B5', startTime: '14:30', endTime: '16:00', label: '14:30 - 16:00', order: 5 },
        { id: 'B6', startTime: '16:10', endTime: '17:40', label: '16:10 - 17:40', order: 6 },
        { id: 'B7', startTime: '17:50', endTime: '19:20', label: '17:50 - 19:20', order: 7 },
        { id: 'B8', startTime: '19:30', endTime: '21:00', label: '19:30 - 21:00', order: 8 },
        { id: 'B9', startTime: '21:10', endTime: '22:40', label: '21:10 - 22:40', order: 9 },
      ];

      expectedBlocks.forEach((expected, idx) => {
        const actual = TIME_BLOCKS[idx];
        expect(actual.id).toBe(expected.id);
        expect(actual.startTime).toBe(expected.startTime);
        expect(actual.endTime).toBe(expected.endTime);
        expect(actual.label).toBe(expected.label);
        expect(actual.order).toBe(expected.order);
      });

      // Validar mapa indexado TIME_BLOCK_MAP
      expect(Object.keys(TIME_BLOCK_MAP)).toHaveLength(9);
      expect(TIME_BLOCK_MAP.B1.startTime).toBe('07:30');
      expect(TIME_BLOCK_MAP.B9.endTime).toBe('22:40');
    });

    it('debe definir 6 días lectivos por semana (Lunes a Sábado)', () => {
      expect(DAYS_OF_WEEK).toHaveLength(6);
      expect(DAYS_OF_WEEK.map((d) => d.id)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(DAYS_OF_WEEK[0].name).toBe('Lunes');
      expect(DAYS_OF_WEEK[5].name).toBe('Sábado');
    });

    it('debe generar 2 semanas (offset 0 y offset 1) separadas exactamente por 7 días', () => {
      const week0 = getWeekDaysForOffset(0);
      const week1 = getWeekDaysForOffset(1);

      expect(week0.days).toHaveLength(6);
      expect(week1.days).toHaveLength(6);

      expect(week0.weekStartDate).toBe(week0.days[0].date);
      expect(week0.weekEndDate).toBe(week0.days[5].date);

      expect(week1.weekStartDate).toBe(week1.days[0].date);
      expect(week1.weekEndDate).toBe(week1.days[5].date);

      // Cada día de la semana 1 debe ser exactamente 7 días posterior al de la semana 0
      for (let i = 0; i < 6; i++) {
        expect(week0.days[i].dayOfWeek).toBe(i + 1);
        expect(week1.days[i].dayOfWeek).toBe(i + 1);

        const d0 = new Date(`${week0.days[i].date}T12:00:00Z`).getTime();
        const d1 = new Date(`${week1.days[i].date}T12:00:00Z`).getTime();
        const diffDays = Math.round((d1 - d0) / (1000 * 60 * 60 * 24));
        expect(diffDays).toBe(7);
      }
    });

    it('debe calcular correctamente fechas con fecha de referencia fija y comportamiento en Domingo', () => {
      // Miércoles 10 de Junio de 2026
      const fixedWednesday = new Date(2026, 5, 10);
      const resWed = getWeekDaysForOffset(0, fixedWednesday);
      expect(resWed.weekStartDate).toBe('2026-06-08'); // Lunes anterior
      expect(resWed.weekEndDate).toBe('2026-06-13');   // Sábado

      // Domingo 14 de Junio de 2026 (por convenio universitario apunta a la semana entrante)
      const fixedSunday = new Date(2026, 5, 14);
      const resSun = getWeekDaysForOffset(0, fixedSunday);
      expect(resSun.weekStartDate).toBe('2026-06-15'); // Lunes siguiente
      expect(resSun.weekEndDate).toBe('2026-06-20');   // Sábado
    });

    it('debe formatear fechas locales correctamente con formatLocalIsoDate', () => {
      const date = new Date(2026, 0, 5); // 5 de Enero de 2026
      expect(formatLocalIsoDate(date)).toBe('2026-01-05');
      const dateEnd = new Date(2026, 11, 31); // 31 de Diciembre de 2026
      expect(formatLocalIsoDate(dateEnd)).toBe('2026-12-31');
    });

    it('debe tener ventana de observación de 72 horas definida en constantes', () => {
      expect(OBSERVATION_WINDOW_HOURS).toBe(72);
    });
  });

  // ==========================================================================
  // 2. PARSER Y VALIDADOR DE ARCHIVOS .STL
  // ==========================================================================
  describe('2. Parser y Validador STL (stl-parser)', () => {
    it('validateStlFileName debe aceptar exclusivamente extensiones .stl sin distinción de mayúsculas', () => {
      expect(validateStlFileName('modelo_pieza.stl')).toBe(true);
      expect(validateStlFileName('GRIPPER.STL')).toBe(true);
      expect(validateStlFileName('soporte-motor.StL')).toBe(true);
      expect(validateStlFileName('  espacios_nombre.stl  ')).toBe(true);

      // Casos rechazados
      expect(validateStlFileName('modelo.obj')).toBe(false);
      expect(validateStlFileName('codigo.gcode')).toBe(false);
      expect(validateStlFileName('archivo.exe')).toBe(false);
      expect(validateStlFileName('stl.txt')).toBe(false);
      expect(validateStlFileName('')).toBe(false);
      expect(validateStlFileName(null as any)).toBe(false);
      expect(validateStlFileName(undefined as any)).toBe(false);
      expect(validateStlFileName(12345 as any)).toBe(false);
    });

    it('parseStlBuffer debe parsear correctamente un archivo STL en formato ASCII', () => {
      const asciiCubeStl = `solid test_cube
  facet normal 0.0 0.0 1.0
    outer loop
      vertex 0.0 0.0 10.0
      vertex 20.0 0.0 10.0
      vertex 20.0 15.0 10.0
    endloop
  endfacet
  facet normal 0.0 0.0 1.0
    outer loop
      vertex 0.0 0.0 10.0
      vertex 20.0 15.0 10.0
      vertex 0.0 15.0 10.0
    endloop
  endfacet
endsolid test_cube`;

      const buffer = Buffer.from(asciiCubeStl, 'utf-8');
      const arrayBuffer = toArrayBuffer(buffer);

      const parsed: ParsedStlGeometry = parseStlBuffer(arrayBuffer);
      expect(parsed.format).toBe('ASCII');
      expect(parsed.triangleCount).toBe(2);
      expect(parsed.dimensionsMm.x).toBe(20);
      expect(parsed.dimensionsMm.y).toBe(15);
      expect(parsed.dimensionsMm.z).toBe(0);
      expect(parsed.previewTriangles.length).toBe(18); // 2 triángulos * 9 coordenadas
    });

    it('parseStlBuffer debe parsear correctamente un archivo STL Binario de 1 triángulo', () => {
      const triangleCount = 1;
      const buffer = Buffer.alloc(84 + triangleCount * 50);
      buffer.write('Custom Binary STL Header', 0, 'utf-8');
      buffer.writeUInt32LE(triangleCount, 80);

      const offset = 84;
      // Normal (0, 0, 1)
      buffer.writeFloatLE(0, offset);
      buffer.writeFloatLE(0, offset + 4);
      buffer.writeFloatLE(1, offset + 8);
      // Vértice 1 (0, 0, 0)
      buffer.writeFloatLE(0, offset + 12);
      buffer.writeFloatLE(0, offset + 16);
      buffer.writeFloatLE(0, offset + 20);
      // Vértice 2 (30, 0, 0)
      buffer.writeFloatLE(30, offset + 24);
      buffer.writeFloatLE(0, offset + 28);
      buffer.writeFloatLE(0, offset + 32);
      // Vértice 3 (0, 45, 12)
      buffer.writeFloatLE(0, offset + 36);
      buffer.writeFloatLE(45, offset + 40);
      buffer.writeFloatLE(12, offset + 44);
      // Atributo
      buffer.writeUInt16LE(0, offset + 48);

      const arrayBuffer = toArrayBuffer(buffer);
      const parsed = parseStlBuffer(arrayBuffer);

      expect(parsed.format).toBe('BINARY');
      expect(parsed.triangleCount).toBe(1);
      expect(parsed.dimensionsMm.x).toBe(30);
      expect(parsed.dimensionsMm.y).toBe(45);
      expect(parsed.dimensionsMm.z).toBe(12);
      expect(parsed.previewTriangles.length).toBe(9);
    });

    it('parseStlBuffer debe parsear prisma 3D binario generado por createSampleBinaryStlBuffer', () => {
      const sampleBuf = createSampleBinaryStlBuffer(50, 40, 20);
      const arrayBuffer = toArrayBuffer(sampleBuf);

      const parsed = parseStlBuffer(arrayBuffer);
      expect(parsed.format).toBe('BINARY');
      expect(parsed.triangleCount).toBe(12);
      expect(parsed.dimensionsMm.x).toBe(50);
      expect(parsed.dimensionsMm.y).toBe(40);
      expect(parsed.dimensionsMm.z).toBe(20);
      // Prisma de 50 x 40 x 20 mm = 40,000 mm³ = 40.0 cm³
      expect(parsed.estimatedVolumeCm3).toBe(40.0);
    });

    it('parseStlBuffer debe rechazar buffers corruptos o no reconocibles', () => {
      // Buffer vacío
      expect(() => parseStlBuffer(new ArrayBuffer(0))).toThrow('El archivo .stl está vacío o corrupto.');

      // Buffer muy pequeño (< 15 bytes)
      expect(() => parseStlBuffer(new ArrayBuffer(10))).toThrow('El archivo .stl está vacío o corrupto.');

      // Buffer aleatorio que no cumple formato binario ni ASCII
      const garbage = Buffer.alloc(120, 0xaa);
      const garbageArrayBuffer = toArrayBuffer(garbage);
      expect(() => parseStlBuffer(garbageArrayBuffer)).toThrow('El contenido del archivo no corresponde a una malla .stl válida.');

      // Buffer ASCII con "solid" pero sin vértices
      const invalidAscii = Buffer.from('solid solo_nombre_sin_geometria\nendsolid', 'utf-8');
      const invalidAsciiArrayBuffer = toArrayBuffer(invalidAscii);
      expect(() => parseStlBuffer(invalidAsciiArrayBuffer)).toThrow('El contenido del archivo no corresponde a una malla .stl válida.');
    });
  });

  // ==========================================================================
  // 3. CALENDARIO RFC 5545 E INTEGRACIÓN CON GOOGLE CALENDAR
  // ==========================================================================
  describe('3. Calendario RFC 5545 y Google Calendar (ics)', () => {
    const sampleEventDetails: CalendarEventDetails = {
      uid: 'test-event-uuid-001',
      title: 'Asesoría PLC Siemens S7',
      description: 'Sesión práctica de configuración Profinet con estación FESTO.\nGrupo de robótica.',
      location: 'Laboratorio de Automatización - Pabellón B Piso 2',
      startDateIso: '2026-06-15',
      startBlockId: 'B1', // 07:30 - 09:00
      endBlockId: 'B2',   // 09:10 - 10:40
      organizerEmail: 'laboratorios.ingenieria@upn.pe',
      attendeeEmail: 'jose.morales@upn.pe',
      attendeeName: 'Ing. José Luis Morales',
    };

    it('generateIcsCalendar debe producir archivo iCalendar estándar RFC 5545 con zona America/Lima', () => {
      const ics = generateIcsCalendar(sampleEventDetails);

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('VERSION:2.0');
      expect(ics).toContain('PRODID:-//UPN//LabHub ST Engineering Labs//ES');
      expect(ics).toContain('CALSCALE:GREGORIAN');
      expect(ics).toContain('METHOD:REQUEST');

      // VTIMEZONE con zona America/Lima y offset PET -0500
      expect(ics).toContain('BEGIN:VTIMEZONE');
      expect(ics).toContain('TZID:America/Lima');
      expect(ics).toContain('TZOFFSETFROM:-0500');
      expect(ics).toContain('TZOFFSETTO:-0500');
      expect(ics).toContain('TZNAME:PET');
      expect(ics).toContain('END:VTIMEZONE');

      // VEVENT
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('UID:test-event-uuid-001@labhub.upn.pe');
      expect(ics).toContain('STATUS:CONFIRMED');

      // 07:30 Lima (UTC-5) -> 12:30 UTC
      expect(ics).toContain('DTSTART:20260615T123000Z');
      // 10:40 Lima (UTC-5) -> 15:40 UTC
      expect(ics).toContain('DTEND:20260615T154000Z');

      // SUMMARY y DESCRIPTION con escape de caracteres
      expect(ics).toContain('SUMMARY:Asesoría PLC Siemens S7');
      expect(ics).toContain('DESCRIPTION:Sesión práctica de configuración Profinet con estación FESTO.\\nGrupo de robótica.');
      expect(ics).toContain('LOCATION:Laboratorio de Automatización - Pabellón B Piso 2');

      // ORGANIZER y ATTENDEE del asesor
      expect(ics).toContain('ORGANIZER;CN="LabHub UPN":mailto:laboratorios.ingenieria@upn.pe');
      expect(ics).toContain('ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=TRUE;CN="Ing. José Luis Morales":mailto:jose.morales@upn.pe');

      expect(ics).toContain('END:VEVENT');
      expect(ics).toContain('END:VCALENDAR');
    });

    it('buildGoogleCalendarUrl debe construir URL directa válida con parámetros requeridos', () => {
      const gcalUrl = buildGoogleCalendarUrl(sampleEventDetails);

      expect(gcalUrl.startsWith('https://calendar.google.com/calendar/render?')).toBe(true);

      const url = new URL(gcalUrl);
      expect(url.searchParams.get('action')).toBe('TEMPLATE');
      expect(url.searchParams.get('text')).toBe(sampleEventDetails.title);
      expect(url.searchParams.get('dates')).toBe('20260615T123000Z/20260615T154000Z');
      expect(url.searchParams.get('ctz')).toBe('America/Lima');
      expect(url.searchParams.get('add')).toBe('jose.morales@upn.pe');
      expect(url.searchParams.get('location')).toBe(sampleEventDetails.location);
    });

    it('buildAdvisoryCalendarDetails debe mapear una AdvisoryRequest hacia CalendarEventDetails', () => {
      const dummyAdvisory: AdvisoryRequest = {
        id: 'adv-test-123',
        code: 'ASE-2026-9999',
        advisorId: 'adv-1',
        advisorName: 'Ing. José Luis Morales',
        advisorEmail: 'jose.morales@upn.pe',
        labId: 'automatizacion',
        date: '2026-06-16',
        blockIds: ['B2', 'B3'],
        projectName: 'Robot SCARA Neumático',
        course: 'Control I',
        nrc: '4512',
        students: [
          { fullName: 'Alumno Uno', upnCode: 'N001' },
          { fullName: 'Alumno Dos', upnCode: 'N002' },
        ],
        linkedReservationId: 'res-test-123',
        linkedReservationCode: 'RES-2026-9999',
        status: 'PROGRAMADA',
        calendarEventUrl: '',
        icsDownloadUrl: '',
        calendarNotified: false,
        createdAt: new Date().toISOString(),
      };

      const details = buildAdvisoryCalendarDetails(dummyAdvisory);
      expect(details.uid).toBe('adv-test-123');
      expect(details.startBlockId).toBe('B2');
      expect(details.endBlockId).toBe('B3');
      expect(details.title).toContain('ASE-2026-9999');
      expect(details.title).toContain('Robot SCARA Neumático');
      expect(details.attendeeEmail).toBe('jose.morales@upn.pe');
      expect(details.attendeeName).toBe('Ing. José Luis Morales');
    });

    it('buildReservationCalendarDetails debe mapear una LabReservation hacia CalendarEventDetails', () => {
      const dummyReservation: LabReservation = {
        id: 'res-test-456',
        code: 'RES-2026-8888',
        origin: 'RESERVA_DIRECTA',
        labId: 'electronica',
        date: '2026-06-17',
        blockIds: ['B4'],
        leadStudent: { fullName: 'Líder Proyecto', upnCode: 'N00888888' },
        participants: [{ fullName: 'Miembro Uno', upnCode: 'N00999999' }],
        projectName: 'Fuente Conmutada Boost',
        career: 'Ingeniería Electrónica',
        course: 'Electrónica II',
        nrc: '3205',
        status: 'ACTIVA',
        createdAt: new Date().toISOString(),
      };

      const details = buildReservationCalendarDetails(dummyReservation);
      expect(details.uid).toBe('res-test-456');
      expect(details.startBlockId).toBe('B4');
      expect(details.endBlockId).toBe('B4');
      expect(details.title).toContain('Fuente Conmutada Boost');
      expect(details.location).toContain('Electrónica');
      expect(details.description).toContain('Líder Proyecto');
    });
  });

  // ==========================================================================
  // 4. AUTENTICACIÓN ADMIN Y GESTIÓN DE SESIÓN HMAC SHA-256
  // ==========================================================================
  describe('4. Autenticación Admin y Tokens de Sesión (auth)', () => {
    const testAdminUser: AdminSessionUser = {
      id: 'admin-coordinator',
      username: 'admin',
      fullName: 'Ing. Carlos Mendoza (Coordinador)',
      email: 'carlos.mendoza@upn.pe',
      role: 'COORDINADOR',
    };

    it('createSessionToken debe generar un token con estructura payload.firma válido', () => {
      const token = createSessionToken(testAdminUser);
      expect(typeof token).toBe('string');
      const parts = token.split('.');
      expect(parts).toHaveLength(2);
      expect(parts[0].length).toBeGreaterThan(10);
      expect(parts[1].length).toBeGreaterThan(10);
    });

    it('verifySessionToken debe recuperar los datos intactos del usuario administrador', () => {
      const token = createSessionToken(testAdminUser);
      const verified = verifySessionToken(token);

      expect(verified).not.toBeNull();
      expect(verified?.id).toBe(testAdminUser.id);
      expect(verified?.username).toBe(testAdminUser.username);
      expect(verified?.fullName).toBe(testAdminUser.fullName);
      expect(verified?.email).toBe(testAdminUser.email);
      expect(verified?.role).toBe(testAdminUser.role);
    });

    it('verifySessionToken debe rechazar tokens con firma adulterada o payload alterado', () => {
      const token = createSessionToken(testAdminUser);
      const [payload, signature] = token.split('.');

      // Firma adulterada
      const tamperedSig = signature.slice(0, -3) + 'XYZ';
      const resultTamperedSig = verifySessionToken(`${payload}.${tamperedSig}`);
      expect(resultTamperedSig).toBeNull();

      // Payload adulterado
      const tamperedPayload = payload.slice(0, -2) + 'aa';
      const resultTamperedPayload = verifySessionToken(`${tamperedPayload}.${signature}`);
      expect(resultTamperedPayload).toBeNull();

      // Token malformado (sin punto)
      expect(verifySessionToken('tokeninvalido')).toBeNull();

      // Token vacío o nulo
      expect(verifySessionToken('')).toBeNull();
      expect(verifySessionToken(null as any)).toBeNull();
    });

    it('buildSessionCookieValue y buildClearSessionCookieValue deben generar cabeceras de cookie correctas', () => {
      const token = 'fake-token-value-12345';
      const cookieHeader = buildSessionCookieValue(token);

      expect(cookieHeader).toContain(`${AUTH_COOKIE_NAME}=${token}`);
      expect(cookieHeader).toContain('Path=/');
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('SameSite=Lax');
      expect(cookieHeader).toContain('Max-Age=604800');

      const clearHeader = buildClearSessionCookieValue();
      expect(clearHeader).toContain(`${AUTH_COOKIE_NAME}=`);
      expect(clearHeader).toContain('Max-Age=0');
    });

    it('parseCookiesFromHeader debe parsear múltiples cookies desde una cadena Header', () => {
      const header = 'cookie1=val1; labhub_admin_session=token-abc-123; other=42';
      const parsed = parseCookiesFromHeader(header);

      expect(parsed.cookie1).toBe('val1');
      expect(parsed[AUTH_COOKIE_NAME]).toBe('token-abc-123');
      expect(parsed.other).toBe('42');

      expect(parseCookiesFromHeader(null)).toEqual({});
    });
  });

  // ==========================================================================
  // 5. FLUJOS DE API E INTEGRIDAD DE NEGOCIO
  // ==========================================================================
  describe('5. Flujos de API e Integridad de Negocio', () => {
    const adminToken = createSessionToken({
      id: 'admin-coordinator',
      username: 'admin',
      fullName: 'Ing. Carlos Mendoza (Coordinador de Laboratorios)',
      email: 'carlos.mendoza@upn.pe',
      role: 'COORDINADOR',
    });

    it('GET /api/catalog debe retornar laboratorios, asesores activos y catálogo de docentes', async () => {
      const response = await getCatalog();
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.labs).toHaveLength(3);
      expect(json.labs.map((l: any) => l.id)).toEqual(['automatizacion', 'electronica', 'mecatronica']);

      expect(json.advisors.length).toBeGreaterThanOrEqual(4);
      json.advisors.forEach((adv: any) => {
        expect(adv.active).toBe(true);
      });

      expect(json.teachers.length).toBeGreaterThan(0);
      expect(json.teachers).toContain('Ing. Carlos Alberto Mendoza Ríos');
    });

    it('POST /api/advisories debe rechazar peticiones con campos obligatorios faltantes', async () => {
      const req = new NextRequest('http://localhost:3000/api/advisories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advisorId: '',
          date: '2026-06-15',
          blockIds: [],
        }),
      });

      const response = await postAdvisory(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('campos requeridos');
    });

    it('POST /api/advisories debe rechazar fechas fuera de la ventana lectiva de 2 semanas', async () => {
      const req = new NextRequest('http://localhost:3000/api/advisories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advisorId: 'adv-1',
          date: '2020-01-01', // Fecha pasada muy lejana
          blockIds: ['B2'],
          projectName: 'Proyecto Fuera de Plazo',
          course: 'Control',
          nrc: '4512',
          students: [{ fullName: 'Test Alumno', upnCode: 'N00999991' }],
        }),
      });

      const response = await postAdvisory(req);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toContain('2 semanas lectivas');
    });

    it('POST /api/advisories debe registrar asesoría y crear su reserva vinculada con origin: ASESORIA', async () => {
      // Elegimos el lunes de la próxima semana (weekOffset = 1, day 0)
      // En la semilla, adv-1 atiende los Lunes (day 1) en B2 y B3 en lab 'automatizacion'
      const nextWeek = getWeekDaysForOffset(1);
      const targetDate = nextWeek.days[0].date; // Próximo lunes

      const advisoryPayload = {
        advisorId: 'adv-1',
        date: targetDate,
        blockIds: ['B2'],
        projectName: 'Sintonización PID para Banda Transportadora',
        course: 'Automatización Industrial',
        nrc: '4512',
        topicNotes: 'Prueba de integración QA para validación de sincronización bidireccional.',
        students: [
          { fullName: 'Estudiante Líder QA', upnCode: 'N00998877' },
          { fullName: 'Estudiante Acompañante QA', upnCode: 'N00998878' },
        ],
      };

      const req = new NextRequest('http://localhost:3000/api/advisories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(advisoryPayload),
      });

      const response = await postAdvisory(req);
      expect(response.status).toBe(201);

      const json = await response.json();
      const advisory = json.advisory;
      const reservation = json.reservation;

      // Verificación de la asesoría
      expect(advisory).toBeDefined();
      expect(advisory.code).toMatch(/^ASE-2026-\d{4}$/);
      expect(advisory.advisorId).toBe('adv-1');
      expect(advisory.date).toBe(targetDate);
      expect(advisory.status).toBe('PROGRAMADA');
      expect(advisory.calendarEventUrl).toContain('calendar.google.com');

      // Verificación de la reserva vinculada
      expect(reservation).toBeDefined();
      expect(reservation.code).toMatch(/^RES-2026-\d{4}$/);
      expect(reservation.origin).toBe('ASESORIA');
      expect(reservation.status).toBe('ACTIVA');
      expect(reservation.labId).toBe('automatizacion');

      // Enlace cruzado bidireccional
      expect(advisory.linkedReservationId).toBe(reservation.id);
      expect(advisory.linkedReservationCode).toBe(reservation.code);
      expect(reservation.linkedAdvisoryId).toBe(advisory.id);

      // Verificación de persistencia en base de datos
      const db = await dbRepository.getDatabase();
      const storedAdvisory = db.advisories.find((a) => a.id === advisory.id);
      const storedReservation = db.reservations.find((r) => r.id === reservation.id);
      expect(storedAdvisory).toBeDefined();
      expect(storedReservation).toBeDefined();
      expect(storedReservation?.origin).toBe('ASESORIA');

      // Prueba de conflicto: agendar nuevamente el mismo asesor en el mismo bloque debe fallar
      const conflictReq = new NextRequest('http://localhost:3000/api/advisories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...advisoryPayload,
          students: [{ fullName: 'Otro Alumno', upnCode: 'N00555555' }],
        }),
      });
      const conflictRes = await postAdvisory(conflictReq);
      expect(conflictRes.status).toBe(400);
      const conflictJson = await conflictRes.json();
      expect(conflictJson.error).toContain('ya tiene una asesoría programada');
    });

    it('GET, POST y PATCH /api/loans debe gestionar ciclo de préstamo: PENDIENTE -> ENTREGADO con firma de admin', async () => {
      // 1. GET con código semilla existente
      const getSeedReq = new NextRequest('http://localhost:3000/api/loans?code=EQP-2026-0001');
      const seedRes = await getLoans(getSeedReq);
      expect(seedRes.status).toBe(200);
      const seedJson = await seedRes.json();
      expect(seedJson.loan.code).toBe('EQP-2026-0001');

      // 2. GET general sin sesión admin debe dar 401
      const getNoAuthReq = new NextRequest('http://localhost:3000/api/loans');
      const noAuthRes = await getLoans(getNoAuthReq);
      expect(noAuthRes.status).toBe(401);

      // 3. POST crear nuevo préstamo
      const sampleSignature =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJYAAAA8CAYAAACF0L/3AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAH1SURBVHhe7dsxattAFIXh/c89Z20JdpmN4AowKewZ...firma_simulada_valida_para_el_test';

      const loanPayload = {
        labId: 'electronica',
        teacherName: 'Dra. Elena Patricia Vargas Soto',
        cycle: 'Ciclo VI',
        courseProgram: 'Ingeniería Electrónica - Circuitos II',
        attendedByAdvisorId: 'adv-2',
        items: [
          { quantity: 2, equipmentName: 'Multímetro Digital Fluke 179', upnCode: 'UPN-PAT-MUL-011' },
          { quantity: 1, equipmentName: 'Punta Lógica TTL/CMOS', upnCode: 'UPN-ACC-PNT-005' },
        ],
        groupMembers: [
          { fullName: 'Alumno Préstamo Uno', nrc: '3205' },
          { fullName: 'Alumno Préstamo Dos', nrc: '3205' },
        ],
        responsibleName: 'Alumno Préstamo Uno',
        responsibleUpnCode: 'N00778899',
        signatureDataUrl: sampleSignature,
      };

      const postReq = new NextRequest('http://localhost:3000/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loanPayload),
      });

      const postRes = await postLoan(postReq);
      expect(postRes.status).toBe(201);
      const postJson = await postRes.json();
      const createdLoan = postJson.loan;

      expect(createdLoan.code).toMatch(/^EQP-2026-\d{4}$/);
      expect(createdLoan.status).toBe('PENDIENTE');
      expect(createdLoan.responsibleName).toBe('Alumno Préstamo Uno');
      expect(createdLoan.items).toHaveLength(2);

      // 4. PATCH sin sesión admin debe dar 401
      const patchNoAuthReq = new NextRequest('http://localhost:3000/api/loans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: createdLoan.id,
          status: 'ENTREGADO',
        }),
      });
      const patchNoAuthRes = await patchLoan(patchNoAuthReq);
      expect(patchNoAuthRes.status).toBe(401);

      // 5. PATCH con sesión admin: cambiar de PENDIENTE a ENTREGADO
      const patchAdminReq = new NextRequest('http://localhost:3000/api/loans', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${AUTH_COOKIE_NAME}=${adminToken}`,
        },
        body: JSON.stringify({
          id: createdLoan.id,
          status: 'ENTREGADO',
          adminNotes: 'Equipos devueltos completos y operativos.',
        }),
      });

      const patchRes = await patchLoan(patchAdminReq);
      expect(patchRes.status).toBe(200);
      const patchJson = await patchRes.json();
      const updatedLoan = patchJson.loan;

      expect(updatedLoan.status).toBe('ENTREGADO');
      expect(updatedLoan.deliveredAt).toBeDefined();
      expect(updatedLoan.deliveredByAdmin).toContain('Carlos Mendoza');
      expect(updatedLoan.adminNotes).toBe('Equipos devueltos completos y operativos.');
    });

    it('GET, POST y PATCH /api/prints debe validar archivos STL y fijar ventana de +72 horas al pasar a OBSERVADO', async () => {
      // 1. GET búsqueda
      const getReq = new NextRequest('http://localhost:3000/api/prints?query=3DP-2026-0001');
      const getRes = await getPrints(getReq);
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.results).toHaveLength(1);
      expect(getJson.results[0].code).toBe('3DP-2026-0001');

      // 2. POST rechazo por archivo no STL
      const invalidFd = new FormData();
      invalidFd.append('studentFullName', 'Estudiante 3D QA');
      invalidFd.append('upnCode', 'N00334455');
      invalidFd.append('teacherName', 'Dr. Marco Villanueva');
      invalidFd.append('course', 'Robótica');
      invalidFd.append('nrc', '5840');
      const textFile = new File(['texto plano'], 'modelo.txt', { type: 'text/plain' });
      invalidFd.append('file', textFile);

      const invalidReq = new NextRequest('http://localhost:3000/api/prints', {
        method: 'POST',
        body: invalidFd,
      });
      const invalidRes = await postPrint(invalidReq);
      expect(invalidRes.status).toBe(400);
      const invalidJson = await invalidRes.json();
      expect(invalidJson.error).toContain('extensión requerida .stl');

      // 3. POST exitoso con archivo STL binario
      const validStlBuf = createSampleBinaryStlBuffer(35, 35, 15);
      const validFile = new File([new Uint8Array(toArrayBuffer(validStlBuf))], 'engranaje_test.stl', { type: 'application/octet-stream' });

      const validFd = new FormData();
      validFd.append('studentFullName', 'Estudiante 3D QA');
      validFd.append('upnCode', 'N00334455');
      validFd.append('teacherName', 'Dr. Marco Antonio Villanueva Castro');
      validFd.append('course', 'Robótica Industrial y Móvil');
      validFd.append('nrc', '5840');
      validFd.append('file', validFile);

      const validPostReq = new NextRequest('http://localhost:3000/api/prints', {
        method: 'POST',
        body: validFd,
      });

      const postRes = await postPrint(validPostReq);
      expect(postRes.status).toBe(201);
      const postJson = await postRes.json();
      const createdPrint = postJson.printRequest;

      expect(createdPrint.code).toMatch(/^3DP-2026-\d{4}$/);
      expect(createdPrint.status).toBe('ENVIADO');
      expect(createdPrint.files).toHaveLength(1);
      expect(createdPrint.files[0].triangleCount).toBe(12);
      expect(createdPrint.files[0].format).toBe('BINARY');

      // Registrar código para limpieza en afterAll
      testCreatedPrintCodes.push(createdPrint.code);

      // 4. PATCH rechazo a OBSERVADO sin comentario explicativo
      const patchNoCommentReq = new NextRequest('http://localhost:3000/api/prints', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${AUTH_COOKIE_NAME}=${adminToken}`,
        },
        body: JSON.stringify({
          id: createdPrint.id,
          status: 'OBSERVADO',
        }),
      });
      const patchNoCommentRes = await patchPrint(patchNoCommentReq);
      expect(patchNoCommentRes.status).toBe(400);
      const patchNoCommentJson = await patchNoCommentRes.json();
      expect(patchNoCommentJson.error).toContain('obligatorio detallar el motivo');

      // 5. PATCH con cambio a OBSERVADO y verificación exacta de plazo de +72 horas
      const beforePatchTime = Date.now();
      const patchObservedReq = new NextRequest('http://localhost:3000/api/prints', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${AUTH_COOKIE_NAME}=${adminToken}`,
        },
        body: JSON.stringify({
          id: createdPrint.id,
          status: 'OBSERVADO',
          observationComment: 'El modelo presenta caras no conformadas (non-manifold) y paredes inferiores a 1.2 mm.',
        }),
      });

      const patchObservedRes = await patchPrint(patchObservedReq);
      expect(patchObservedRes.status).toBe(200);
      const patchObservedJson = await patchObservedRes.json();
      const observedPrint = patchObservedJson.printRequest;

      expect(observedPrint.status).toBe('OBSERVADO');
      expect(observedPrint.observationComment).toContain('non-manifold');
      expect(observedPrint.observedAt).toBeDefined();
      expect(observedPrint.observationExpiresAt).toBeDefined();

      const observedAtMs = new Date(observedPrint.observedAt).getTime();
      const expiresAtMs = new Date(observedPrint.observationExpiresAt).getTime();

      // Plazo exacto de +72 horas (72 * 3600 * 1000 = 259,200,000 ms)
      const diffHours = (expiresAtMs - observedAtMs) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(72, 2);

      // Historial de cambios
      const lastHistory = observedPrint.statusHistory[observedPrint.statusHistory.length - 1];
      expect(lastHistory.status).toBe('OBSERVADO');
      expect(lastHistory.actor).toContain('Carlos Mendoza');
    });
  });
});
