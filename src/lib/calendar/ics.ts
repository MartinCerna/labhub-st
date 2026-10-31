import { AdvisoryRequest, LabReservation, TimeBlockId } from '@/types/labhub';
import { LAB_MAP, TIME_BLOCK_MAP } from '@/constants/schedule';

export interface CalendarEventDetails {
  uid: string;
  title: string;
  description: string;
  location: string;
  startDateIso: string; // YYYY-MM-DD
  startBlockId: TimeBlockId;
  endBlockId: TimeBlockId;
  organizerEmail?: string;
  attendeeEmail?: string;
  attendeeName?: string;
}

/**
 * Convierte fecha YYYY-MM-DD y hora HH:mm en fecha local peruana (UTC-5) y genera formato iCal UTC: YYYYMMDDTHHmmssZ
 */
function toIcsUtcDateTime(dateStr: string, timeStr: string): string {
  // Perú está en UTC-5 todo el año (sin horario de verano)
  const [yyyy, mm, dd] = dateStr.split('-').map(Number);
  const [hh, min] = timeStr.split(':').map(Number);

  // Crear objeto Date considerando offset UTC-5
  // Si en Perú son las 07:30, en UTC son las 12:30 (+5 horas)
  const utcDate = new Date(Date.UTC(yyyy, mm - 1, dd, hh + 5, min, 0));

  const uY = utcDate.getUTCFullYear();
  const uM = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const uD = String(utcDate.getUTCDate()).padStart(2, '0');
  const uH = String(utcDate.getUTCHours()).padStart(2, '0');
  const uMin = String(utcDate.getUTCMinutes()).padStart(2, '0');
  const uS = '00';

  return `${uY}${uM}${uD}T${uH}${uMin}${uS}Z`;
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Genera el contenido de un archivo .ics estándar RFC 5545
 */
export function generateIcsCalendar(event: CalendarEventDetails): string {
  const startBlock = TIME_BLOCK_MAP[event.startBlockId];
  const endBlock = TIME_BLOCK_MAP[event.endBlockId];

  const dtStart = toIcsUtcDateTime(event.startDateIso, startBlock.startTime);
  const dtEnd = toIcsUtcDateTime(event.startDateIso, endBlock.endTime);
  const dtStamp = toIcsUtcDateTime(
    new Date().toISOString().substring(0, 10),
    new Date().toISOString().substring(11, 16)
  );

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UPN//LabHub ST Engineering Labs//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VTIMEZONE',
    'TZID:America/Lima',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0500',
    'TZNAME:PET',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${event.uid}@labhub.upn.pe`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    `LOCATION:${escapeIcsText(event.location)}`,
    `STATUS:CONFIRMED`,
  ];

  if (event.organizerEmail) {
    lines.push(
      `ORGANIZER;CN="LabHub UPN":mailto:${event.organizerEmail}`
    );
  }

  if (event.attendeeEmail) {
    const cn = event.attendeeName ? `;CN="${event.attendeeName}"` : '';
    lines.push(
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=TRUE${cn}:mailto:${event.attendeeEmail}`
    );
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n') + '\r\n';
}

/**
 * Genera un enlace directo tipo "Añadir a Google Calendar"
 */
export function buildGoogleCalendarUrl(event: CalendarEventDetails): string {
  const startBlock = TIME_BLOCK_MAP[event.startBlockId];
  const endBlock = TIME_BLOCK_MAP[event.endBlockId];

  const dtStart = toIcsUtcDateTime(event.startDateIso, startBlock.startTime);
  const dtEnd = toIcsUtcDateTime(event.startDateIso, endBlock.endTime);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${dtStart}/${dtEnd}`,
    details: event.description,
    location: event.location,
    ctz: 'America/Lima',
  });

  if (event.attendeeEmail) {
    params.set('add', event.attendeeEmail);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Construye los detalles del calendario a partir de una Asesoría
 */
export function buildAdvisoryCalendarDetails(advisory: AdvisoryRequest): CalendarEventDetails {
  const lab = LAB_MAP[advisory.labId];
  const labName = lab ? lab.name : advisory.labId;
  const labLocation = lab ? `${lab.name} - ${lab.location}` : 'Laboratorios de Ingeniería UPN';

  const sortedBlocks = [...advisory.blockIds].sort((a, b) => {
    return TIME_BLOCK_MAP[a].order - TIME_BLOCK_MAP[b].order;
  });
  const firstBlock = sortedBlocks[0];
  const lastBlock = sortedBlocks[sortedBlocks.length - 1];

  const studentsList = advisory.students
    .map((s, idx) => `${idx + 1}. ${s.fullName} (${s.upnCode})`)
    .join('\n');

  const description = [
    `ASESORÍA ACADÉMICA - LABHUB UPN`,
    `Código: ${advisory.code}`,
    `Asesor: ${advisory.advisorName} (${advisory.advisorEmail})`,
    `Laboratorio: ${labName}`,
    `Proyecto: ${advisory.projectName}`,
    `Curso: ${advisory.course} (NRC: ${advisory.nrc})`,
    `Reserva de Laboratorio Vinculada: ${advisory.linkedReservationCode}`,
    ``,
    `Estudiantes Participantes:`,
    studentsList,
    advisory.topicNotes ? `\nMotivo / Consulta:\n${advisory.topicNotes}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    uid: advisory.id,
    title: `[LabHub UPN] Asesoría: ${advisory.projectName} (${advisory.code})`,
    description,
    location: labLocation,
    startDateIso: advisory.date,
    startBlockId: firstBlock,
    endBlockId: lastBlock,
    organizerEmail: 'laboratorios.ingenieria@upn.pe',
    attendeeEmail: advisory.advisorEmail,
    attendeeName: advisory.advisorName,
  };
}

/**
 * Construye los detalles de calendario a partir de una Reserva de Laboratorio
 */
export function buildReservationCalendarDetails(
  reservation: LabReservation
): CalendarEventDetails {
  const lab = LAB_MAP[reservation.labId];
  const labName = lab ? lab.name : reservation.labId;
  const labLocation = lab ? `${lab.name} - ${lab.location}` : 'Laboratorios de Ingeniería UPN';

  const sortedBlocks = [...reservation.blockIds].sort((a, b) => {
    return TIME_BLOCK_MAP[a].order - TIME_BLOCK_MAP[b].order;
  });
  const firstBlock = sortedBlocks[0];
  const lastBlock = sortedBlocks[sortedBlocks.length - 1];

  const participantsList = [
    `1. ${reservation.leadStudent.fullName} (${reservation.leadStudent.upnCode}) [Líder]`,
    ...reservation.participants.map(
      (p, i) => `${i + 2}. ${p.fullName} (${p.upnCode})`
    ),
  ].join('\n');

  const description = [
    `RESERVA DE LABORATORIO - LABHUB UPN`,
    `Código: ${reservation.code}`,
    `Laboratorio: ${labName}`,
    `Proyecto: ${reservation.projectName}`,
    `Carrera: ${reservation.career}`,
    `Curso: ${reservation.course} (NRC: ${reservation.nrc})`,
    ``,
    `Integrantes del Grupo:`,
    participantsList,
  ].join('\n');

  return {
    uid: reservation.id,
    title: `[LabHub UPN] Reserva ${labName}: ${reservation.projectName}`,
    description,
    location: labLocation,
    startDateIso: reservation.date,
    startBlockId: firstBlock,
    endBlockId: lastBlock,
    organizerEmail: 'laboratorios.ingenieria@upn.pe',
  };
}
