'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Eraser, PenLine, CheckCircle2 } from 'lucide-react';

export interface SignatureCanvasProps {
  value: string; // Base64 Data URL (image/png)
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
  label?: string;
}

export function SignatureCanvas({
  value,
  onChange,
  disabled = false,
  label = 'Firma Digital del Estudiante Responsable',
}: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDrawingRef = useRef(false);
  const hasStrokesRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(Boolean(value));

  // Inicialización y redibujado de alta densidad
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';

    // Si ya existe un valor dataUrl, lo dibujamos en el canvas
    if (value && value.startsWith('data:image')) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasSignature(true);
        hasStrokesRef.current = true;
      };
      img.src = value;
    } else {
      ctx.clearRect(0, 0, rect.width, rect.height);
      setHasSignature(false);
      hasStrokesRef.current = false;
    }
  }, [value]);

  useEffect(() => {
    setupCanvas();

    const handleResize = () => {
      // Redibujamos preservando si ya hay valor
      setupCanvas();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setupCanvas]);

  // Manejadores de dibujo con PointerEvents (soporte unificado Mouse + Pantallas Táctiles)
  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Fallback seguro si setPointerCapture falla
    }

    const { x, y } = getCoordinates(e);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);
    isDrawingRef.current = true;
    hasStrokesRef.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const finishDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || disabled) return;
    isDrawingRef.current = false;

    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignorar error al soltar captura
    }

    if (hasStrokesRef.current) {
      const dataUrl = canvas.toDataURL('image/png');
      setHasSignature(true);
      onChange(dataUrl);
    }
  };

  const handleClear = () => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, rect.width, rect.height);
    }

    isDrawingRef.current = false;
    hasStrokesRef.current = false;
    setHasSignature(false);
    onChange('');
  };

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <PenLine className="w-3.5 h-3.5 text-amber-500" />
          <span>{label}</span>
          <span className="text-rose-500 font-bold">*</span>
        </label>

        {hasSignature && !disabled && (
          <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Firma registrada</span>
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        className={`relative w-full h-44 rounded-xl border-2 transition-all ${
          disabled
            ? 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-90'
            : hasSignature
            ? 'bg-white border-slate-300 shadow-inner'
            : 'bg-white border-dashed border-slate-300 hover:border-amber-400'
        }`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrawing}
          onPointerLeave={finishDrawing}
          className={`w-full h-full block rounded-xl touch-none ${
            disabled ? 'cursor-not-allowed' : 'cursor-crosshair'
          }`}
          style={{ touchAction: 'none' }}
        />

        {/* Marca de agua e indicador de guía de firma si está vacío */}
        {!hasSignature && !disabled && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4 text-center">
            <p className="text-xs font-medium text-slate-400">
              Firme aquí con el mouse o pantalla táctil
            </p>
            <div className="w-48 h-px bg-slate-300 mt-6 relative">
              <span className="absolute -top-4 left-0 text-[11px] font-bold text-slate-400">
                X
              </span>
            </div>
          </div>
        )}

        {/* Botón flotante para limpiar */}
        {!disabled && hasSignature && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 rounded-lg shadow-2xs transition-colors"
            title="Borrar firma y firmar nuevamente"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>Limpiar firma</span>
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-500 leading-tight">
        {disabled
          ? 'Firma digital registrada en el acta de entrega.'
          : 'Al firmar, el estudiante asume la responsabilidad del cuidado y devolución oportuna del equipamiento.'}
      </p>
    </div>
  );
}
