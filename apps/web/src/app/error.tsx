'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

/**
 * Error boundary global del App Router de Next.js.
 * Captura cualquier excepcion no controlada dentro del arbol de rutas
 * y la envia a Sentry (solo en produccion, segun sentry.client.config.ts).
 *
 * Se activa para errores que ocurren dentro del layout raiz.
 * Para errores en el propio layout raiz, ver global-error.tsx.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Algo salió mal</h2>
        <p className="mt-2 text-sm text-slate-500">
          Ocurrió un error inesperado. El equipo ya fue notificado automáticamente.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-slate-400">ID: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Intentar de nuevo
        </button>
      </div>
    </div>
  )
}
