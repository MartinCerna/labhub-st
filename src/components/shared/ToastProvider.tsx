'use client';

import React, { createContext, useContext, useState, useCallback, useId } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe ser utilizado dentro de un ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast: ToastItem = { id, message, type };

      setToasts((prev) => [...prev, newToast]);

      // Autocierre en 4.5 segundos
      setTimeout(() => {
        removeToast(id);
      }, 4500);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        role="region"
        aria-live="polite"
        aria-label="Notificaciones del sistema"
        className="toast-container fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-lg border backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-3 ${getToastStyle(
              toast.type
            )}`}
          >
            <div className="shrink-0 mt-0.5">{getToastIcon(toast.type)}</div>
            <p className="text-sm font-medium leading-relaxed flex-1 break-words">
              {toast.message}
            </p>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-black/5 transition-colors"
              aria-label="Cerrar notificación"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function getToastStyle(type: ToastType): string {
  switch (type) {
    case 'success':
      return 'bg-emerald-50/95 border-emerald-200 text-emerald-900 shadow-emerald-500/10';
    case 'error':
      return 'bg-rose-50/95 border-rose-200 text-rose-900 shadow-rose-500/10';
    case 'warning':
      return 'bg-amber-50/95 border-amber-200 text-amber-900 shadow-amber-500/10';
    case 'info':
    default:
      return 'bg-slate-900/95 border-slate-800 text-white shadow-slate-900/20';
  }
}

function getToastIcon(type: ToastType) {
  switch (type) {
    case 'success':
      return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
    case 'error':
      return <AlertCircle className="w-5 h-5 text-rose-600" />;
    case 'warning':
      return <AlertTriangle className="w-5 h-5 text-amber-600" />;
    case 'info':
    default:
      return <Info className="w-5 h-5 text-sky-400" />;
  }
}
