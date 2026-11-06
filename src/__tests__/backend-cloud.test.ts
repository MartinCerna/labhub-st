import { describe, it, expect, vi } from 'vitest';
import {
  generateLoanActaHtml,
  extractSignaturePngBuffer,
} from '@/lib/documents/loan-document';
import { oneDriveClient } from '@/lib/cloud/onedrive-client';
import { dbRepository, LabHubDatabase } from '@/lib/storage/db';
import { googleBridge } from '@/lib/google/bridge';
import { buildAdvisoryCalendarDetails, buildGoogleCalendarUrl } from '@/lib/calendar/ics';
import { EquipmentLoan } from '@/types/labhub';

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
      const advisoryB5B6 = {
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
        },
        advisory
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
});
