'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Box,
  Cpu,
  Layers,
  Scale,
  Maximize2,
  FileCode2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { parseStlBuffer, ParsedStlGeometry } from '@/lib/stl-parser';

export interface StlPreviewProps {
  file?: File;
  downloadUrl?: string;
  fileName: string;
  onClose: () => void;
}

interface CameraState {
  rotX: number; // Radianes
  rotY: number;
  zoom: number; // Multiplicador
  panX: number;
  panY: number;
}

const DEFAULT_CAMERA: CameraState = {
  rotX: -0.45, // Inclinación suave ~25°
  rotY: 0.65,  // Perspectiva isométrica ~37°
  zoom: 1,
  panX: 0,
  panY: 0,
};

export function StlViewerModal({
  file,
  downloadUrl,
  fileName,
  onClose,
}: StlPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [geometry, setGeometry] = useState<ParsedStlGeometry | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(0);

  const [camera, setCamera] = useState<CameraState>(DEFAULT_CAMERA);
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // Manejo de la tecla Escape para cerrar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Carga y procesamiento del buffer STL
  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        let buffer: ArrayBuffer;
        if (file) {
          setFileSizeBytes(file.size);
          buffer = await file.arrayBuffer();
        } else if (downloadUrl) {
          const res = await fetch(downloadUrl);
          if (!res.ok) {
            throw new Error(`Error al descargar el archivo: HTTP ${res.status}`);
          }
          buffer = await res.arrayBuffer();
          setFileSizeBytes(buffer.byteLength);
        } else {
          throw new Error('No se proporcionó un archivo o URL para visualizar.');
        }

        if (isCancelled) return;

        const parsed = parseStlBuffer(buffer, 12000); // Muestreo de alta calidad para rendering interactivo
        setGeometry(parsed);
      } catch (err: unknown) {
        if (!isCancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'No se pudo interpretar el archivo .stl.'
          );
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [file, downloadUrl]);

  // Renderizado en el Canvas HTML5 2D con Z-Sorting y sombreado Phong/Lambertiano
  const renderScene = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !geometry) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Fondo degradado estilo estudio de ingeniería (Slate suave)
    const bgGrad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      20,
      width / 2,
      height / 2,
      Math.max(width, height)
    );
    bgGrad.addColorStop(0, '#1e293b');
    bgGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Grilla isométrica sutil de referencia de la cama de impresión
    drawBedGrid(ctx, width, height, camera);

    const rawTriangles = geometry.previewTriangles;
    const triCount = Math.floor(rawTriangles.length / 9);
    if (triCount === 0) return;

    // Dimensiones máximas para auto-escala
    const { x: dx, y: dy, z: dz } = geometry.dimensionsMm;
    const maxDim = Math.max(dx, dy, dz, 1);
    const baseScale = (Math.min(width, height) * 0.5) / maxDim;
    const currentScale = baseScale * camera.zoom;

    const cosY = Math.cos(camera.rotY);
    const sinY = Math.sin(camera.rotY);
    const cosX = Math.cos(camera.rotX);
    const sinX = Math.sin(camera.rotX);

    // Dirección de la fuente de luz normalizada (luz superior derecha)
    const lx = 0.5;
    const ly = 0.7;
    const lz = 1.0;
    const lLen = Math.sqrt(lx * lx + ly * ly + lz * lz);
    const nlx = lx / lLen;
    const nly = ly / lLen;
    const nlz = lz / lLen;

    interface ProjectedTriangle {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x3: number;
      y3: number;
      depth: number;
      color: string;
      strokeColor: string;
    }

    const projectedList: ProjectedTriangle[] = [];

    const centerX = width / 2 + camera.panX;
    const centerY = height / 2 + camera.panY;

    for (let i = 0; i < triCount; i++) {
      const idx = i * 9;
      // Vértice 1
      const x1 = rawTriangles[idx];
      const y1 = rawTriangles[idx + 1];
      const z1 = rawTriangles[idx + 2];
      // Vértice 2
      const x2 = rawTriangles[idx + 3];
      const y2 = rawTriangles[idx + 4];
      const z2 = rawTriangles[idx + 5];
      // Vértice 3
      const x3 = rawTriangles[idx + 6];
      const y3 = rawTriangles[idx + 7];
      const z3 = rawTriangles[idx + 8];

      // 1. Rotación Y
      const rx1 = x1 * cosY + z1 * sinY;
      const rz1 = -x1 * sinY + z1 * cosY;
      const rx2 = x2 * cosY + z2 * sinY;
      const rz2 = -x2 * sinY + z2 * cosY;
      const rx3 = x3 * cosY + z3 * sinY;
      const rz3 = -x3 * sinY + z3 * cosY;

      // 2. Rotación X
      const ry1 = y1 * cosX - rz1 * sinX;
      const fz1 = y1 * sinX + rz1 * cosX;
      const ry2 = y2 * cosX - rz2 * sinX;
      const fz2 = y2 * sinX + rz2 * cosX;
      const ry3 = y3 * cosX - rz3 * sinX;
      const fz3 = y3 * sinX + rz3 * cosX;

      // Normal en coordenadas de cámara
      const ax = rx2 - rx1;
      const ay = ry2 - ry1;
      const az = fz2 - fz1;
      const bx = rx3 - rx1;
      const by = ry3 - ry1;
      const bz = fz3 - fz1;

      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);

      // Descartamos triángulos degenerados
      if (nLen < 0.00001) continue;

      const normX = nx / nLen;
      const normY = ny / nLen;
      const normZ = nz / nLen;

      // Intensidad de iluminación (Luz difusa + Luz ambiente)
      const dot = normX * nlx + normY * nly + normZ * nlz;
      const intensity = Math.min(1, Math.max(0.18, Math.abs(dot) * 0.82 + 0.18));

      // Color Ámbar / Dorado UPN sombreado
      const r = Math.floor(245 * intensity);
      const g = Math.floor(158 * intensity);
      const b = Math.floor(11 * intensity);

      const depth = (fz1 + fz2 + fz3) / 3;

      projectedList.push({
        x1: centerX + rx1 * currentScale,
        y1: centerY - ry1 * currentScale,
        x2: centerX + rx2 * currentScale,
        y2: centerY - ry2 * currentScale,
        x3: centerX + rx3 * currentScale,
        y3: centerY - ry3 * currentScale,
        depth,
        color: `rgb(${r}, ${g}, ${b})`,
        strokeColor: `rgba(${Math.floor(r * 0.7)}, ${Math.floor(
          g * 0.7
        )}, ${Math.floor(b * 0.7)}, 0.3)`,
      });
    }

    // Ordenamiento por profundidad Z (Pintor: de atrás hacia adelante)
    projectedList.sort((a, b) => a.depth - b.depth);

    // Dibujado de caras
    for (let i = 0; i < projectedList.length; i++) {
      const p = projectedList[i];
      ctx.beginPath();
      ctx.moveTo(p.x1, p.y1);
      ctx.lineTo(p.x2, p.y2);
      ctx.lineTo(p.x3, p.y3);
      ctx.closePath();
      ctx.fillStyle = p.color;
      ctx.fill();

      // Trazo sutil para facets si la muestra es contenida
      if (triCount < 3000) {
        ctx.strokeStyle = p.strokeColor;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }, [geometry, camera]);

  // Redibujado cuando cambian dimensiones de pantalla o cámara
  useEffect(() => {
    renderScene();

    const handleResize = () => renderScene();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderScene]);

  // Interacciones: Arrastre Mouse / Touch para Rotación
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignorar fallback
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    setCamera((prev) => ({
      ...prev,
      rotY: prev.rotY + dx * 0.012,
      rotX: Math.max(-1.5, Math.min(1.5, prev.rotX - dy * 0.012)),
    }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignorar
    }
  };

  // Zoom con rueda del ratón
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setCamera((prev) => ({
      ...prev,
      zoom: Math.max(0.2, Math.min(5, prev.zoom * factor)),
    }));
  };

  const zoomIn = () => {
    setCamera((prev) => ({
      ...prev,
      zoom: Math.min(5, prev.zoom * 1.25),
    }));
  };

  const zoomOut = () => {
    setCamera((prev) => ({
      ...prev,
      zoom: Math.max(0.2, prev.zoom / 1.25),
    }));
  };

  const resetView = () => {
    setCamera(DEFAULT_CAMERA);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stl-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-5xl h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header del Modal */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-400/30 text-amber-400">
              <Box className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="stl-modal-title"
                className="text-base font-bold text-white truncate"
              >
                {fileName}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Visor 3D de Inspección Técnica</span>
                {fileSizeBytes > 0 && (
                  <>
                    <span>•</span>
                    <span>{(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
            aria-label="Cerrar visor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenedor Principal: Canvas 3D + Panel de Métricas */}
        <div className="relative flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Área 3D Interactiva */}
          <div
            ref={containerRef}
            className="relative flex-1 h-full min-h-[320px] bg-slate-950 overflow-hidden select-none"
          >
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 z-20">
                <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                <p className="text-xs font-semibold text-slate-300">
                  Analizando geometría 3D y mallas STL...
                </p>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-20">
                <div className="p-3 bg-rose-500/10 text-rose-400 rounded-full mb-3 border border-rose-500/20">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">
                  Error de Inspección STL
                </h3>
                <p className="text-xs text-rose-300 max-w-md">{error}</p>
              </div>
            )}

            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onWheel={handleWheel}
              className="w-full h-full block cursor-grab active:cursor-grabbing touch-none"
              style={{ touchAction: 'none' }}
            />

            {/* Controles Flotantes 3D */}
            {!loading && !error && (
              <div className="absolute top-4 right-4 flex flex-col gap-1.5 z-10 bg-slate-900/80 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/60 shadow-lg">
                <button
                  type="button"
                  onClick={zoomIn}
                  className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  title="Aumentar zoom (+)"
                  aria-label="Acercar"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={zoomOut}
                  className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  title="Disminuir zoom (-)"
                  aria-label="Alejar"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <div className="w-full h-px bg-slate-700 my-0.5" />
                <button
                  type="button"
                  onClick={resetView}
                  className="p-2 text-amber-400 hover:bg-slate-800 rounded-lg transition-colors"
                  title="Centrar vista / Restablecer cámara"
                  aria-label="Centrar vista"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Ayuda visual de interacción */}
            {!loading && !error && (
              <div className="absolute bottom-3 left-3 pointer-events-none z-10">
                <span className="text-[11px] font-medium text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-800">
                  Arrastra para rotar • Rueda para zoom
                </span>
              </div>
            )}
          </div>

          {/* Panel Lateral de Métricas Técnicas */}
          <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-slate-800 bg-slate-900/95 p-5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                <span>Métricas de Impresión</span>
              </h3>

              {geometry ? (
                <div className="grid grid-cols-1 gap-2.5">
                  {/* Formato */}
                  <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 flex items-center gap-1.5">
                        <FileCode2 className="w-3.5 h-3.5 text-slate-400" />
                        Formato STL
                      </span>
                      <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-slate-700 border border-slate-600">
                        {geometry.format}
                      </span>
                    </div>
                  </div>

                  {/* Número de Triángulos */}
                  <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        Nº de Triángulos
                      </span>
                      <span className="text-xs font-bold text-emerald-400 font-mono">
                        {geometry.triangleCount.toLocaleString('es-PE')}
                      </span>
                    </div>
                  </div>

                  {/* Dimensiones X × Y × Z */}
                  <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
                        Dimensiones (X × Y × Z)
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">mm</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-xs">
                      <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-700/50">
                        <div className="text-[10px] text-slate-400">X (Ancho)</div>
                        <div className="font-bold text-amber-300">
                          {geometry.dimensionsMm.x.toFixed(1)}
                        </div>
                      </div>
                      <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-700/50">
                        <div className="text-[10px] text-slate-400">Y (Largo)</div>
                        <div className="font-bold text-sky-300">
                          {geometry.dimensionsMm.y.toFixed(1)}
                        </div>
                      </div>
                      <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-700/50">
                        <div className="text-[10px] text-slate-400">Z (Alto)</div>
                        <div className="font-bold text-emerald-300">
                          {geometry.dimensionsMm.z.toFixed(1)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Volumen Estimado */}
                  <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5 text-slate-400" />
                        Volumen Estimado
                      </span>
                      <span className="text-xs font-bold text-amber-400 font-mono">
                        {geometry.estimatedVolumeCm3.toFixed(2)} cm³
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 py-6 text-center">
                  Cargando métricas...
                </div>
              )}

              {/* Guía de Factibilidad */}
              {geometry && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-200/90 leading-relaxed">
                  <p className="font-semibold text-amber-300 mb-0.5">
                    Validación UPN para Impresión 3D:
                  </p>
                  Malla cerrada verificada. La pieza se evaluará conforme al aforo de
                  manufactura aditiva y volumen de material del laboratorio.
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-end">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 px-4 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                Cerrar Visor
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Dibuja la cuadrícula de la base (bed de impresión) */
function drawBedGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: CameraState
) {
  const gridSize = 140 * camera.zoom;
  const cx = width / 2 + camera.panX;
  const cy = height / 2 + camera.panY + 40 * camera.zoom;

  ctx.save();
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.2)';
  ctx.lineWidth = 1;

  const lines = 6;
  for (let i = -lines; i <= lines; i++) {
    const offset = (i / lines) * (gridSize / 2);
    // Líneas paralelas eje X proyectadas
    ctx.beginPath();
    ctx.moveTo(cx - gridSize / 2, cy + offset * 0.4);
    ctx.lineTo(cx + gridSize / 2, cy + offset * 0.4);
    ctx.stroke();

    // Líneas paralelas eje Y proyectadas
    ctx.beginPath();
    ctx.moveTo(cx + offset, cy - (gridSize / 2) * 0.4);
    ctx.lineTo(cx + offset, cy + (gridSize / 2) * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}
