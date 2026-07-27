'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'

// ─── Types ───────────────────────────────────────────────────────────────────

type AuditEntry = {
  id:        string
  action:    string
  reason:    string | null
  metadata:  Record<string, unknown>
  ip:        string | null
  createdAt: string
  platformAdmin: { id: string; email: string | null; name: string | null }
  tenant:        { id: string; name: string | null } | null
}

type AuditResponse = {
  data:       AuditEntry[]
  total:      number
  page:       number
  totalPages: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: '',                     label: 'Todas' },
  { value: 'tenant.create',        label: 'Cliente creado' },
  { value: 'tenant.activate',      label: 'Cliente activado' },
  { value: 'tenant.deactivate',    label: 'Cliente desactivado' },
  { value: 'tenant.demo_extend',    label: 'Demo — duración ajustada' },
  { value: 'tenant.demo_expire',    label: 'Demo — suspendida (vencida)' },
  { value: 'tenant.demo_convert',   label: 'Demo — convertida en cliente' },
  { value: 'tenant.demo_ai_extend', label: 'Demo — cupo de IA ampliado' },
  { value: 'subscription.update',  label: 'Suscripción actualizada' },
  { value: 'module.enable',        label: 'Módulo habilitado' },
  { value: 'module.disable',       label: 'Módulo deshabilitado' },
  { value: 'tenant.impersonate',   label: 'Impersonación' },
  { value: 'channel.connect',      label: 'Canal conectado' },
  { value: 'channel.disconnect',   label: 'Canal desconectado' },
]

const ACTION_BADGE: Record<string, string> = {
  'tenant.create':       'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  'tenant.activate':     'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'tenant.deactivate':   'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  'tenant.demo_extend':   'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  'tenant.demo_expire':   'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'tenant.demo_convert':  'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'tenant.demo_ai_extend':'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  'subscription.update': 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  'module.enable':       'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'module.disable':      'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'tenant.impersonate':  'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'channel.connect':     'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'channel.disconnect':  'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
}

const ACTION_LABEL: Record<string, string> = Object.fromEntries(
  ACTION_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function metaPills(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && typeof v !== 'object',
  )
  return entries.slice(0, 6).map(([k, v]) => (
    <span
      key={k}
      className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-white/5 dark:text-slate-400"
    >
      <span className="text-slate-500">{k}:</span>
      <span className="ml-1 text-slate-700 dark:text-slate-300">{String(v)}</span>
    </span>
  ))
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [entries,    setEntries]    = useState<AuditEntry[]>([])
  const [page,       setPage]       = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [action,     setAction]     = useState('')
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    if (action) params.set('action', action)
    try {
      const r = await apiClient.get<AuditResponse>(`/v1/admin/audit-logs?${params}`)
      setEntries(r.data ?? [])
      setTotalPages(r.totalPages ?? 1)
    } catch (e) {
      const err = e as { message?: string }
      setError(err.message ?? 'No se pudo cargar la auditoría.')
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [page, action])

  useEffect(() => { void load() }, [load])

  // Reset to page 1 when filter changes
  useEffect(() => { setPage(1) }, [action])

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Auditoría</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Historial inmutable de las acciones del equipo NEXOR.
        </p>
      </header>

      {/* Filter */}
      <div className="mb-4 flex items-center gap-2">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Acción</label>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

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
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Fecha</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Acción</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Cliente</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Actor</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Motivo</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Detalles</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">IP</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-white/5">
                      {Array.from({ length: 7 }).map((__, c) => (
                        <td key={c} className="px-5 py-3.5">
                          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-sm text-slate-500">
                      Sin acciones registradas
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => (
                    <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50 align-top dark:border-white/5 dark:hover:bg-white/5">
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                        {fmtDateTime(e.createdAt)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={[
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                          ACTION_BADGE[e.action] ?? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400',
                        ].join(' ')}>
                          {ACTION_LABEL[e.action] ?? e.action}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 dark:text-slate-300">{e.tenant?.name ?? '—'}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                        {e.platformAdmin.email ?? e.platformAdmin.name ?? '—'}
                      </td>
                      <td className="max-w-[220px] px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                        {e.reason ?? '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex max-w-[260px] flex-wrap gap-1">
                          {metaPills(e.metadata).length > 0 ? metaPills(e.metadata) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-500">{e.ip ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-white/5">
              <span className="text-xs text-slate-500 dark:text-slate-400">Página {page} de {totalPages}</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  ← Anterior
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
