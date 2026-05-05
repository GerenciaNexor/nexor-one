'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { SkeletonRows } from '@/components/ui/SkeletonRows'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
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
  totalHoy:      number
  exitosasHoy:   number
  fallidasHoy:   number
  tenantsActivos: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

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
  success:   'Exitosa',
  failed:    'Fallida',
  partial:   'Parcial',
  pending:   'Pendiente',
  validating:'Validando',
}

const STATUS_BADGE: Record<string, string> = {
  success:    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  failed:     'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  partial:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  pending:    'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
  validating: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtSize(bytes: number | null) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(2)} MB`
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

export default function BulkUploadsAdminPage() {
  const router         = useRouter()
  const { user, token } = useAuthStore()

  // Filters
  const [tenantId,  setTenantId]  = useState('')
  const [type,      setType]      = useState('')
  const [status,    setStatus]    = useState('')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [page,      setPage]      = useState(1)

  // Data
  const [logs,     setLogs]     = useState<BulkUploadLog[]>([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [tenants,  setTenants]  = useState<Tenant[]>([])
  const [stats,    setStats]    = useState<Stats | null>(null)

  const limit     = 20
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  // Role guard
  useEffect(() => {
    if (!user) return
    if (user.role !== 'SUPER_ADMIN') router.replace('/dashboard')
  }, [user, router])

  // Load tenants for filter dropdown (once)
  useEffect(() => {
    if (!token) return
    void fetch(`${API_URL}/v1/admin/tenants?limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((r: { data: Tenant[] }) => setTenants(r.data ?? []))
      .catch(() => {})
  }, [token])

  // Load stats (runs today + 24h for active tenants)
  const loadStats = useCallback(async () => {
    if (!token) return
    const { from, to } = todayRange()
    const h24          = h24AgoISO()
    const qs           = (extra: string) =>
      `${API_URL}/v1/admin/bulk-upload/logs?from=${from}&to=${to}&limit=1${extra}`

    try {
      const [total24hRes, successRes, failedRes, activeRes] = await Promise.all([
        fetch(qs(''), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(qs('&status=success'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(qs('&status=failed'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/v1/admin/bulk-upload/logs?from=${h24}&limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      const [t, s, f, a] = await Promise.all([
        total24hRes.json() as Promise<ListResponse>,
        successRes.json()  as Promise<ListResponse>,
        failedRes.json()   as Promise<ListResponse>,
        activeRes.json()   as Promise<ListResponse>,
      ])

      const uniqueTenants = new Set((a.data ?? []).map((l) => l.tenantId)).size

      setStats({
        totalHoy:       t.total ?? 0,
        exitosasHoy:    s.total ?? 0,
        fallidasHoy:    f.total ?? 0,
        tenantsActivos: uniqueTenants,
      })
    } catch { /* silent */ }
  }, [token])

  // Load logs
  const loadLogs = useCallback(async (silent = false) => {
    if (!token) return
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
      const res  = await fetch(`${API_URL}/v1/admin/bulk-upload/logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json() as ListResponse
      setLogs(data.data ?? [])
      setTotal(data.total ?? 0)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [token, page, tenantId, type, status, dateFrom, dateTo])

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

  return (
    <div className="px-6 py-6">
      {/* ── Summary cards ── */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Cargas hoy"
          value={stats ? String(stats.totalHoy) : '—'}
          color="blue"
        />
        <StatCard
          label="Exitosas hoy"
          value={stats ? String(stats.exitosasHoy) : '—'}
          color="green"
        />
        <StatCard
          label="Fallidas hoy"
          value={stats ? String(stats.fallidasHoy) : '—'}
          color="red"
          highlight={!!(stats && stats.fallidasHoy > 0)}
        />
        <StatCard
          label="Tenants activos 24h"
          value={stats ? String(stats.tenantsActivos) : '—'}
          color="slate"
        />
      </div>

      {/* ── Filters ── */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        {/* Tenant */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Empresa</label>
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">Todas</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Type */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Tipo</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">Todos</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Estado</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Date from */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>

        {/* Date to */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="h-9 self-end rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            Limpiar filtros
          </button>
        )}

        <div className="ml-auto self-end text-xs text-slate-400 dark:text-slate-500">
          {total} resultado{total !== 1 ? 's' : ''}
          {' · '}
          <span className="text-green-500">● en vivo</span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Empresa</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tipo</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Archivo</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Registros</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Estado</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Duración</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <SkeletonRows rows={8} cols={7} px="px-5" />
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
                    No hay cargas masivas{hasActiveFilters ? ' con esos filtros' : ''}.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => router.push(`/admin/bulk-uploads/${log.id}`)}
                    className={[
                      'cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50',
                      log.status === 'failed' ? 'bg-red-50/60 dark:bg-red-900/10' : '',
                    ].join(' ')}
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {log.tenant?.name ?? log.tenantId}
                      </span>
                      {log.tenant?.slug && (
                        <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">
                          @{log.tenant.slug}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-700 dark:text-slate-300">
                      {TYPE_LABELS[log.type] ?? log.type}
                    </td>
                    <td className="max-w-[180px] truncate px-5 py-3.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {log.fileName}
                    </td>
                    <td className="px-5 py-3.5 text-slate-700 dark:text-slate-300">
                      {log.status === 'success'
                        ? <span className="font-semibold text-green-700 dark:text-green-400">{log.recordCount}</span>
                        : <span className="text-slate-400">{log.rowCount ?? '—'}</span>
                      }
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={[
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        STATUS_BADGE[log.status] ?? 'bg-slate-100 text-slate-600',
                      ].join(' ')}>
                        {log.status === 'failed' && <span className="mr-1">⚠</span>}
                        {STATUS_LABELS[log.status] ?? log.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {fmtDuration(log.createdAt, log.finishedAt)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">
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
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-slate-700">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 disabled:opacity-40 dark:border-slate-600 dark:text-slate-400"
              >
                ← Anterior
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 disabled:opacity-40 dark:border-slate-600 dark:text-slate-400"
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

// ─── StatCard ─────────────────────────────────────────────────────────────────

const COLOR_MAP = {
  blue:  { card: 'border-blue-100 bg-blue-50 dark:border-blue-800/40 dark:bg-blue-900/10',  val: 'text-blue-700 dark:text-blue-300',  lbl: 'text-blue-500 dark:text-blue-400'  },
  green: { card: 'border-green-100 bg-green-50 dark:border-green-800/40 dark:bg-green-900/10', val: 'text-green-700 dark:text-green-300', lbl: 'text-green-500 dark:text-green-400' },
  red:   { card: 'border-red-100 bg-red-50 dark:border-red-800/40 dark:bg-red-900/10',      val: 'text-red-700 dark:text-red-300',    lbl: 'text-red-500 dark:text-red-400'    },
  slate: { card: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800',       val: 'text-slate-800 dark:text-slate-100',lbl: 'text-slate-500 dark:text-slate-400'},
}

function StatCard({
  label, value, color, highlight,
}: {
  label: string
  value: string
  color: keyof typeof COLOR_MAP
  highlight?: boolean
}) {
  const c = COLOR_MAP[color]
  return (
    <div className={[
      'rounded-xl border p-4 shadow-sm transition-all',
      c.card,
      highlight ? 'ring-2 ring-red-400 dark:ring-red-500' : '',
    ].join(' ')}>
      <p className={`text-xs font-medium ${c.lbl}`}>{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${c.val}`}>{value}</p>
    </div>
  )
}
