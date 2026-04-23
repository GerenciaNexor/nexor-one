'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient }    from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { LineChart }    from './LineChart'
import type { TimelinePoint } from './LineChart'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SummaryData {
  income:      number
  expense:     number
  grossProfit: number
  margin:      number
  byBranch: {
    branchId:    string | null
    branchName:  string
    income:      number
    expense:     number
    grossProfit: number
    margin:      number
  }[]
  byModule: {
    module:      string
    income:      number
    expense:     number
    grossProfit: number
    margin:      number
  }[]
}

interface CategoryRow {
  categoryId:   string | null
  categoryName: string
  color:        string | null
  type:         'income' | 'expense'
  amount:       number
  percentage:   number
}

type Tab         = 'summary' | 'branches' | 'modules'
type Granularity = 'auto' | 'day' | 'week' | 'month'

// ── Helpers ────────────────────────────────────────────────────────────────────

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

function fmt(v: number, currency = 'COP') {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v)
}

function resolveGranularity(from: string, to: string, sel: Granularity): 'day' | 'week' | 'month' {
  if (sel !== 'auto') return sel
  const days = Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
  if (days < 30)  return 'day'
  if (days <= 90) return 'week'
  return 'month'
}

const MODULE_LABELS: Record<string, string> = {
  manual:      'Manual',
  appointment: 'AGENDA',
  deal:        'ARI',
  quotation:   'ARI',
  invoice:     'ARI',
  purchase:    'NIRA',
}

const GRAN_LABELS: Record<string, string> = {
  day:   'Diaria',
  week:  'Semanal',
  month: 'Mensual',
}

const ALLOWED_ROLES = ['TENANT_ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER']

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, loading }: { label: string; value: string; loading?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-32 animate-pulse rounded-md bg-slate-200 dark:bg-slate-700" />
      ) : (
        <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
      )}
    </div>
  )
}

