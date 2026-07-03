'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { apiClient } from '@/lib/api-client'

const POLL_MS = 30_000

// ─── Types ───────────────────────────────────────────────────────────────────

type BulkUploadLog = {
  id:          string
  tenantId:    string
  userId:      string
  type:        string
  fileName:    string
  fileSize:    number | null
  rowCount:    number | null
  recordCount: number
  status:      string
  createdAt:   string
  finishedAt:  string | null
  tenant:      { name: string; slug: string } | null
}

type ListResponse = {
  data:  BulkUploadLog[]
  total: number
  page:  number
  limit: number
}

type Tenant = { id: string; name: string; slug: string }

type Stats = {
  totalHoy:       number
  exitosasHoy:    number
  fallidasHoy:    number
  tenantsActivos: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  users:        'Usuarios',
  products:     'Productos',
  stock:        'Stock',
  suppliers:    'Proveedores',
  clients:      'Clientes',
  appointments: 'Citas',
  transactions: 'Transacciones',
}

const STATUS_LABELS: Record<string, string> = {
  success:    'Exitosa',
  failed:     'Fallida',
  partial:    'Parcial',
  pending:    'Pendiente',
  validating: 'Validando',
}

const STATUS_BADGE: Record<string, string> = {
  success:    'bg-emerald-500/15 text-emerald-300',
  failed:     'bg-red-500/15 text-red-300',
  partial:    'bg-amber-500/15 text-amber-300',
  pending:    'bg-white/10 text-slate-400',
  validating: 'bg-violet-500/15 text-violet-300',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtDuration(createdAt: string, finishedAt: string | null) {
  if (!finishedAt) return '—'
  const secs = Math.round((new Date(finishedAt).getTime() - new Date(createdAt).getTime()) / 1000)
  return `${secs}s`
}

function todayRange() {
  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end   = new Date(start.getTime() + 86_400_000)
  return { from: start.toISOString(), to: end.toISOString() }
}

function h24AgoISO() {
  return new Date(Date.now() - 86_400_000).toISOString()
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SupervisionPage() {
  // Filters
  const [tenantId, setTenantId] = useState('')
  const [type,     setType]     = useState('')
  const [status,   setStatus]   = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [page,     setPage]     = useState(1)

  // Data
  const [logs,    setLogs]    = useState<BulkUploadLog[]>([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [stats,   setStats]   = useState<Stats | null>(null)

  const limit      = 20
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load tenants for filter dropdown (once)
  useEffect(() => {
    apiClient
      .get<{ data: Tenant[] }>('/v1/admin/tenants?limit=100')
      .then((r) => setTenants(r.data ?? []))
      .catch(() => {})
  }, [])

  // Load stats (runs today + 24h for active tenants)
  const loadStats = useCallback(async () => {
    const { from, to } = todayRange()
    const h24          = h24AgoISO()
    const qs           = (extra: string) =>
      `/v1/admin/bulk-upload/logs?from=${from}&to=${to}&limit=1${extra}`

    try {
      const [t, s, f, a] = await Promise.all([
        apiClient.get<ListResponse>(qs('')),
        apiClient.get<ListResponse>(qs('&status=success')),
        apiClient.get<ListResponse>(qs('&status=failed')),
        apiClient.get<ListResponse>(`/v1/admin/bulk-upload/logs?from=${h24}&limit=100`),
      ])

      const uniqueTenants = new Set((a.data ?? []).map((l) => l.tenantId)).size

      setStats({
        totalHoy:       t.total ?? 0,
        exitosasHoy:    s.total ?? 0,
        fallidasHoy:    f.total ?? 0,
        tenantsActivos: uniqueTenants,
      })
    } catch { /* silent */ }
  }, [])

  // Load logs
  const loadLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)

    const params = new URLSearchParams({
      page:  String(page),
      limit: String(limit),
      ...(tenantId ? { tenantId } : {}),
      ...(type     ? { type }     : {}),
      ...(status   ? { status }   : {}),
      ...(dateFrom ? { from: new Date(dateFrom).toISOString() } : {}),
      ...(dateTo   ? { to:   new Date(dateTo + 'T23:59:59').toISOString() } : {}),
    })

    try {
      const data = await apiClient.get<ListResponse>(`/v1/admin/bulk-upload/logs?${params}`)
      setLogs(data.data ?? [])
      setTotal(data.total ?? 0)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [page, tenantId, type, status, dateFrom, dateTo])

  // Initial load + polling
  useEffect(() => {
    void loadLogs()
    void loadStats()

    pollRef.current = setInterval(() => {
      void loadLogs(true)
      void loadStats()
    }, POLL_MS)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [loadLogs, loadStats])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [tenantId, type, status, dateFrom, dateTo])

  function clearFilters() {
    setTenantId('')
    setType('')
    setStatus('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  const hasActiveFilters = !!(tenantId || type || status || dateFrom || dateTo)

  const selectCls =
    'h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500'

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Supervisión</h1>
        <p className="mt-1 text-sm text-slate-400">
          Monitoreo de cargas masivas de todos los clientes.
        </p>
      </header>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Cargas hoy"          value={stats ? String(stats.totalHoy) : '—'} accent="text-violet-300" />
        <StatCard label="Exitosas hoy"        value={stats ? String(stats.exitosasHoy) : '—'} accent="text-emerald-300" />
        <StatCard label="Fallidas hoy"        value={stats ? String(stats.fallidasHoy) : '—'} accent="text-red-300" highlight={!!(stats && stats.fallidasHoy > 0)} />
        <StatCard label="Tenants activos 24h" value={stats ? String(stats.tenantsActivos) : '—'} accent="text-slate-100" />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Empresa</label>
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className={selectCls}>
            <option value="">Todas</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Tipo</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
            <option value="">Todos</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Estado</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Desde</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={selectCls} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400">Hasta</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={selectCls} />
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="h-9 self-end rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-slate-400 hover:bg-white/10"
          >
            Limpiar filtros
          </button>
        )}

        <div className="ml-auto self-end text-xs text-slate-500">
          {total} resultado{total !== 1 ? 's' : ''}
          {' · '}
          <span className="text-emerald-400">● en vivo</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-slate-400">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Empresa</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Tipo</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Archivo</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Registros</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Estado</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Duración</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-t border-white/5">
                    {Array.from({ length: 7 }).map((__, c) => (
                      <td key={c} className="px-5 py-3.5">
                        <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-slate-500">
                    No hay cargas masivas{hasActiveFilters ? ' con esos filtros' : ''}.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className={[
                      'border-t border-white/5 transition-colors hover:bg-white/5',
                      log.status === 'failed' ? 'bg-red-500/5' : '',
                    ].join(' ')}
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-slate-100">
                        {log.tenant?.name ?? log.tenantId}
                      </span>
                      {log.tenant?.slug && (
                        <span className="ml-1.5 text-xs text-slate-500">@{log.tenant.slug}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-300">
                      {TYPE_LABELS[log.type] ?? log.type}
                    </td>
                    <td className="max-w-[180px] truncate px-5 py-3.5 font-mono text-xs text-slate-400">
                      {log.fileName}
                    </td>
                    <td className="px-5 py-3.5 text-slate-300">
                      {log.status === 'success'
                        ? <span className="font-semibold text-emerald-300">{log.recordCount}</span>
                        : <span className="text-slate-500">{log.rowCount ?? '—'}</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={[
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        STATUS_BADGE[log.status] ?? 'bg-white/10 text-slate-400',
                      ].join(' ')}>
                        {log.status === 'failed' && <span className="mr-1">⚠</span>}
                        {STATUS_LABELS[log.status] ?? log.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-400">
                      {fmtDuration(log.createdAt, log.finishedAt)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400">
                      {fmtDate(log.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/5 px-5 py-3">
            <span className="text-xs text-slate-400">Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40"
              >
                ← Anterior
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── StatCard ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, accent, highlight,
}: {
  label:     string
  value:     string
  accent:    string
  highlight?: boolean
}) {
  return (
    <div className={[
      'rounded-xl border border-white/10 bg-white/5 p-5 transition-all',
      highlight ? 'ring-2 ring-red-500/50' : '',
    ].join(' ')}>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${accent}`}>{value}</p>
    </div>
  )
}
