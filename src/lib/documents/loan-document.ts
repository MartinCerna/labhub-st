import { EquipmentLoan } from '@/types/labhub';

/**
 * Decodifica una URL de datos Base64 (data:image/png;base64,...) a un Buffer binario PNG limpio.
 */
export function extractSignaturePngBuffer(signatureDataUrl: string): Buffer | null {
  if (!signatureDataUrl || typeof signatureDataUrl !== 'string') {
    return null;
  }

  const base64Index = signatureDataUrl.indexOf('base64,');
  const base64Data = base64Index !== -1
    ? signatureDataUrl.substring(base64Index + 7)
    : signatureDataUrl;

  try {
    const buffer = Buffer.from(base64Data.trim(), 'base64');
    if (buffer.length < 8) return null;
    // Validar cabecera mágica de PNG: 0x89 0x50 0x4E 0x47 (\x89PNG)
    if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
      return null;
    }
    return buffer;
  } catch {
    return null;
  }
}

function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Genera el documento HTML5 oficial de "ENTREGA DE MATERIALES Y/O EQUIPOS"
 * con la paleta de colores institucional UPN (#FDBA30 / #000000), autocontenido,
 * estéticamente refinado e imprimible.
 */
export function generateLoanActaHtml(loan: EquipmentLoan): string {
  const isDelivered = loan.status === 'ENTREGADO';
  const statusBadgeBg = isDelivered ? '#10b981' : '#f59e0b';
  const statusBadgeColor = '#ffffff';
  const statusLabel = isDelivered ? 'ENTREGADO / DEVUELTO' : 'PENDIENTE DE DEVOLUCIÓN';

  const labNameMap: Record<string, string> = {
    automatizacion: 'Laboratorio de Automatización y Control Industrial',
    electronica: 'Laboratorio de Electrónica y Sistemas Embebidos',
    mecatronica: 'Laboratorio de Robótica y Mecatrónica Avanzada',
  };
  const labFullName = labNameMap[loan.labId] || `Laboratorio: ${loan.labId}`;

  const formattedCreated = new Date(loan.createdAt).toLocaleString('es-PE', {
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const formattedDelivered = loan.deliveredAt
    ? new Date(loan.deliveredAt).toLocaleString('es-PE', {
        dateStyle: 'full',
        timeStyle: 'medium',
      })
    : 'Pendiente de entrega/devolución';

  const itemsRows = loan.items
    .map(
      (item, idx) => `
      <tr>
        <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
        <td style="text-align: center; font-weight: 700; color: #111827;">${escapeHtml(item.quantity.toString())}</td>
        <td style="font-weight: 500;">${escapeHtml(item.equipmentName)}</td>
        <td style="text-align: center; font-family: 'Courier New', Courier, monospace; font-weight: 700; color: #1f2937;">${escapeHtml(item.upnCode)}</td>
      </tr>`
    )
    .join('');

  const membersRows = loan.groupMembers
    .map(
      (member, idx) => `
      <tr>
        <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
        <td style="font-weight: 600;">${escapeHtml(member.fullName)}</td>
        <td style="text-align: center; font-family: 'Courier New', Courier, monospace;">${escapeHtml(member.nrc)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acta de Préstamo — ${escapeHtml(loan.code)} — LabHub UPN</title>
  <style>
    @page {
      size: A4;
      margin: 15mm 15mm 15mm 15mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1f2937;
      background: #f3f4f6;
      padding: 24px;
      line-height: 1.45;
    }
    .page-sheet {
      max-width: 860px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      overflow: hidden;
      border: 1px solid #e5e7eb;
    }
    .header-band {
      background: #000000;
      color: #ffffff;
      padding: 24px 32px;
      border-bottom: 5px solid #FDBA30;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .upn-badge {
      background: #FDBA30;
      color: #000000;
      font-weight: 900;
      font-size: 22px;
      padding: 6px 14px;
      border-radius: 4px;
      letter-spacing: 1px;
    }
    .system-title h1 {
      font-size: 19px;
      letter-spacing: 0.5px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .system-title p {
      font-size: 12px;
      color: #d1d5db;
    }
    .code-box {
      text-align: right;
    }
    .code-tag {
      font-family: 'Courier New', Courier, monospace;
      font-size: 20px;
      font-weight: 800;
      color: #FDBA30;
      letter-spacing: 1px;
    }
    .status-pill {
      display: inline-block;
      margin-top: 6px;
      background: ${statusBadgeBg};
      color: ${statusBadgeColor};
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .document-body {
      padding: 32px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #111827;
      border-left: 4px solid #FDBA30;
      padding-left: 10px;
      margin: 22px 0 12px 0;
    }
    .section-title:first-of-type {
      margin-top: 0;
    }
    .grid-info {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px 20px;
      background: #f9fafb;
      padding: 16px;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
      font-size: 13px;
    }
    .info-item {
      display: flex;
      flex-direction: column;
    }
    .info-label {
      font-size: 11px;
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .info-value {
      font-weight: 600;
      color: #111827;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 12px;
    }
    table th {
      background: #111827;
      color: #ffffff;
      padding: 8px 10px;
      text-align: left;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    table td {
      padding: 8px 10px;
      border-bottom: 1px solid #e5e7eb;
    }
    table tr:nth-child(even) td {
      background: #f9fafb;
    }
    .signature-area {
      margin-top: 28px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      page-break-inside: avoid;
    }
    .sig-card {
      border: 1px dashed #9ca3af;
      border-radius: 6px;
      padding: 16px;
      text-align: center;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 170px;
    }
    .sig-img-wrap {
      height: 90px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sig-img {
      max-height: 85px;
      max-width: 90%;
      object-fit: contain;
    }
    .sig-line {
      border-top: 1.5px solid #111827;
      margin-top: 8px;
      padding-top: 6px;
      font-size: 12px;
      font-weight: 700;
    }
    .sig-sub {
      font-size: 11px;
      color: #4b5563;
    }
    .notice-box {
      margin-top: 24px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 6px;
      padding: 12px 16px;
      font-size: 11px;
      color: #92400e;
      line-height: 1.5;
    }
    .footer {
      border-top: 1px solid #e5e7eb;
      padding: 16px 32px;
      font-size: 11px;
      color: #6b7280;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f9fafb;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .page-sheet {
        box-shadow: none;
        border: none;
        width: 100%;
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="page-sheet">
    <div class="header-band">
      <div class="brand-title">
        <div class="upn-badge">UPN</div>
        <div class="system-title">
          <h1>Entrega de Materiales y/o Equipos</h1>
          <p>LabHub ST — Facultad de Ingeniería — Sede San Isidro / Lima</p>
        </div>
      </div>
      <div class="code-box">
        <div class="code-tag">${escapeHtml(loan.code)}</div>
        <div class="status-pill">${escapeHtml(statusLabel)}</div>
      </div>
    </div>

    <div class="document-body">
      <div class="section-title">1. Información Académica y del Laboratorio</div>
      <div class="grid-info">
        <div class="info-item">
          <span class="info-label">Laboratorio</span>
          <span class="info-value">${escapeHtml(labFullName)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Docente Responsable</span>
          <span class="info-value">${escapeHtml(loan.teacherName)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Ciclo Académico</span>
          <span class="info-value">${escapeHtml(loan.cycle)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Curso / Programa</span>
          <span class="info-value">${escapeHtml(loan.courseProgram)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Asistente que Entregó</span>
          <span class="info-value">${escapeHtml(loan.attendedByName)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Fecha de Solicitud</span>
          <span class="info-value">${escapeHtml(formattedCreated)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Estado de Devolución</span>
          <span class="info-value" style="color: ${statusBadgeBg}; font-weight: 800;">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Fecha de Devolución</span>
          <span class="info-value">${escapeHtml(formattedDelivered)}</span>
        </div>
      </div>

      <div class="section-title">2. Materiales y Equipos Prestados</div>
      <table>
        <thead>
          <tr>
            <th style="width: 45px; text-align: center;">Ítem</th>
            <th style="width: 70px; text-align: center;">Cant.</th>
            <th>Descripción del Material o Equipo</th>
            <th style="width: 170px; text-align: center;">Código Patrimonial UPN</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <div class="section-title">3. Estudiante Responsable e Integrantes del Grupo</div>
      <div class="grid-info" style="margin-bottom: 12px;">
        <div class="info-item">
          <span class="info-label">Estudiante Responsable</span>
          <span class="info-value">${escapeHtml(loan.responsibleName)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Código UPN Responsable</span>
          <span class="info-value" style="font-family: 'Courier New', Courier, monospace; font-size: 14px;">${escapeHtml(loan.responsibleUpnCode)}</span>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 45px; text-align: center;">#</th>
            <th>Nombre Completo del Integrante</th>
            <th style="width: 140px; text-align: center;">NRC</th>
          </tr>
        </thead>
        <tbody>
          ${membersRows}
        </tbody>
      </table>

      <div class="section-title">4. Conformidad y Firma Digital del Responsable</div>
      <div class="signature-area">
        <div class="sig-card">
          <div class="sig-img-wrap">
            ${
              loan.signatureDataUrl
                ? `<img class="sig-img" src="${loan.signatureDataUrl}" alt="Firma Digital ${escapeHtml(loan.responsibleName)}" />`
                : '<span style="color: #9ca3af; font-size: 12px;">Firma registrada digitalmente</span>'
            }
          </div>
          <div>
            <div class="sig-line">${escapeHtml(loan.responsibleName)}</div>
            <div class="sig-sub">Estudiante Responsable — Cód: ${escapeHtml(loan.responsibleUpnCode)}</div>
          </div>
        </div>

        <div class="sig-card">
          <div class="sig-img-wrap">
            <div style="font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #374151; font-weight: 700;">
              [ REGISTRO SISTEMA LABHUB ]<br>
              ${escapeHtml(loan.code)}<br>
              ${escapeHtml(loan.status)}
            </div>
          </div>
          <div>
            <div class="sig-line">${escapeHtml(loan.attendedByName)}</div>
            <div class="sig-sub">Asistente de Laboratorio — Entrega / Recepción</div>
          </div>
        </div>
      </div>

      <div class="notice-box">
        <strong>Declaración de Responsabilidad:</strong> El estudiante responsable y los integrantes registrados declaran haber recibido los materiales y equipos detallados en óptimas condiciones de funcionamiento. Se comprometen a utilizarlos exclusivamente para fines académicos y a devolverlos íntegros al finalizar la sesión bajo las normas del Reglamento de Laboratorios de la Universidad Privada del Norte.
      </div>
    </div>

    <div class="footer">
      <div>Sistema LabHub ST • Gestión de Laboratorios de Ingeniería UPN</div>
      <div>© 2026 Martin Cerna. Todos los derechos reservados.</div>
    </div>
  </div>
</body>
</html>`;
}
