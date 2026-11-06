// ============================================================================
// PARSER Y VALIDADOR DE ARCHIVOS .STL (BINARIO Y ASCII)
// Uso compartido entre Backend (validación y metadatos) y Frontend
// ============================================================================

export const MAX_PRINTER_DIMENSION_MM = 200;
export const MAX_PRINT_WEIGHT_MB = 500;
export const MAX_PRINT_WEIGHT_BYTES = MAX_PRINT_WEIGHT_MB * 1024 * 1024; // 524,288,000 bytes
export const STL_WEIGHT_LIMIT_ERROR_MESSAGE =
  'El peso de los archivos excede el límite de 500 MB. Recuerda que las dimensiones máximas son 200 × 200 × 200 mm. En caso tus archivos sí cumplan con ello, procede a realizar dos envíos por separado de tus archivos, ya que exceden el límite de peso por solicitud.';

export function exceedsMaxPrintWeight(totalBytes: number): boolean {
  return totalBytes > MAX_PRINT_WEIGHT_BYTES;
}

export function exceedsMaxPrinterDimensions(
  dimensionsMm: { x: number; y: number; z: number },
  limitMm = MAX_PRINTER_DIMENSION_MM
): boolean {
  return (
    dimensionsMm.x > limitMm ||
    dimensionsMm.y > limitMm ||
    dimensionsMm.z > limitMm
  );
}

export interface ParsedStlGeometry {
  format: 'BINARY' | 'ASCII';
  triangleCount: number;
  dimensionsMm: {
    x: number;
    y: number;
    z: number;
  };
  estimatedVolumeCm3: number;
  /** Lista plana de triángulos [x1,y1,z1, x2,y2,z2, x3,y3,z3, ...] muestreada para renderizado opcional */
  previewTriangles: Float32Array;
}

export function validateStlFileName(fileName: string): boolean {
  return typeof fileName === 'string' && fileName.trim().toLowerCase().endsWith('.stl');
}

export function parseStlBuffer(
  arrayBuffer: ArrayBuffer,
  maxPreviewTriangles = 0
): ParsedStlGeometry {
  if (!arrayBuffer || arrayBuffer.byteLength < 15) {
    throw new Error('El archivo .stl está vacío o corrupto.');
  }

  const view = new DataView(arrayBuffer);
  // Verificamos si corresponde a un STL binario exacto: 80 bytes cabecera + 4 bytes uint32 + N * 50 bytes
  if (arrayBuffer.byteLength >= 84) {
    const expectedTriCount = view.getUint32(80, true);
    const expectedByteLength = 84 + expectedTriCount * 50;
    if (
      expectedTriCount > 0 &&
      expectedTriCount < 5_000_000 &&
      expectedByteLength === arrayBuffer.byteLength
    ) {
      return parseBinaryStl(view, expectedTriCount, maxPreviewTriangles);
    }
  }

  // Intentamos parsear como ASCII STL
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const text = decoder.decode(arrayBuffer);
  if (text.toLowerCase().includes('solid') && text.toLowerCase().includes('vertex')) {
    return parseAsciiStl(text, maxPreviewTriangles);
  }

  // Fallback binario tolerante cuando exportadores añaden bytes extra al final
  if (arrayBuffer.byteLength >= 134) {
    const rawCount = view.getUint32(80, true);
    const availableCount = Math.floor((arrayBuffer.byteLength - 84) / 50);
    const count = Math.min(rawCount, availableCount);
    if (count > 0) {
      return parseBinaryStl(view, count, maxPreviewTriangles);
    }
  }

  throw new Error('El contenido del archivo no corresponde a una malla .stl válida.');
}

