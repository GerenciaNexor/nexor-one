'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface SalesSummary {
  totalGanados:       number
  totalPerdidos:      number
  valorTotal:         number
  tasaConversion:     number
  diasPromedioCierre: number
}

interface VendorRow {
  userId:         string
  nombre:         string
  ganados:        number
  perdidos:       number
  valorGanado:    number
  tasaConversion: number
}

interface SalesReport {
  summary: SalesSummary
  vendors: VendorRow[]
}

interface StageRow {
  id:          string
  name:        string
  color:       string | null
  isFinalWon:  boolean
  isFinalLost: boolean
  deals:       number
  valorTotal:  number
}

interface StaleDeal {
  id:               string
  title:            string
  clientName:       string
  stageName:        string
  stageColor:       string | null
  assignedName:     string | null
  diasSinActividad: number
  createdAt:        string
}

interface PipelineReport {
  stages:     StageRow[]
  staleDeals: StaleDeal[]
}

// ─── Tipos auxiliares ─────────────────────────────────────────────────────────

interface Branch {
  id:   string
  name: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style:                'currency',
    currency:             'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)} %`
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color = 'blue',
}: {
  label: string
  value: string
  sub?:  string
  color?: 'blue' | 'emerald' | 'amber' | 'violet'
}) {
  const accent: Record<string, string> = {
    blue:    'bg-blue-50   text-blue-700   dark:bg-blue-900/30  dark:text-blue-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    amber:   'bg-amber-50  text-amber-700  dark:bg-amber-900/30 dark:text-amber-300',
    violet:  'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold ${accent[color]?.split(' ')[1]} dark:${accent[color]?.split(' ').slice(-1)[0]}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{sub}</p>
      )}
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const user      = useAuthStore((s) => s.user)
  const isManager = user?.role !== 'OPERATIVE'

  // ── Filtros ──────────────────────────────────────────────────────────────
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [assignedTo,  setAssignedTo]  = useState('')
  const [branchId,    setBranchId]    = useState('')

  // ── Sucursales (solo para managers) ─────────────────────────────────────
  const [branches, setBranches] = useState<Branch[]>([])

  useEffect(() => {
    if (!isManager) return
    apiClient.get<{ data: Branch[] }>('/v1/branches')
      .then((res) => setBranches(res.data))
      .catch(() => {})
  }, [isManager])

  // ── Datos ────────────────────────────────────────────────────────────────
  const [sales,        setSales]        = useState<SalesReport | null>(null)
  const [pipeline,     setPipeline]     = useState<PipelineReport | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [fetchError,   setFetchError]   = useState<string | null>(null)

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams()
      if (dateFrom)   params.set('dateFrom',   dateFrom)
      if (dateTo)     params.set('dateTo',     dateTo)
      if (assignedTo) params.set('assignedTo', assignedTo)
      if (branchId)   params.set('branchId',   branchId)
      const qs = params.toString() ? `?${params.toString()}` : ''

      const [s, p] = await Promise.all([
        apiClient.get<SalesReport>(`/v1/ari/reports/sales${qs}`),
        apiClient.get<PipelineReport>(`/v1/ari/reports/pipeline${qs}`),
      ])
      setSales(s)
      setPipeline(p)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setFetchError(e.message ?? 'Error al cargar los reportes')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, assignedTo, branchId])

  useEffect(() => { fetchReports() }, [fetchReports])

  // ─── Render ───────────────────────────────────────────────────────────────

  const pipelineTotalDeals  = pipeline?.stages.reduce((s, r) => s + r.deals, 0) ?? 0
  const pipelineTotalValor  = pipeline?.stages.reduce((s, r) => s + r.valorTotal, 0) ?? 0

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">

      {/* ── Encabezado ──────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Reportes</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Rendimiento comercial y estado del pipeline · en tiempo real
            </p>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              title="Desde"
            />
            <span className="text-xs text-slate-400">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              title="Hasta"
            />
            {isManager && (
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="">Todos los vendedores</option>
                <option value="me">Mis deals</option>
              </select>
            )}
            {isManager && branches.length > 0 && (
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="">Todas las sucursales</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
            {(dateFrom || dateTo || assignedTo || branchId) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setAssignedTo(''); setBranchId('') }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 transition-colors dark:border-slate-600 dark:hover:bg-slate-700"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Contenido ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="p-6 space-y-6">
          {/* KPI skeleton */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-white shadow-sm dark:bg-slate-800" />
            ))}
          </div>
          {/* Table skeleton */}
          <div className="h-48 animate-pulse rounded-2xl bg-white shadow-sm dark:bg-slate-800" />
          <div className="h-48 animate-pulse rounded-2xl bg-white shadow-sm dark:bg-slate-800" />
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <p className="text-sm text-red-500">{fetchError}</p>
          <button onClick={fetchReports} className="text-sm text-blue-600 hover:underline">
            Reintentar
          </button>
        </div>
      ) : (
        <div className="space-y-8 p-6">

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* SECCIÓN 1 — VENTAS                                               */}
          {/* ══════════════════════════════════════════════════════════════════ */}

          <section>
            <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-200">
              Rendimiento de Ventas
            </h2>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard
                label="Deals ganados"
                value={String(sales?.summary.totalGanados ?? 0)}
                sub={`${sales?.summary.totalPerdidos ?? 0} perdidos`}
                color="emerald"
              />
              <KpiCard
                label="Valor total ganado"
                value={fmtCOP(sales?.summary.valorTotal ?? 0)}
                color="blue"
              />
              <KpiCard
                label="Tasa de conversión"
                value={fmtPct(sales?.summary.tasaConversion ?? 0)}
                sub="sobre deals cerrados"
                color="violet"
              />
              <KpiCard
                label="Días prom. para cerrar"
                value={`${sales?.summary.diasPromedioCierre ?? 0} días`}
                sub="desde creación hasta cierre"
                color="amber"
              />
            </div>

            {/* Tabla de vendedores */}
            {isManager && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Rendimiento por vendedor
                  </h3>
                </div>
                {sales?.vendors.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                    Sin datos de vendedores en el período seleccionado.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                          <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Vendedor
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Ganados
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Perdidos
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Valor ganado
                          </th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Conv. %
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales?.vendors.map((v) => (
                          <tr
                            key={v.userId}
                            className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 dark:border-slate-700/50 dark:hover:bg-slate-700/30"
                          >
                            <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200">
                              <div className="flex items-center gap-2">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                                  {v.nombre.charAt(0).toUpperCase()}
                                </span>
                                {v.nombre}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                              {v.ganados}
                            </td>
                            <td className="px-4 py-3 text-right text-red-500 dark:text-red-400">
                              {v.perdidos}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-300">
                              {fmtCOP(v.valorGanado)}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <span
                                className={[
                                  'inline-block rounded-full px-2 py-0.5 text-xs font-semibold',
                                  v.tasaConversion >= 60
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                    : v.tasaConversion >= 30
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                    : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                                ].join(' ')}
                              >
                                {fmtPct(v.tasaConversion)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* SECCIÓN 2 — PIPELINE                                             */}
          {/* ══════════════════════════════════════════════════════════════════ */}

          <section>
            <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-200">
              Estado del Pipeline
            </h2>

            <div className="grid gap-4 lg:grid-cols-2">

              {/* Tabla de etapas */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Deals por etapa
                  </h3>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {pipelineTotalDeals} deals · {fmtCOP(pipelineTotalValor)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Etapa
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Deals
                        </th>
                        <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Valor total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pipeline?.stages.map((s) => (
                        <tr
                          key={s.id}
                          className={[
                            'border-b border-slate-50 last:border-0',
                            s.deals > 0 ? 'hover:bg-slate-50/60 dark:border-slate-700/50 dark:hover:bg-slate-700/30' : 'opacity-50',
                          ].join(' ')}
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {s.color && (
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: s.color }}
                                />
                              )}
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {s.name}
                              </span>
                              {(s.isFinalWon || s.isFinalLost) && (
                                <span className={[
                                  'rounded px-1.5 py-0.5 text-[10px] font-medium',
                                  s.isFinalWon
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                    : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
                                ].join(' ')}>
                                  {s.isFinalWon ? 'Ganado' : 'Perdido'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                            {s.deals}
                          </td>
                          <td className="px-5 py-3 text-right text-slate-600 dark:text-slate-400">
                            {s.valorTotal > 0 ? fmtCOP(s.valorTotal) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Deals sin actividad */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Sin actividad &gt; 7 días
                  </h3>
                  {(pipeline?.staleDeals.length ?? 0) > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      {pipeline!.staleDeals.length}
                    </span>
                  )}
                </div>

                {pipeline?.staleDeals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-10">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      Todos los deals tienen actividad reciente.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
                    {pipeline?.staleDeals.map((d) => (
                      <div key={d.id} className="flex items-start justify-between gap-3 px-5 py-3 hover:bg-slate-50/60 dark:hover:bg-slate-700/30">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                            {d.title}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                            {d.clientName}
                            {d.assignedName && (
                              <span className="ml-1.5 text-slate-400"> · {d.assignedName}</span>
                            )}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5">
                            {d.stageColor && (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: d.stageColor }}
                              />
                            )}
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                              {d.stageName}
                            </span>
                          </div>
                        </div>
                        <span className={[
                          'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                          d.diasSinActividad >= 30
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : d.diasSinActividad >= 14
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
                        ].join(' ')}>
                          {d.diasSinActividad}d
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

        </div>
      )}
    </div>
  )
}
