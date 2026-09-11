'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'

// ─── Types ───────────────────────────────────────────────────────────────────

type Tenant = {
  id:       string
  name:     string
  isActive: boolean
}

type TenantsResponse = { data: Tenant[] }

// ─── Component ───────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    apiClient
      .get<TenantsResponse>('/v1/admin/tenants?limit=100')
      .then((r) => {
        if (!alive) return
        setTenants(r.data ?? [])
        setError(null)
      })
      .catch((e: { message?: string }) => {
        if (!alive) return
        setError(e.message ?? 'No se pudo cargar la información.')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Integraciones</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Dos usos de WhatsApp distintos: el <b>notificador</b> (número de NEXOR que ENVÍA notificaciones) y el <b>agente de atención</b> por cliente (recibe y responde).
        </p>
      </header>

      {/* HU-210 — Remitente notificador global de NEXOR (envía notificaciones) */}
      <GlobalNotifierCard />

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Agente de atención por cliente
      </h2>
      <p className="mb-3 -mt-1 text-xs text-slate-400">Recibe y responde a quien le escribe a cada empresa. Es independiente del notificador.</p>

      {/* Clients list */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 dark:bg-white/5 dark:text-slate-400">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Empresa</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Estado</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide">Canales</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-white/5">
                      {Array.from({ length: 3 }).map((__, c) => (
                        <td key={c} className="px-5 py-3.5">
                          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : tenants.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-16 text-center text-sm text-slate-500">
                      Aún no hay clientes.
                    </td>
                  </tr>
                ) : (
                  tenants.map((t) => (
                    <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5">
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{t.name}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={[
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          t.isActive
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                            : 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
                        ].join(' ')}>
                          {t.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/platform/clients/${t.id}`}
                          className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                        >
                          Gestionar canales
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── HU-210 — Remitente notificador global de NEXOR ────────────────────────────

type NotifierStatus = {
  configured: boolean
  phoneNumberId?: string
  wabaId?: string | null
  isActive?: boolean
  updatedAt?: string
}

function GlobalNotifierCard() {
  const [status, setStatus] = useState<NotifierStatus | null>(null)
  const [form, setForm]     = useState({ phoneNumberId: '', wabaId: '', accessToken: '', reason: '' })
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null)

  const load = () => {
    apiClient.get<{ data: NotifierStatus }>('/v1/admin/notifier')
      .then((r) => {
        setStatus(r.data)
        setForm((f) => ({ ...f, phoneNumberId: r.data.phoneNumberId ?? '', wabaId: r.data.wabaId ?? '' }))
      })
      .catch(() => setStatus({ configured: false }))
  }
  useEffect(load, [])

  async function save() {
    if (!form.phoneNumberId.trim() || !form.accessToken.trim() || !form.reason.trim()) {
      setMsg({ ok: false, text: 'Completa Phone Number ID, token y motivo.' }); return
    }
    setSaving(true); setMsg(null)
    try {
      await apiClient.put('/v1/admin/notifier', {
        phoneNumberId: form.phoneNumberId.trim(), wabaId: form.wabaId.trim() || undefined,
        accessToken: form.accessToken.trim(), reason: form.reason.trim(),
      })
      setMsg({ ok: true, text: 'Remitente guardado. Verifícalo para confirmar el token.' })
      setForm((f) => ({ ...f, accessToken: '', reason: '' }))
      setEditing(false); load()
    } catch (e: unknown) {
      setMsg({ ok: false, text: (e as { message?: string }).message ?? 'No se pudo guardar' })
    } finally { setSaving(false) }
  }

  async function test() {
    setTesting(true); setMsg(null)
    try {
      const r = await apiClient.post<{ data: { success: boolean; message: string } }>('/v1/admin/notifier/test', {})
      setMsg({ ok: r.data.success, text: r.data.message })
    } catch (e: unknown) {
      setMsg({ ok: false, text: (e as { message?: string }).message ?? 'No se pudo verificar' })
    } finally { setTesting(false) }
  }

  const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-100'
  const lbl = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400'

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <span className="text-emerald-600">📤</span> Notificador global de NEXOR
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Número único que ENVÍA las notificaciones (citas, recordatorios) de todas las empresas. El token se guarda cifrado.
          </p>
        </div>
        {status && (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.configured ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400'}`}>
            {status.configured ? 'Configurado' : 'Sin configurar'}
          </span>
        )}
      </div>

      {status?.configured && !editing && (
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-slate-400">Phone Number ID</dt><dd className="font-mono text-slate-800 dark:text-slate-100">{status.phoneNumberId}</dd></div>
          <div><dt className="text-xs text-slate-400">WABA ID</dt><dd className="font-mono text-slate-800 dark:text-slate-100">{status.wabaId ?? '—'}</dd></div>
        </dl>
      )}

      {editing || !status?.configured ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><label className={lbl}>Phone Number ID</label><input value={form.phoneNumberId} onChange={(e) => setForm((f) => ({ ...f, phoneNumberId: e.target.value }))} className={inp} placeholder="1371123906075806" /></div>
          <div><label className={lbl}>WABA ID</label><input value={form.wabaId} onChange={(e) => setForm((f) => ({ ...f, wabaId: e.target.value }))} className={inp} placeholder="1396008778666559" /></div>
          <div><label className={lbl}>Token permanente (Usuario del Sistema)</label><input type="password" value={form.accessToken} onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))} className={inp} placeholder="EAA…" /></div>
          <div><label className={lbl}>Motivo (auditoría)</label><input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className={inp} placeholder="Configuración del notificador de producción" /></div>
        </div>
      ) : null}

      {msg && <p className={`mt-3 text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</p>}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {status?.configured && (
          <button onClick={() => void test()} disabled={testing} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10">
            {testing ? 'Verificando…' : 'Verificar'}
          </button>
        )}
        {status?.configured && !editing && (
          <button onClick={() => { setEditing(true); setMsg(null) }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10">
            Actualizar token
          </button>
        )}
        {(editing || !status?.configured) && (
          <>
            {editing && <button onClick={() => { setEditing(false); setMsg(null) }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10">Cancelar</button>}
            <button onClick={() => void save()} disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {saving ? 'Guardando…' : 'Guardar remitente'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
