import {
  DayOfWeek,
  LabId,
  LaboratoryConfig,
  Print3DStatus,
  TimeBlockDefinition,
  TimeBlockId,
} from '@/types/labhub';

/**
 * Los 9 bloques horarios oficiales solicitados:
 * 07:30 - 09:00 | 09:10 - 10:40 | 10:50 - 12:20 | 12:30 - 14:00
 * 14:30 - 16:00 | 16:10 - 17:40 | 17:50 - 19:20 | 19:30 - 21:00 | 21:10 - 22:40
 */
export const TIME_BLOCKS: TimeBlockDefinition[] = [
  { id: 'B1', label: '07:30 - 09:00', startTime: '07:30', endTime: '09:00', order: 1 },
  { id: 'B2', label: '09:10 - 10:40', startTime: '09:10', endTime: '10:40', order: 2 },
  { id: 'B3', label: '10:50 - 12:20', startTime: '10:50', endTime: '12:20', order: 3 },
  { id: 'B4', label: '12:30 - 14:00', startTime: '12:30', endTime: '14:00', order: 4 },
  { id: 'B5', label: '14:30 - 16:00', startTime: '14:30', endTime: '16:00', order: 5 },
  { id: 'B6', label: '16:10 - 17:40', startTime: '16:10', endTime: '17:40', order: 6 },
  { id: 'B7', label: '17:50 - 19:20', startTime: '17:50', endTime: '19:20', order: 7 },
  { id: 'B8', label: '19:30 - 21:00', startTime: '19:30', endTime: '21:00', order: 8 },
  { id: 'B9', label: '21:10 - 22:40', startTime: '21:10', endTime: '22:40', order: 9 },
];

export const TIME_BLOCK_MAP: Record<TimeBlockId, TimeBlockDefinition> =
  TIME_BLOCKS.reduce(
    (acc, block) => {
      acc[block.id] = block;
      return acc;
    },
    {} as Record<TimeBlockId, TimeBlockDefinition>
  );

export const DAYS_OF_WEEK: { id: DayOfWeek; name: string; shortName: string }[] = [
  { id: 1, name: 'Lunes', shortName: 'Lun' },
  { id: 2, name: 'Martes', shortName: 'Mar' },
  { id: 3, name: 'Miércoles', shortName: 'Mié' },
  { id: 4, name: 'Jueves', shortName: 'Jue' },
  { id: 5, name: 'Viernes', shortName: 'Vie' },
  { id: 6, name: 'Sábado', shortName: 'Sáb' },
];

export const DEFAULT_LABORATORIES: LaboratoryConfig[] = [
  {
    id: 'automatizacion',
    name: 'Laboratorio de Automatización',
    shortName: 'Automatización',
    code: 'LAB-AUT',
    location: 'Pabellón B - Piso 2 (Aula B-210)',
    description:
      'Estaciones PLC Siemens S7-1200/1500, tableros neumáticos/electroneumáticos Festo, variadores de frecuencia y redes industriales SCADA.',
    maxSimultaneousGroups: 4,
    accentColor: '#f59e0b',
    equipmentHighlights: ['PLC Siemens S7', 'Módulos Festo', 'HMI & SCADA', 'Sensores Industriales'],
  },
  {
    id: 'electronica',
    name: 'Laboratorio de Electrónica',
    shortName: 'Electrónica',
    code: 'LAB-ELE',
    location: 'Pabellón B - Piso 2 (Aula B-209)',
    description:
      'Bancos instrumentados con osciloscopios digitales, fuentes DC duales, generadores de funciones, estaciones de soldadura SMD y sistemas embebidos.',
    maxSimultaneousGroups: 6,
    accentColor: '#0ea5e9',
    equipmentHighlights: ['Osciloscopios Digitales', 'Fuentes Reguladas Duales', 'Generadores RF', 'Estaciones SMD'],
  },
  {
    id: 'mecatronica',
    name: 'Laboratorio de Mecatrónica',
    shortName: 'Mecatrónica',
    code: 'LAB-MEC',
    location: 'Pabellón A - Piso 2 (Aula A-207)',
    description:
      'Celdas robóticas colaborativas, manufactura aditiva/CNC, prototipado mecatrónico integral, actuadores servocontrolados y visión artificial.',
    maxSimultaneousGroups: 4,
    accentColor: '#10b981',
    equipmentHighlights: ['Brazos Robóticos', 'Impresoras 3D & CNC', 'Sistemas de Visión', 'Control de Movimiento'],
  },
];

