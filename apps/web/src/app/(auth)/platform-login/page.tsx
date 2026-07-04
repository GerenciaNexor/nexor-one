'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { loginPlatformRequest, ApiRequestError } from '@/lib/auth-api'

function Spinner() {
  return (
    <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export default function PlatformLoginPage() {
  const router = useRouter()
  const setPlatformAuth = useAuthStore((s) => s.setPlatformAuth)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setServerError('')
    if (!email.trim() || !password) { setServerError('Ingresa correo y contraseña.'); return }
    setLoading(true)
    try {
      const data = await loginPlatformRequest(email, password)
      setPlatformAuth(data.token, data.admin)
      router.replace('/platform')
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        setServerError(err.statusCode === 401 ? 'Credenciales incorrectas.'
          : err.statusCode === 403 ? 'Cuenta de plataforma desactivada.'
          : err.message)
      } else {
        setServerError('El servicio no está disponible. Intenta nuevamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  const inputBase = 'mt-1.5 block w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 backdrop-blur transition-shadow focus:outline-none focus:ring-2 focus:ring-violet-500/70 disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0d1a] px-4 text-slate-200">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute bottom-0 left-0 h-[24rem] w-[24rem] rounded-full bg-indigo-500/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2.5">
            <img src="/logos/icon-dark.png" alt="NEXOR" className="h-9 w-auto object-contain" />
            <span className="font-wordmark text-2xl font-semibold tracking-tight text-slate-100 [word-spacing:-0.2em]">nexor one</span>
          </div>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-300">
            Plataforma · Equipo NEXOR
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-8 py-10 shadow-2xl backdrop-blur">
          <h1 className="mb-1 text-xl font-semibold text-white">Acceso de plataforma</h1>
          <p className="mb-6 text-sm text-slate-400">Solo para el equipo interno de NEXOR.</p>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">Correo</label>
              <input id="email" type="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="superadmin@nexor-one.com"
                disabled={loading} className={inputBase} />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">Contraseña</label>
              <input id="password" type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                disabled={loading} className={inputBase} />
            </div>
            {serverError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300" role="alert">{serverError}</div>
            )}
            <button type="submit" disabled={loading}
              className="mt-2 flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-[#0a0d1a] disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? <><Spinner />Verificando…</> : 'Ingresar a la plataforma'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          ¿Eres cliente? <Link href="/login" className="text-slate-400 underline hover:text-slate-200">Ingresa a tu empresa aquí</Link>
        </p>
      </div>
    </main>
  )
}
