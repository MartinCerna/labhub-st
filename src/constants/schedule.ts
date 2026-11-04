import {
  DayOfWeek,
  LabEquipmentCatalogItem,
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
      'Controladores PLC Schneider Twido y Zelio, tableros de control industrial, contactores, variadores de frecuencia y componentes neumáticos.',
    maxSimultaneousGroups: 4,
    accentColor: '#f59e0b',
    equipmentHighlights: ['PLC Schneider Twido/Zelio', 'Variadores de Velocidad', 'Contactores y Disyuntores', 'Pistones Neumáticos'],
  },
  {
    id: 'electronica',
    name: 'Laboratorio de Electrónica',
    shortName: 'Electrónica',
    code: 'LAB-ELE',
    location: 'Pabellón B - Piso 2 (Aula B-209)',
    description:
      'Bancos de trabajo con kits de entrenamiento en microcontroladores Microchip, tarjetas FPGA Terasic, sistemas embebidos y estaciones de soldadura.',
    maxSimultaneousGroups: 6,
    accentColor: '#0ea5e9',
    equipmentHighlights: ['Kits Microcontroladores PIC', 'FPGA DE0-CV Terasic', 'Arduino & Raspberry Pi', 'Estaciones de Soldadura'],
  },
  {
    id: 'mecatronica',
    name: 'Laboratorio de Mecatrónica',
    shortName: 'Mecatrónica',
    code: 'LAB-MEC',
    location: 'Pabellón A - Piso 2 (Aula A-207)',
    description:
      'Prototipado mecatrónico integral, kits de robótica móvil Arduino 4WD y kits de microcontroladores Microchip CNANO.',
    maxSimultaneousGroups: 4,
    accentColor: '#10b981',
    equipmentHighlights: ['Kits Robótica LAFVIN 4WD', 'Kits Microchip CNANO', 'Prototipado Mecatrónico', 'Sistemas Embebidos'],
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

export const OBSERVATION_WINDOW_HOURS = 48;
export const ADVISORY_ALLOWED_BLOCKS: TimeBlockId[] = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7'];
export const MAX_PRINT_3D_DIMENSION_MM = 200; // 20 x 20 x 20 cm

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
  'Alejandro Martín León Cerna',
  'Alexanders Valqui Sipiran',
  'Edgar Andre Manzano Ramos',
  'Edwin Danilo Paredes Corcuera',
  'Edwin Raul Mendoza Torres',
  'Edwin Ricardo Hurtado Terranova',
  'Fernando Aristides Saldaña Milla',
  'Henry Rojas Arce',
  'Jairo Javier Rodriguez Ochoa',
  'Jean Marco Grijalba Mauricio',
  'Jorge Esteban Mendoza Chomba',
  'Jose Luis Peralta Lujan',
  'Juan Alfredo Romero Alvarado',
  'Juan Carlos Leon Soto',
  'Kelly Lidia León Cruz',
  'Lenin Araujo Castillo',
  'Luis Mauricio Gutierrez Magan',
  'Nelson Antonio Angeles Quiñones',
  'Oscar Miguel de la Cruz Rodriguez',
  'Raul Fernando Alayo Miguel',
  'Rolando Javier Berru Beltran',
  'Ryan Abraham Leon Leon',
  'Walter Cueva Chavez',
];

export const SAFETY_PROTOCOL_YOUTUBE_URL =
  process.env.NEXT_PUBLIC_SAFETY_PROTOCOL_YOUTUBE_URL ||
  'https://www.youtube.com/results?search_query=Protocolo+de+Seguridad+Laboratorios+UPN';

