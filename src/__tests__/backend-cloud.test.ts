import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  generateLoanActaHtml,
  extractSignaturePngBuffer,
} from '@/lib/documents/loan-document';
import { oneDriveClient } from '@/lib/cloud/onedrive-client';
import { dbRepository, LabHubDatabase, _storageTesting } from '@/lib/storage/db';
import { googleBridge } from '@/lib/google/bridge';
import { buildAdvisoryCalendarDetails, buildGoogleCalendarUrl } from '@/lib/calendar/ics';
import { EquipmentLoan, AdvisoryRequest } from '@/types/labhub';
import { GET as getGoogleAdminRoute } from '@/app/api/admin/google/route';
import { createSessionToken, AUTH_COOKIE_NAME } from '@/lib/auth';

describe('Suite de Pruebas Backend — Documentos, OneDrive y Almacenamiento en la Nube', () => {
  const sampleLoan: EquipmentLoan = {
    id: 'test-loan-123',
    code: 'EQP-2026-9999',
    labId: 'automatizacion',
    teacherName: 'Fernando Aristides Saldaña Milla',
    cycle: 'Ciclo VII',
    courseProgram: 'Ingeniería Mecatrónica - Automatización Industrial',
    attendedByAdvisorId: 'adv-1',
    attendedByName: 'Ing. José Luis Morales Ríos',
    items: [
      {
        quantity: 2,
        equipmentName: 'Módulo PLC Siemens S7-1200 CPU 1214C',
        upnCode: 'UPN-PAT-PLC-001',
      },
      {
        quantity: 1,
        equipmentName: 'Multímetro Digital Fluke 179',
        upnCode: 'UPN-PAT-MUL-014',
      },
    ],
    groupMembers: [
      { fullName: 'Juan Diego Pérez Sánchez', nrc: '4512' },
      { fullName: 'María Elena Torres Morales', nrc: '4512' },
    ],
    responsibleName: 'Juan Diego Pérez Sánchez',
    responsibleUpnCode: 'N00199999',
    signatureDataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    status: 'PENDIENTE',
    createdAt: '2026-10-31T10:00:00.000Z',
    googleSynced: false,
  };

  describe('1. Generador de Documentos Oficiales de Préstamo (loan-document.ts)', () => {
    it('debe decodificar correctamente el PNG binario desde un dataUrl base64 válido', () => {
      const buf = extractSignaturePngBuffer(sampleLoan.signatureDataUrl);
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf!.length).toBeGreaterThan(0);
      // Validar cabecera mágica de PNG: 0x89, 0x50, 0x4E, 0x47
      expect(buf![0]).toBe(0x89);
      expect(buf![1]).toBe(0x50);
      expect(buf![2]).toBe(0x4e);
      expect(buf![3]).toBe(0x47);
    });

    it('debe retornar null para URLs de firma vacías o inválidas', () => {
      expect(extractSignaturePngBuffer('')).toBeNull();
      expect(extractSignaturePngBuffer('texto-invalido')).toBeNull();
    });

    it('debe generar el HTML5 autocontenido del acta con datos institucionales UPN y copyright', () => {
      const html = generateLoanActaHtml(sampleLoan);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Entrega de Materiales y/o Equipos');
      expect(html).toContain('EQP-2026-9999');
      expect(html).toContain('Laboratorio de Automatización');
      expect(html).toContain('Fernando Aristides Saldaña Milla');
      expect(html).toContain('Módulo PLC Siemens S7-1200 CPU 1214C');
      expect(html).toContain('UPN-PAT-PLC-001');
      expect(html).toContain('Juan Diego Pérez Sánchez');
      expect(html).toContain('N00199999');
      expect(html).toContain('María Elena Torres Morales');
      expect(html).toContain('4512');
      expect(html).toContain('#FDBA30');
      expect(html).toContain('© 2026 Martin Cerna. Todos los derechos reservados.');
    });

    it('debe reflejar el estado ENTREGADO / DEVUELTO con badge verde cuando está entregado', () => {
      const deliveredLoan: EquipmentLoan = {
        ...sampleLoan,
        status: 'ENTREGADO',
        deliveredAt: '2026-10-31T18:00:00.000Z',
        deliveredByAdmin: 'Ing. Carlos Mendoza',
      };

      const html = generateLoanActaHtml(deliveredLoan);
      expect(html).toContain('ENTREGADO / DEVUELTO');
      expect(html).toContain('#10b981');
    });
  });

  describe('2. Cliente Microsoft OneDrive / Graph API (onedrive-client.ts)', () => {
    it('debe construir la URL OAuth2 con los scopes requeridos y tenant configurado', () => {
      const url = oneDriveClient.buildOneDriveAuthUrl(
        'azure-client-id-123',
        'organizations',
        'https://labhub.upn.pe/api/admin/cloud/onedrive/callback'
      );

      expect(url).toContain('https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize');
      expect(url).toContain('client_id=azure-client-id-123');
      expect(url).toContain('Files.ReadWrite');
      expect(url).toContain('offline_access');
      expect(url).toContain('Calendars.ReadWrite');
      expect(url).toContain('prompt=consent');
    });
  });

  describe('3. Persistencia Atómica y Respaldo de Base de Datos (db.ts)', () => {
    it('debe resolver un directorio de almacenamiento válido para disco y archivos STL', async () => {
      const db = await dbRepository.getDatabase();
      expect(db).toBeDefined();
      expect(Array.isArray(db.labs)).toBe(true);
      expect(db.labs.length).toBeGreaterThanOrEqual(3);
      expect(db.googleConfig).toBeDefined();
    });

    it('debe soportar la hidratación total mediante replaceDatabaseState', async () => {
      const current = await dbRepository.getDatabase();
      const updated = await dbRepository.replaceDatabaseState({
        ...current,
        sequences: {
          ...current.sequences,
          loan: 999,
        },
      });

      expect(updated.sequences.loan).toBe(999);

      // Restaurar estado
      await dbRepository.replaceDatabaseState(current);
    });

    it('debe compartir una única promesa en frío (coldStartHydrationPromise) ante peticiones concurrentes y consultar GET_STATE', async () => {
      const originalVitest = process.env.VITEST;
      _storageTesting.resetColdStartHydrationForTest();

      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
        const body = JSON.parse((init?.body as string) || '{}');
        if (body.action === 'GET_STATE') {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              state: {
                advisories: [],
                reservations: [],
                slotBlocks: [],
              },
            }),
          } as Response;
        }
        return { ok: false } as Response;
      });

      try {
        delete process.env.VITEST;

        // Dos llamadas concurrentes
        const p1 = _storageTesting.tryColdStartCloudHydration();
        const p2 = _storageTesting.tryColdStartCloudHydration();

        // Comprobar que p1 y p2 devuelven exactamente la misma promesa compartida
        expect(p1).toBe(p2);
        expect(_storageTesting.getColdStartHydrationPromise()).toBe(p1);

        await Promise.all([p1, p2]);

        // Debe haberse llamado fetch exactamente 1 vez con GET_STATE
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [callUrl, callOptions] = fetchSpy.mock.calls[0];
        expect(callUrl).toContain('script.google.com');
        const parsedBody = JSON.parse((callOptions?.body as string) || '{}');
        expect(parsedBody.action).toBe('GET_STATE');
      } finally {
        process.env.VITEST = originalVitest;
        fetchSpy.mockRestore();
        _storageTesting.resetColdStartHydrationForTest();
      }
    });

    it('debe proteger contra sobreescritura en la nube si la BD local está vacía y la hidratación falló por red', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const originalVitest = process.env.VITEST;

      try {
        delete process.env.VITEST;
        _storageTesting.setColdStartHydrationFailed(true);

        const emptyDb = {
          advisories: [],
          reservations: [],
          slotBlocks: [],
          googleConfig: {
            enabled: true,
            persistFullStateInDrive: true,
          },
        } as unknown as LabHubDatabase;

        _storageTesting.scheduleBackgroundCloudSnapshotPush(emptyDb);

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Push automático en segundo plano omitido')
        );
      } finally {
        process.env.VITEST = originalVitest;
        warnSpy.mockRestore();
        _storageTesting.resetColdStartHydrationForTest();
      }
    });
  });

  describe('4. Orquestador Cloud Bridge (bridge.ts)', () => {
    it('debe retornar advertencia controlada si no hay webhook configurado para Google Drive', async () => {
      // Modificar temporalmente webhook URL
      const current = await dbRepository.getDatabase();
      await dbRepository.updateDatabase((db) => {
        db.googleConfig.appsScriptWebhookUrl = '';
        db.googleConfig.activeProvider = 'GOOGLE_DRIVE';
      });

      const res = await googleBridge.pingInit();
      expect(res.ok).toBe(false);
      expect(res.message).toContain('No se ha configurado la URL del Webhook');

      // Restaurar
      await dbRepository.replaceDatabaseState(current);
    });

    it('debe advertir si se selecciona OneDrive sin Client ID o autorización', async () => {
      const current = await dbRepository.getDatabase();
      await dbRepository.updateDatabase((db) => {
        db.googleConfig.activeProvider = 'ONEDRIVE';
        if (db.googleConfig.onedrive) {
          db.googleConfig.onedrive.refreshToken = '';
        }
      });

      const res = await googleBridge.pingInit();
      expect(res.ok).toBe(false);
      expect(res.message).toContain('vinculación con Microsoft OneDrive');

      // Restaurar
      await dbRepository.replaceDatabaseState(current);
    });
  });

  describe('5. Corrección de Horarios de Asesorías en Calendario (OneDrive & Google Calendar)', () => {
    it('debe calcular correctamente el horario de inicio y fin para bloques combinados B5 y B6 (14:30 a 17:40)', () => {
      const advisoryB5B6: any = {
        id: 'adv-test-ase-002',
        code: 'ASE-2026-0002',
        advisorId: 'adv-1',
        advisorName: 'Martín Aarón León Cerna',
        advisorEmail: 'martin.cernaa@gmail.com',
        labId: 'mecatronica',
        date: '2026-11-12',
        blockIds: ['B5', 'B6'],
        projectName: 'Robot Móvil 4WD',
        course: 'Robótica Móvil',
        nrc: '25053',
        students: [{ fullName: 'Test Student', upnCode: 'N00123456' }],
        status: 'PROGRAMADA',
      };

      const details = buildAdvisoryCalendarDetails(advisoryB5B6);
      expect(details.startBlockId).toBe('B5');
      expect(details.endBlockId).toBe('B6');

      const googleUrl = buildGoogleCalendarUrl(details);
      expect(googleUrl).toContain('calendar.google.com');
      // 14:30 UTC-5 = 19:30 UTC, 17:40 UTC-5 = 22:40 UTC
      expect(googleUrl).toContain('dates=20261112T193000Z%2F20261112T224000Z');
      expect(googleUrl).toContain('ASE-2026-0002');
    });

    it('debe actualizar eventos existentes mediante PATCH en vez de duplicarlos en OneDrive', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');

      // Mock de autenticación con token
      vi.spyOn(oneDriveClient, 'getAccessToken').mockResolvedValue('fake-access-token');

      // Mock 1: GET /me/events retornando un evento previo con ASE-2026-0002
      fetchSpy.mockImplementationOnce(async (url: any) => {
        if (typeof url === 'string' && url.includes('/me/events?$select')) {
          return {
            ok: true,
            json: async () => ({
              value: [
                {
                  id: 'event-graph-12345',
                  subject: '[LabHub UPN] Asesoría: Robot Móvil 4WD (ASE-2026-0002)',
                  webLink: 'https://outlook.office.com/calendar/event-graph-12345',
                },
              ],
            }),
          } as any;
        }
        return { ok: false } as any;
      });

      // Mock 2: PATCH /me/events/event-graph-12345
      let patchBodyCaptured: any = null;
      fetchSpy.mockImplementationOnce(async (url: any, init: any) => {
        if (typeof url === 'string' && url.includes('/me/events/event-graph-12345') && init?.method === 'PATCH') {
          patchBodyCaptured = JSON.parse(init.body);
          return {
            ok: true,
            json: async () => ({
              id: 'event-graph-12345',
              webLink: 'https://outlook.office.com/calendar/event-graph-12345',
            }),
          } as any;
        }
        return { ok: false } as any;
      });

      const advisory = {
        id: 'adv-test-ase-002',
        code: 'ASE-2026-0002',
        advisorId: 'adv-1',
        advisorName: 'Martín Aarón León Cerna',
        advisorEmail: 'martin.cernaa@gmail.com',
        labId: 'mecatronica' as const,
        date: '2026-11-12',
        blockIds: ['B5', 'B6'] as any,
        projectName: 'Robot Móvil 4WD',
        course: 'Robótica Móvil',
        nrc: '25053',
        students: [{ fullName: 'Test Student', upnCode: 'N00123456' }],
        status: 'PROGRAMADA' as const,
      };

      const result = await oneDriveClient.createCalendarEventForAdvisory(
        {
          tenantId: 'common',
          clientId: 'cid',
          clientSecret: 'secret',
          refreshToken: 'rtoken',
          rootFolderPath: 'LabHub_ST_UPN',
        },
        advisory as any
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe('event-graph-12345');
      expect(patchBodyCaptured).toBeDefined();
      expect(patchBodyCaptured.start.dateTime).toBe('2026-11-12T14:30:00');
      expect(patchBodyCaptured.end.dateTime).toBe('2026-11-12T17:40:00');
      expect(patchBodyCaptured.body.content).toContain('14:30 - 16:00, 16:10 - 17:40');

      fetchSpy.mockRestore();
    });
  });

  describe('6. Endpoint GET /api/admin/google y Sincronización Google Apps Script', () => {
    it('debe rechazar solicitudes no autorizadas (401) en GET /api/admin/google', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/google', {
        method: 'GET',
      });
      const response = await getGoogleAdminRoute(req);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('debe retornar el script completo de Google Apps Script con sesión válida de admin', async () => {
      const token = createSessionToken({
        id: 'admin-1',
        username: 'admin',
        role: 'COORDINADOR',
        fullName: 'Administrador LabHub',
        email: 'admin@upn.pe',
      });

      const req = new NextRequest('http://localhost:3000/api/admin/google', {
        method: 'GET',
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${token}`,
        },
      });

      const response = await getGoogleAdminRoute(req);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.scriptContent).toBeDefined();
      expect(data.scriptContent).toContain('syncAdvisoriesCalendar_');
      expect(data.scriptContent).toContain('00-05:00');
      expect(data.scriptContent).toContain('deleteEvent');
      expect(data.scriptContent).toContain('sendInvites: true');
    });

    it('el archivo LabHubGoogleBridge.gs debe contener la lógica de timezone de Perú (-05:00) y reemplazo de eventos', () => {
      const scriptPath = path.join(process.cwd(), 'google-apps-script', 'LabHubGoogleBridge.gs');
      const content = fs.readFileSync(scriptPath, 'utf-8');

      // 1. Verificación del cálculo con offset ISO-8601 de Perú
      expect(content).toContain('var pad2 = function(n) { return n < 10 ? "0" + n : String(n); };');
      expect(content).toContain('var startIso = adv.date + "T" + pad2(startHour) + ":" + pad2(startMin) + ":00-05:00";');
      expect(content).toContain('var endIso = adv.date + "T" + pad2(endHour) + ":" + pad2(endMin) + ":00-05:00";');

      // 2. Rango explícito en hora de Perú para getEvents
      expect(content).toContain('var dayStart = new Date(adv.date + "T00:00:00-05:00");');
      expect(content).toContain('var dayEnd = new Date(adv.date + "T23:59:59-05:00");');
      expect(content).toContain('var dayEvents = defaultCal.getEvents(dayStart, dayEnd);');

      // 3. Verificación de cambio de hora y recreación de evento con sendInvites
      expect(content).toContain('existingEvent.getStartTime().getTime() !== startTime.getTime() ||');
      expect(content).toContain('existingEvent.deleteEvent()');
      expect(content).toContain('defaultCal.createEvent(eventTitle, startTime, endTime, eventOptions)');
    });
  });
});
