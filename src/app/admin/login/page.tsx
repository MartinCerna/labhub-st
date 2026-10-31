'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck,
  User,
  Lock,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/shared/ToastProvider';

export default function AdminLoginPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Verificar si ya tiene sesión iniciada
  useEffect(() => {
    let isMounted = true;
    apiClient
      .getAdminSession()
      .then((res) => {
        if (isMounted && res.user) {
          router.replace('/admin');
        }
      })
      .catch(() => {
        // Ignorar error y permitir login
      })
      .finally(() => {
        if (isMounted) setCheckingSession(false);
      });

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const userToLogin = username.trim();
    const passToLogin = password.trim();

    if (!userToLogin || !passToLogin) {
      setErrorMessage('Por favor ingresa tu correo/usuario y contraseña.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await apiClient.adminLogin(userToLogin, passToLogin);
      showToast(`¡Bienvenido, ${res.user.fullName}!`, 'success');
      router.push('/admin');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Credenciales inválidas. Revisa tu usuario y contraseña.';
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#FDBA30] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Verificando sesión administrativa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[90vh] py-12 px-4 sm:px-6 lg:px-8 flex flex-col justify-center items-center bg-gradient-to-b from-[#212529]/5 via-white to-[#FDBA30]/10 dark:from-[#212529] dark:via-slate-900 dark:to-black">
      <div className="max-w-md w-full space-y-6">
        {/* Cabecera / Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#212529] via-[#000000] to-[#212529] border border-[#FDBA30]/40 text-[#FDBA30] shadow-lg shadow-black/20 mb-2">
            <ShieldCheck className="w-9 h-9" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Portal de Administración
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Control de Laboratorios de Ingeniería • UPN
          </p>
        </div>

        {/* Tarjeta del Formulario */}
        <div className="bg-white dark:bg-[#1a1e21] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 backdrop-blur-sm">
          {errorMessage && (
            <div
              role="alert"
              className="mb-6 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 flex items-start gap-3 text-sm animate-in fade-in"
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="leading-snug">{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="admin-username"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Correo Electrónico / Usuario
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="h-5 h-5" />
                </div>
                <input
                  id="admin-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ej. correo@ejemplo.com"
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FDBA30] focus:border-[#FDBA30] text-sm transition-all"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Contraseña
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-5 h-5" />
                </div>
                <input
                  id="admin-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FDBA30] focus:border-[#FDBA30] text-sm transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-slate-950 bg-[#FDBA30] hover:bg-[#e5a727] active:bg-[#c99220] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FDBA30] shadow-md shadow-[#FDBA30]/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Ingresando al sistema...</span>
                </>
              ) : (
                <>
                  <span>Iniciar Sesión Administrativa</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Enlace para volver al portal de alumnos */}
        <div className="text-center">
          <Link
            href="/"
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors underline underline-offset-4"
          >
            ← Volver al Portal Estudiantil de Laboratorios
          </Link>
        </div>
      </div>
    </div>
  );
}
