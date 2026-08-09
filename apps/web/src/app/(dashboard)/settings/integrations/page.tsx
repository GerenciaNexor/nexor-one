'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { apiClient } from '@/lib/api-client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Integration {
  id:              string
  channel:         'WHATSAPP' | 'GMAIL'
  identifier:      string
  branchId?:       string | null
  isActive:        boolean
  lastVerifiedAt:  string | null
  status?:         string        // connected | pending | error | expiring
  lastError?:      string | null
}

type Status = 'connected' | 'pending' | 'error' | 'expiring' | 'none'

function getStatus(i: Integration | undefined): Status {
  if (!i) return 'none'
  if (i.status === 'error' || i.status === 'expiring') return i.status
  return i.isActive ? 'connected' : 'pending'
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function badgeFor(channel: 'WHATSAPP' | 'GMAIL', status: Status): { label: string; cls: string } {
  if (status === 'connected') return { label: 'Conectado', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' }
  if (status === 'error')     return { label: channel === 'GMAIL' ? 'Desconectado' : 'Desconectado — contáctanos', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' }
  if (status === 'expiring')  return { label: 'Por vencer', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' }
  if (status === 'pending')   return { label: channel === 'WHATSAPP' ? 'Pendiente de verificación' : 'No conectado', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' }
  return { label: 'No conectado', cls: 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400' }
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const router = useRouter()
  const { user } = useAuthStore()

  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [busy, setBusy]       = useState(false)
  const [flash, setFlash]     = useState<{ ok: boolean; msg: string } | null>(null)

  const canManageGmail = user?.role === 'TENANT_ADMIN'

  useEffect(() => {
    if (!user) return
    if (!['BRANCH_ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN'].includes(user.role)) router.replace('/dashboard')
  }, [user, router])

  // Retorno del OAuth de Gmail (?gmail=success|error)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const g = p.get('gmail')
    if (g === 'success') setFlash({ ok: true, msg: 'Gmail se conectó correctamente. Ya recibirás los correos de tus clientes en NEXOR.' })
    else if (g === 'error') setFlash({ ok: false, msg: `No se pudo conectar Gmail${p.get('reason') ? ` (${p.get('reason')})` : ''}. Vuelve a intentarlo.` })
    if (g) window.history.replaceState({}, '', '/settings/integrations')
  }, [])

  function load() {
    apiClient.get<{ data: Integration[] }>('/v1/integrations')
      .then((r) => setIntegrations(r.data))
      .catch((e: { message?: string }) => setError(e.message ?? 'No se pudo cargar el estado de las integraciones.'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const wa = integrations.find((i) => i.channel === 'WHATSAPP')
  const gm = integrations.find((i) => i.channel === 'GMAIL')

  async function connectGmail() {
    setBusy(true); setError(null)
    try {
      const r = await apiClient.get<{ data: { url: string } }>('/v1/integrations/gmail/connect-url')
      window.location.href = r.data.url // redirige al consentimiento de Google
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? 'No se pudo iniciar la conexión con Google.'); setBusy(false)
    }
  }
  async function disconnectGmail() {
    if (!window.confirm('¿Desconectar tu cuenta de Gmail de NEXOR? Dejarás de recibir esos correos aquí.')) return
    setBusy(true); setError(null)
    try { await apiClient.delete('/v1/integrations/gmail'); load() }
    catch (e: unknown) { setError((e as { message?: string }).message ?? 'No se pudo desconectar.') }
    finally { setBusy(false) }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6"><div className="h-6 w-48 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" /></div>
        <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="h-36 animate-pulse rounded-xl border border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800" />)}</div>
      </div>
    )
  }

  const waBadge = badgeFor('WHATSAPP', getStatus(wa))
  const gmStatus = getStatus(gm)
  const gmBadge  = badgeFor('GMAIL', gmStatus)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Integraciones</h1>
        <p className="mt-1 text-sm text-slate-500">Estado de los canales de comunicación de tu empresa.</p>
      </div>

      {flash && (
        <div className={`mb-4 rounded-xl border p-4 text-sm ${flash.ok ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-red-100 bg-red-50 text-red-700'}`}>{flash.msg}</div>
      )}
      {error && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="space-y-4">
        {/* WhatsApp — lo gestiona NEXOR (solo lectura para el cliente) */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">WhatsApp Business</h2>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${waBadge.cls}`}>{waBadge.label}</span>
          </div>
          <p className="mt-2 text-sm text-slate-500">La conexión de WhatsApp la gestiona el equipo NEXOR. {getStatus(wa) === 'error' ? 'Tu canal está desconectado — escríbenos para reactivarlo.' : 'Escríbenos para activar o cambiar el número.'}</p>
          {wa?.lastVerifiedAt && <p className="mt-2 text-xs text-slate-400">Última verificación: {fmtDate(wa.lastVerifiedAt)}</p>}
        </div>

        {/* Gmail — lo conecta el CLIENTE por OAuth (solo el dueño de la cuenta autoriza en Google) */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" fill="#EA4335" opacity=".2"/><path d="M20 4H4l8 9 8-9z" fill="#EA4335"/><path d="M2 6l10 7 10-7" stroke="#FBBC04" strokeWidth="1.5" fill="none"/></svg>
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Gmail</h2>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${gmBadge.cls}`}>{gmBadge.label}</span>
          </div>
          <p className="mt-2 text-sm text-slate-500">Recibe los correos de tus clientes y gestiónalos en NEXOR con ayuda de IA.</p>
          {gm && gmStatus !== 'none' && (
            <p className="mt-2 text-xs text-slate-500">Cuenta vinculada: <span className="font-medium text-slate-700 dark:text-slate-300">{gm.identifier}</span></p>
          )}

          {canManageGmail ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={connectGmail} disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600">
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
                {gm && gmStatus !== 'none' ? 'Reconectar con Google' : 'Conectar Gmail con Google'}
              </button>
              {gm && gmStatus !== 'none' && (
                <button onClick={disconnectGmail} disabled={busy}
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                  Desconectar
                </button>
              )}
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-400">Solo el administrador de la empresa (TENANT_ADMIN) puede conectar o desconectar Gmail.</p>
          )}
          <p className="mt-3 text-xs text-slate-400">Al conectar, Google te pedirá elegir tu cuenta y autorizar el acceso de solo lectura a tu correo. Puedes revocarlo cuando quieras.</p>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Tus credenciales se cifran con AES-256 antes de guardarse. NEXOR nunca expone tokens en texto plano.
      </p>
    </div>
  )
}
