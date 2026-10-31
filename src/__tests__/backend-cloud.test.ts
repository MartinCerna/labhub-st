import { describe, it, expect, vi } from 'vitest';
import {
  generateLoanActaHtml,
  extractSignaturePngBuffer,
} from '@/lib/documents/loan-document';
import { oneDriveClient } from '@/lib/cloud/onedrive-client';
import { dbRepository, LabHubDatabase } from '@/lib/storage/db';
import { googleBridge } from '@/lib/google/bridge';
import { EquipmentLoan } from '@/types/labhub';

describe('Suite de Pruebas Backend — Documentos, OneDrive y Almacenamiento en la Nube', () => {
  const sampleLoan: EquipmentLoan = {
    id: 'test-loan-123',
    code: 'EQP-2026-9999',
    labId: 'automatizacion',
    teacherName: 'Ing. Carlos Alberto Mendoza Ríos',
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
      expect(html).toContain('Ing. Carlos Alberto Mendoza Ríos');
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
});