function CategorySection({ rows, type }: { rows: CategoryRow[]; type: 'income' | 'expense' }) {
  const filtered = rows.filter((r) => r.type === type).sort((a, b) => b.amount - a.amount)
  if (filtered.length === 0) return null

  const barColor = type === 'income' ? 'bg-emerald-500' : 'bg-red-500'
  const dotColor = type === 'income' ? 'bg-emerald-400' : 'bg-red-400'

  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {type === 'income' ? 'Ingresos por categoría' : 'Egresos por categoría'}
      </h4>
      <div className="space-y-2.5">
        {filtered.map((row, i) => (
          <div key={row.categoryId ?? i} className="flex items-center gap-3">
            <div className="flex w-36 shrink-0 items-center gap-1.5 overflow-hidden">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`}
                style={row.color ? { backgroundColor: row.color } : undefined}
              />
              <span className="truncate text-sm text-slate-700 dark:text-slate-300">{row.categoryName}</span>
            </div>
            <div className="flex-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${row.percentage}%` }} />
              </div>
            </div>
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {row.percentage}%
            </span>
            <span className="w-32 shrink-0 text-right text-sm font-medium tabular-nums text-slate-900 dark:text-white">
              {fmt(Number(row.amount))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function KpiRow({
  label, income, expense, grossProfit, margin, isTotal = false,
}: {
  label:       string
  income:      number
  expense:     number
  grossProfit: number
  margin:      number
  isTotal?:    boolean
}) {
  const gp = Number(grossProfit)
  const mg = Number(margin)
  return (
    <tr className={
      isTotal
        ? 'border-t-2 border-slate-300 bg-slate-50 font-semibold dark:border-slate-600 dark:bg-slate-900/60'
        : 'transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30'
    }>
      <td className="px-4 py-3 text-sm text-slate-900 dark:text-white">{label}</td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
        {fmt(Number(income))}
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-red-600 dark:text-red-400">
        {fmt(Number(expense))}
      </td>
      <td className={`px-4 py-3 text-right text-sm tabular-nums ${gp >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600 dark:text-red-400'}`}>
        {fmt(gp)}
      </td>
      <td className={`px-4 py-3 text-right text-sm tabular-nums ${mg >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600 dark:text-red-400'}`}>
        {mg.toFixed(1)}%
      </td>
    </tr>
  )
}

// ── Main View ──────────────────────────────────────────────────────────────────

export function ReportsView() {
  const user      = useAuthStore((s) => s.user)
  const canAccess = !!user?.role && ALLOWED_ROLES.includes(user.role)

  const today    = new Date()
  const initFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const initTo   = today.toISOString().slice(0, 10)

  const [tab,         setTab]         = useState<Tab>('summary')
  const [dateFrom,    setDateFrom]    = useState(initFrom)
  const [dateTo,      setDateTo]      = useState(initTo)
  const [granularity, setGranularity] = useState<Granularity>('auto')

  const [summary,    setSummary]    = useState<SummaryData | null>(null)
  const [timeline,   setTimeline]   = useState<TimelinePoint[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [exporting,  setExporting]  = useState(false)

  const resolvedGran = resolveGranularity(dateFrom, dateTo, granularity)

  const load = useCallback(() => {
    setLoading(true)
    const qs   = new URLSearchParams({ dateFrom, dateTo })
    const tlQs = new URLSearchParams({ dateFrom, dateTo, granularity: resolvedGran })

    Promise.allSettled([
      apiClient.get<SummaryData>(`/v1/vera/reports/summary?${qs}`),
      apiClient.get<{ data: TimelinePoint[] }>(`/v1/vera/reports/timeline?${tlQs}`),
      apiClient.get<{ data: CategoryRow[] }>(`/v1/vera/reports/categories?${qs}`),
    ]).then(([sum, tl, cats]) => {
      if (sum.status  === 'fulfilled') setSummary(sum.value)
      if (tl.status   === 'fulfilled') setTimeline(tl.value.data ?? [])
      if (cats.status === 'fulfilled') setCategories(cats.value.data ?? [])
    }).finally(() => setLoading(false))
  }, [dateFrom, dateTo, resolvedGran])

  useEffect(() => { load() }, [load])

  async function handleExport() {
    setExporting(true)
    try {
      const token = useAuthStore.getState().token
      const qs    = new URLSearchParams({ dateFrom, dateTo })
      const res   = await fetch(`${API_URL}/v1/vera/reports/export?${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('Error al exportar')
      const text = await res.text()
      const blob = new Blob(['\uFEFF' + text], { type: 'text/csv; charset=utf-8' })
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), {
        href:     url,
        download: `vera-${dateFrom}-${dateTo}.csv`,
      })
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // el usuario notará que no se descargó el archivo
    } finally {
      setExporting(false)
    }
  }

  const inputCls =
    'rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none ' +
    'focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ' +
    'dark:border-slate-700 dark:bg-slate-900 dark:text-white'

  const thCls = 'px-4 py-3 text-right'
  const theadCls = 'border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/50'

  if (!canAccess) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        No tienes acceso a este módulo
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">

      {/* Header + filters */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Reportes financieros</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Análisis por periodo</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Desde</label>
            <input
              type="date" value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Hasta</label>
            <input
              type="date" value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={inputCls}
            />
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {exporting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            ) : (
              <span>↓</span>
            )}
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="-mb-px flex gap-1">
          {([
            { key: 'summary',  label: 'Resumen'      },
            { key: 'branches', label: 'Por sucursal' },
            { key: 'modules',  label: 'Por módulo'   },
          ] as { key: Tab; label: string }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                'border-b-2 px-5 py-3 text-sm font-medium transition-colors',
                tab === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Resumen ─────────────────────────────────────────────────────────── */}
      {tab === 'summary' && (
        <div className="space-y-6">

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Ingresos"       value={summary ? fmt(summary.income)      : '—'} loading={loading && !summary} />
            <StatCard label="Egresos"        value={summary ? fmt(summary.expense)     : '—'} loading={loading && !summary} />
            <StatCard label="Utilidad bruta" value={summary ? fmt(summary.grossProfit) : '—'} loading={loading && !summary} />
            <StatCard label="Margen"         value={summary ? `${summary.margin}%`     : '—'} loading={loading && !summary} />
          </div>

          {/* Timeline */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Evolución temporal
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-5 rounded-full bg-blue-500" />
                    Ingresos
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-5 rounded-full bg-red-500" />
                    Egresos
                  </span>
                </div>
                <select
                  value={granularity}
                  onChange={(e) => setGranularity(e.target.value as Granularity)}
                  className={inputCls + ' py-1 text-xs'}
                >
                  <option value="auto">Auto ({GRAN_LABELS[resolvedGran]})</option>
                  <option value="day">Diaria</option>
                  <option value="week">Semanal</option>
                  <option value="month">Mensual</option>
                </select>
              </div>
            </div>
            {loading && timeline.length === 0 ? (
              <div className="h-56 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700/50" />
            ) : (
              <LineChart data={timeline} className="h-56" />
            )}
          </div>

          {/* Categories */}
          {(loading || categories.length > 0) && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
              <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Desglose por categoría
              </p>
              {loading && categories.length === 0 ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-4 animate-pulse rounded-md bg-slate-100 dark:bg-slate-700" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <CategorySection rows={categories} type="income"  />
                  <CategorySection rows={categories} type="expense" />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Por sucursal ─────────────────────────────────────────────────────── */}
      {tab === 'branches' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : !summary || summary.byBranch.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">
              Sin datos para el periodo seleccionado
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={theadCls}>
                    <th className="px-4 py-3">Sucursal</th>
                    <th className={thCls}>Ingresos</th>
                    <th className={thCls}>Egresos</th>
                    <th className={thCls}>Utilidad bruta</th>
                    <th className={thCls}>Margen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {summary.byBranch.map((b) => (
                    <KpiRow
                      key={b.branchId ?? '__none__'}
                      label={b.branchName}
                      income={b.income} expense={b.expense}
                      grossProfit={b.grossProfit} margin={b.margin}
                    />
                  ))}
                  {summary.byBranch.length > 1 && (
                    <KpiRow
                      label="Total empresa"
                      income={summary.income} expense={summary.expense}
                      grossProfit={summary.grossProfit} margin={summary.margin}
                      isTotal
                    />
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Por módulo ───────────────────────────────────────────────────────── */}
      {tab === 'modules' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : !summary || summary.byModule.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">
              Sin datos para el periodo seleccionado
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={theadCls}>
                    <th className="px-4 py-3">Módulo origen</th>
                    <th className={thCls}>Ingresos</th>
                    <th className={thCls}>Egresos</th>
                    <th className={thCls}>Utilidad bruta</th>
                    <th className={thCls}>Margen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {summary.byModule.map((mod) => {
                    const raw   = mod.module
                    const label = MODULE_LABELS[raw] ?? (raw.charAt(0).toUpperCase() + raw.slice(1))
                    return (
                      <KpiRow
                        key={raw}
                        label={label}
                        income={mod.income} expense={mod.expense}
                        grossProfit={mod.grossProfit} margin={mod.margin}
                      />
                    )
                  })}
                  {summary.byModule.length > 1 && (
                    <KpiRow
                      label="Total"
                      income={summary.income} expense={summary.expense}
                      grossProfit={summary.grossProfit} margin={summary.margin}
                      isTotal
                    />
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