function parseBinaryStl(
  view: DataView,
  triangleCount: number,
  maxPreviewTriangles: number
): ParsedStlGeometry {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  let signedVolumeMm3 = 0;

  const shouldSample = maxPreviewTriangles > 0;
  const stride = shouldSample ? Math.max(1, Math.ceil(triangleCount / maxPreviewTriangles)) : 0;
  const sampledCount = shouldSample ? Math.ceil(triangleCount / stride) : 0;
  const previewTriangles = shouldSample ? new Float32Array(sampledCount * 9) : new Float32Array(0);
  let pIdx = 0;

  for (let i = 0; i < triangleCount; i++) {
    const offset = 84 + i * 50;
    // Saltamos la normal (12 bytes) y leemos 3 vértices (36 bytes)
    const x1 = view.getFloat32(offset + 12, true);
    const y1 = view.getFloat32(offset + 16, true);
    const z1 = view.getFloat32(offset + 20, true);

    const x2 = view.getFloat32(offset + 24, true);
    const y2 = view.getFloat32(offset + 28, true);
    const z2 = view.getFloat32(offset + 32, true);

    const x3 = view.getFloat32(offset + 36, true);
    const y3 = view.getFloat32(offset + 40, true);
    const z3 = view.getFloat32(offset + 44, true);

    if (x1 < minX) minX = x1;
    if (x2 < minX) minX = x2;
    if (x3 < minX) minX = x3;
    if (x1 > maxX) maxX = x1;
    if (x2 > maxX) maxX = x2;
    if (x3 > maxX) maxX = x3;

    if (y1 < minY) minY = y1;
    if (y2 < minY) minY = y2;
    if (y3 < minY) minY = y3;
    if (y1 > maxY) maxY = y1;
    if (y2 > maxY) maxY = y2;
    if (y3 > maxY) maxY = y3;

    if (z1 < minZ) minZ = z1;
    if (z2 < minZ) minZ = z2;
    if (z3 < minZ) minZ = z3;
    if (z1 > maxZ) maxZ = z1;
    if (z2 > maxZ) maxZ = z2;
    if (z3 > maxZ) maxZ = z3;

    // Volumen con signo del tetraedro respecto al origen
    signedVolumeMm3 +=
      (x1 * (y2 * z3 - y3 * z2) -
        x2 * (y1 * z3 - y3 * z1) +
        x3 * (y1 * z2 - y2 * z1)) /
      6.0;

    if (shouldSample && i % stride === 0 && pIdx + 8 < previewTriangles.length) {
      previewTriangles[pIdx++] = x1;
      previewTriangles[pIdx++] = y1;
      previewTriangles[pIdx++] = z1;
      previewTriangles[pIdx++] = x2;
      previewTriangles[pIdx++] = y2;
      previewTriangles[pIdx++] = z2;
      previewTriangles[pIdx++] = x3;
      previewTriangles[pIdx++] = y3;
      previewTriangles[pIdx++] = z3;
    }
  }

  return buildResult(
    'BINARY',
    triangleCount,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    signedVolumeMm3,
    shouldSample ? previewTriangles.subarray(0, pIdx) : previewTriangles
  );
}

function parseAsciiStl(
  text: string,
  maxPreviewTriangles: number
): ParsedStlGeometry {
  const vertexRegex =
    /vertex\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)/gi;

  const coords: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = vertexRegex.exec(text)) !== null) {
    coords.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
  }

  const triangleCount = Math.floor(coords.length / 9);
  if (triangleCount === 0) {
    throw new Error('No se encontraron triángulos válidos en el archivo ASCII .stl.');
  }

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  let signedVolumeMm3 = 0;

  const shouldSample = maxPreviewTriangles > 0;
  const stride = shouldSample ? Math.max(1, Math.ceil(triangleCount / maxPreviewTriangles)) : 0;
  const previewList: number[] = [];

  for (let i = 0; i < triangleCount; i++) {
    const base = i * 9;
    const x1 = coords[base],
      y1 = coords[base + 1],
      z1 = coords[base + 2];
    const x2 = coords[base + 3],
      y2 = coords[base + 4],
      z2 = coords[base + 5];
    const x3 = coords[base + 6],
      y3 = coords[base + 7],
      z3 = coords[base + 8];

    minX = Math.min(minX, x1, x2, x3);
    maxX = Math.max(maxX, x1, x2, x3);
    minY = Math.min(minY, y1, y2, y3);
    maxY = Math.max(maxY, y1, y2, y3);
    minZ = Math.min(minZ, z1, z2, z3);
    maxZ = Math.max(maxZ, z1, z2, z3);

    signedVolumeMm3 +=
      (x1 * (y2 * z3 - y3 * z2) -
        x2 * (y1 * z3 - y3 * z1) +
        x3 * (y1 * z2 - y2 * z1)) /
      6.0;

    if (shouldSample && i % stride === 0) {
      previewList.push(x1, y1, z1, x2, y2, z2, x3, y3, z3);
    }
  }

  return buildResult(
    'ASCII',
    triangleCount,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    signedVolumeMm3,
    shouldSample ? new Float32Array(previewList) : new Float32Array(0)
  );
}

function buildResult(
  format: 'BINARY' | 'ASCII',
  triangleCount: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  signedVolumeMm3: number,
  previewTriangles: Float32Array
): ParsedStlGeometry {
  const dx = Number.isFinite(maxX - minX) ? Math.max(0, +(maxX - minX).toFixed(2)) : 0;
  const dy = Number.isFinite(maxY - minY) ? Math.max(0, +(maxY - minY).toFixed(2)) : 0;
  const dz = Number.isFinite(maxZ - minZ) ? Math.max(0, +(maxZ - minZ).toFixed(2)) : 0;
  // 1 cm³ = 1000 mm³
  const volumeCm3 = Math.max(0.01, +(Math.abs(signedVolumeMm3) / 1000).toFixed(2));

  return {
    format,
    triangleCount,
    dimensionsMm: { x: dx, y: dy, z: dz },
    estimatedVolumeCm3: volumeCm3,
    previewTriangles,
  };
}