export const LAB_MAP: Record<LabId, LaboratoryConfig> = DEFAULT_LABORATORIES.reduce(
  (acc, lab) => {
    acc[lab.id] = lab;
    return acc;
  },
  {} as Record<LabId, LaboratoryConfig>
);

export const PRINT_3D_STATUSES: Print3DStatus[] = [
  'ENVIADO',
  'EN REVISION',
  'OBSERVADO',
  'EN COLA',
  'IMPRIMIENDO',
  'LISTA',
  'ENTREGADA',
];

export const OBSERVATION_WINDOW_HOURS = 72;

export const UPN_CAREERS: string[] = [
  'Ingeniería Mecatrónica',
  'Ingeniería Electrónica',
  'Ingeniería Industrial',
  'Ingeniería de Sistemas Computacionales',
  'Ingeniería Ambiental',
  'Ingeniería Civil',
  'Diseño Industrial',
  'Arquitectura y Diseño de Interiores',
];

export const ACADEMIC_CYCLES: string[] = [
  'Ciclo I',
  'Ciclo II',
  'Ciclo III',
  'Ciclo IV',
  'Ciclo V',
  'Ciclo VI',
  'Ciclo VII',
  'Ciclo VIII',
  'Ciclo IX',
  'Ciclo X',
];

export const DEFAULT_TEACHERS_CATALOG: string[] = [
  'Ing. Carlos Alberto Mendoza Ríos',
  'Dra. Elena Patricia Vargas Soto',
  'Mg. Roberto Javier Paredes Luna',
  'Ing. Luis Fernando Quispe Huamán',
  'Mg. Diana Carolina Salazar Torres',
  'Ing. Jorge Antonio Espinoza Vera',
  'Dr. Marco Antonio Villanueva Castro',
  'Ing. Gabriela Sofía Medina Paz',
  'Ing. Saldaña Milla Fernando Aristides',
  'Ing. Alayo Miguel Raul Fernando',
  'Ing. Araujo Castillo Lenin',
  'Ing. Gutierrez Magan Luis Mauricio',
  'Ing. León Cruz Kelly Lidia',
  'Ing. Rodriguez Ochoa Jairo Javier',
  'Ing. Romero Alvarado Juan Alfredo',
  'Ing. Manzano Ramos Edgar Andre',
  'Ing. León León Ryan Abraham',
  'Ing. Paredes Corcuera Edwin Danilo',
  'Ing. Grijalba Mauricio Jean Marco',
  'Ing. Peralta Lujan Jose Luis',
  'Ing. Mendoza Chomba Jorge Esteban',
  'Ing. Valqui Sipiran Alexanders',
  'Ing. De La Cruz Rodriguez Oscar Miguel',
  'Ing. Alfaro Bazan Pablo Martin',
  'Ing. Gomez Montes Juan Daniel',
  'Ing. Leon Soto Juan Carlos',
  'Ing. Hurtado Terranova Edwin Ricardo',
  'Ing. Rojas Arce Henry',
  'Ing. León Cerna Martín Aarón',
];

/**
 * Calcula las fechas (Lunes a Sábado) para `weekOffset = 0` (semana actual)
 * o `weekOffset = 1` (siguiente semana, máximo 2 semanas visibles).
 */
export function getWeekDaysForOffset(
  weekOffset: 0 | 1,
  referenceDate: Date = new Date()
): {
  weekStartDate: string;
  weekEndDate: string;
  days: { dayOfWeek: DayOfWeek; dayName: string; date: string }[];
} {
  const base = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const jsDay = base.getDay(); // 0 = Domingo, 1 = Lunes ... 6 = Sábado
  // Si es domingo (0), mostramos la semana que inicia mañana lunes para facilitar reservas universitarias
  const diffToMonday = jsDay === 0 ? 1 : 1 - jsDay;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMonday + weekOffset * 7);

  const days = DAYS_OF_WEEK.map((d, idx) => {
    const current = new Date(monday);
    current.setDate(monday.getDate() + idx);
    return {
      dayOfWeek: d.id,
      dayName: d.name,
      date: formatLocalIsoDate(current),
    };
  });

  return {
    weekStartDate: days[0].date,
    weekEndDate: days[days.length - 1].date,
    days,
  };
}

export function formatLocalIsoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