export const UPN_LAB_COURSES: string[] = [
  'Arquitectura del Computador',
  'Circuitos Digitales 2',
  'Circuitos Eléctricos',
  'Circuitos Eléctricos 2',
  'Circuitos y Sistemas Digitales',
  'Dispositivos Electrónicos',
  'Electrohidráulica y Electroneumática',
  'Electrónica Digital',
  'Ingeniería de Control',
  'Ingeniería de Control 2',
  'Ingeniería de Procesos Industriales',
  'Ingeniería Eléctrica y Automatización',
  'Instrumentación Industrial',
  'Inteligencia Artificial y Sistemas Expertos',
  'Introducción a la Ingeniería Electrónica',
  'Introducción a la Ingeniería Mecatrónica',
  'Manufactura Asistida por Computadora',
  'Máquinas Eléctricas',
  'Medios de Transmisión y Antenas',
  'Microprocesadores y Microcontroladores',
  'Procesamiento de Señales',
  'Procesamiento de Señales Ing. Electrónica',
  'Redes 1',
  'Redes 2',
  'Robótica',
  'Taller de Robótica',
  'Telecomunicaciones 2',
];

/**
 * Inventario oficial de equipos por laboratorio extraído de los registros ISO 21001:
 * - SL03LA08 Laboratorio de Electrónica
 * - SL03LA25 Laboratorio de Mecatrónica
 * - SL03LA09 Laboratorio de Automatización
 */
export const LAB_EQUIPMENT_CATALOG: Record<LabId, LabEquipmentCatalogItem[]> = {
  electronica: [
    { name: 'Kit de Entrenamiento en Microcontroladores (Microchip AC164162)', brand: 'MICROCHIP', model: 'AC164162', totalUnits: 10, sampleCodes: ['4-001358', '4-001354', '4-001352'] },
    { name: 'Tarjeta DAQ USB National Instruments 6008', brand: 'NATIONAL INSTRUMENTS', model: '6008', totalUnits: 10, sampleCodes: ['1-016534', '1-016535', '1-016536'] },
    { name: 'Tarjeta Raspberry Pi', brand: 'RASPBERRY PI', model: 'RPi', totalUnits: 6, sampleCodes: ['S/C'] },
    { name: 'Programador de Microcontrolador PIC (Microchip PICkit 4)', brand: 'MICROCHIP', model: 'PICKIT 4', totalUnits: 4, sampleCodes: ['S/C'] },
    { name: 'Protoboard 800 Puntos', brand: 'GENÉRICO', model: '800P', totalUnits: 10, sampleCodes: ['S/C'] },
    { name: 'Tarjeta de Desarrollo FPGA DE0-CV (Terasic)', brand: 'TERASIC', model: 'DE0-CV', totalUnits: 4, sampleCodes: ['4-000560', '4-001233', '4-001234'] },
    { name: 'Tarjeta de Desarrollo FPGA DE2 (Terasic)', brand: 'TERASIC', model: 'DE2', totalUnits: 1, sampleCodes: ['4-000021'] },
    { name: 'Tarjeta Arduino UNO', brand: 'ARDUINO', model: 'UNO', totalUnits: 8, sampleCodes: ['S/C'] },
  ],
  mecatronica: [
    { name: 'Kit de Entrenamiento en Microcontroladores (Microchip CNANO DM182028)', brand: 'MICROCHIP', model: 'CNANO DM182028', totalUnits: 8, sampleCodes: ['4-000979', '4-000974', '4-000975', '4-000976', '4-000977', '4-000978', '4-000980', '4-000981'] },
    { name: 'Kit de Entrenamiento en Robótica Arduino (LAFVIN 4WD Smart Robot Car)', brand: 'LAFVIN', model: '4WD Smart Robot Car', totalUnits: 8, sampleCodes: ['S/C'] },
  ],
  automatizacion: [
    { name: 'Controlador PLC Twido (Schneider Electric TWDLCAE40DRF)', brand: 'SCHNEIDER ELECTRIC', model: 'TWDLCAE40DRF', totalUnits: 9, sampleCodes: ['1-020339', '1-020340', '1-020341'] },
    { name: 'Controlador Lógico Zelio (Schneider Electric SR3B101BD)', brand: 'SCHNEIDER ELECTRIC', model: 'ZELIO SR3B101BD', totalUnits: 6, sampleCodes: ['PEO856627', 'PEO858649', 'PEO858449'] },
    { name: 'Relé Industrial (Schneider Electric)', brand: 'SCHNEIDER ELECTRIC', model: 'RELE', totalUnits: 7, sampleCodes: ['1-020355', '1-020356', '1-020357'] },
    { name: 'Relé - Interruptor (Schneider Electric 06ATEX0036X)', brand: 'SCHNEIDER ELECTRIC', model: '06ATEX0036X', totalUnits: 5, sampleCodes: ['1-020370', '1-020372', '1-020376'] },
    { name: 'Disyuntor Magnetotérmico (Schneider Electric GV2ME20)', brand: 'SCHNEIDER ELECTRIC', model: 'GV2ME20', totalUnits: 11, sampleCodes: ['1-020336', '1-020337', '1-020338'] },
    { name: 'Contactor (Schneider Electric 7891341329584)', brand: 'SCHNEIDER ELECTRIC', model: '7891341329584', totalUnits: 9, sampleCodes: ['1-020334', '1-020367', '1-020368'] },
    { name: 'Temporizador Equipo RE8 (Schneider Electric RF8YA32FU)', brand: 'SCHNEIDER ELECTRIC', model: 'RF8YA32FU', totalUnits: 4, sampleCodes: ['1-009580', '1-009582', '1-020360'] },
    { name: 'Módem GSM (Schneider Electric)', brand: 'SCHNEIDER ELECTRIC', model: 'MODEM GSM', totalUnits: 4, sampleCodes: ['1-020319', '1-020378', '1-020379'] },
    { name: 'Variador de Velocidad Altivar (Schneider Electric)', brand: 'SCHNEIDER ELECTRIC', model: 'ALTIVAR', totalUnits: 4, sampleCodes: ['1-009569', '1-009570', '1-009571'] },
    { name: 'Módulo PLC Modicon Analog (TM2AMM3HT)', brand: 'SCHNEIDER ELECTRIC', model: 'TM2AMM3HT', totalUnits: 6, sampleCodes: ['1-020351', '1-020352', '1-020353'] },
    { name: 'Regulador Neumático Micro QBS 4', brand: 'MICRO', model: '101000864', totalUnits: 3, sampleCodes: ['1-009430', '1-009431', '1-009434'] },
    { name: 'Válvula Neumática Micro Automación', brand: 'MICRO AUTOMACIÓN', model: 'VALVULA', totalUnits: 10, sampleCodes: ['1-009583', '1-009584', '1-009585'] },
    { name: 'Fuente de Alimentación Modular (Schneider Electric)', brand: 'SCHNEIDER ELECTRIC', model: 'MODULAR', totalUnits: 7, sampleCodes: ['S/C'] },
    { name: 'Dispositivo de Adquisición de Datos NI USB / NI USB 6008', brand: 'NATIONAL INSTRUMENTS', model: 'USB 6008', totalUnits: 7, sampleCodes: ['S/C'] },
    { name: 'Estación Completa de Control - Botonera (Schneider Electric)', brand: 'SCHNEIDER ELECTRIC', model: 'BOTONERA', totalUnits: 6, sampleCodes: ['1-020345', '1-020346', '1-020347'] },
    { name: 'Detector de Proximidad Inductivo/Capacitivo', brand: 'GENÉRICO', model: 'PROXIMIDAD', totalUnits: 2, sampleCodes: ['S/C'] },
    { name: 'Pistones Neumáticos (Micro MD8)', brand: 'MICRO', model: 'MD8', totalUnits: 14, sampleCodes: ['1-009542', '1-009543', '1-009544'] },
    { name: 'Contactor / Interruptor / Relé Térmico Siemens Sirius', brand: 'SIEMENS', model: 'SIRIUS', totalUnits: 9, sampleCodes: ['S/C'] },
    { name: 'Panel HMI Operator Interface OP3 (Siemens)', brand: 'SIEMENS', model: 'OP3', totalUnits: 1, sampleCodes: ['S/C'] },
    { name: 'Variador Sinamics G110 + Motor Siemens', brand: 'SIEMENS', model: 'SINAMICS G110', totalUnits: 2, sampleCodes: ['S/C'] },
  ],
};

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

