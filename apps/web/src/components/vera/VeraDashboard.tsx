'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { ManualTransactionModal } from './ManualTransactionModal'
import { LineChart } from './LineChart'
import type { TimelinePoint } from './LineChart'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SummaryData {
  income:      number
  expense:     number
  grossProfit: number
  margin:      number
}

type BudgetNone = { budget: null; spent: number; percentage: number }
type BudgetData = { id: string; amount: number; currency: string; spent: number; percentage: number; branch?: { name: string } | null }
type BudgetResponse = BudgetNone | BudgetData

interface TxItem {
  id:            string
  type:          'income' | 'expense'
  amount:        number
  currency:      string
  description:   string
  date:          string
  isManual:      boolean
  referenceType: string | null
  txCategory:    { name: string } | null
  branch:        { name: string } | null
}

interface Branch { id: string; name: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(v: number, currency = 'COP') {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v)
}

function compact(v: number) {
  return new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}

function buildSummaryQs(branchId: string, offsetMonths: number) {
  const now  = new Date()
  const base = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1)
  const y    = base.getFullYear()
  const m    = String(base.getMonth() + 1).padStart(2, '0')
  const from = `${y}-${m}-01`
  const to   = offsetMonths === 0
    ? now.toISOString().slice(0, 10)
    : new Date(y, base.getMonth() + 1, 0).toISOString().slice(0, 10)
  const qs = new URLSearchParams({ dateFrom: from, dateTo: to })
  if (branchId) qs.set('branchId', branchId)
  return qs.toString()
}

function buildTimelineQs(branchId: string) {
  const now  = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const qs   = new URLSearchParams({
    dateFrom:    `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`,
    dateTo:      now.toISOString().slice(0, 10),
    granularity: 'month',
  })
  if (branchId) qs.set('branchId', branchId)
  return qs.toString()
}

// ── KPI Card ───────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, delta, invertDelta = false, isPercent = false, loading = false,
}: {
  label:         string
  value:         string
  delta:         number | null
  invertDelta?:  boolean
  isPercent?:    boolean
  loading?:      boolean
}) {
  const isGood = delta === null || delta === 0
    ? null
    : invertDelta ? delta < 0 : delta > 0

  const deltaStr = delta === null
    ? null
    : isPercent
      ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}pp`
      : `${delta > 0 ? '+' : ''}${compact(delta)}`

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-32 animate-pulse rounded-md bg-slate-200 dark:bg-slate-700" />
      ) : (
        <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
      )}
      <p className="mt-1 text-xs">
        {deltaStr === null ? (
          <span className="text-slate-400">N/A vs mes anterior</span>
        ) : isGood === true ? (
          <span className="text-emerald-600 dark:text-emerald-400">▲ {deltaStr} vs mes anterior</span>
        ) : isGood === false ? (
          <span className="text-red-600 dark:text-red-400">▼ {deltaStr} vs mes anterior</span>
        ) : (
          <span className="text-slate-400">Sin cambio vs mes anterior</span>
        )}
      </p>
    </div>
  )
}

// ── Budget Bar ─────────────────────────────────────────────────────────────────

function BudgetBar({ budget }: { budget: BudgetResponse }) {
  if (!('id' in budget)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Presupuesto del mes
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Sin presupuesto configurado.{' '}
          <Link href="/vera/settings" className="text-blue-600 hover:underline">
            Configurar →
          </Link>
        </p>
      </div>
    )
  }

  const { percentage, spent, amount, currency = 'COP' } = budget
  const clamped  = Math.min(percentage, 100)
  const barColor =
    percentage >= 100 ? 'bg-red-500'   :
    percentage >= 80  ? 'bg-amber-500' :
    'bg-emerald-500'
  const pctColor =
    percentage >= 100 ? 'text-red-600 dark:text-red-400'     :
    percentage >= 80  ? 'text-amber-600 dark:text-amber-400' :
    'text-emerald-600 dark:text-emerald-400'

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Presupuesto del mes
        </p>
        <span className={`text-sm font-bold tabular-nums ${pctColor}`}>{percentage}%</span>
      </div>
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{fmt(spent, currency)} consumido</span>
        <span>Límite: {fmt(amount, currency)}</span>
      </div>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['TENANT_ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER']

export function VeraDashboard() {
  const user      = useAuthStore((s) => s.user)
  const canAccess = !!user?.role && ALLOWED_ROLES.includes(user.role)

  const [branchId,    setBranchId]    = useState('')
  const [branches,    setBranches]    = useState<Branch[]>([])
  const [summary,     setSummary]     = useState<SummaryData | null>(null)
  const [prevSummary, setPrevSummary] = useState<SummaryData | null>(null)
  const [timeline,    setTimeline]    = useState<TimelinePoint[]>([])
  const [budget,      setBudget]      = useState<BudgetResponse | null>(null)
  const [txs,         setTxs]         = useState<TxItem[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showNewTx,   setShowNewTx]   = useState(false)

  useEffect(() => {
    apiClient.get<{ data: Branch[] }>('/v1/branches')
      .then((res) => setBranches(res.data ?? []))
      .catch(() => {})
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    const txQs   = new URLSearchParams({ limit: '5', page: '1' })
    if (branchId) txQs.set('branchId', branchId)
    const budgetQs = branchId ? `?branchId=${branchId}` : ''

    Promise.allSettled([
      apiClient.get<SummaryData>(`/v1/vera/reports/summary?${buildSummaryQs(branchId, 0)}`),
      apiClient.get<SummaryData>(`/v1/vera/reports/summary?${buildSummaryQs(branchId, -1)}`),
      apiClient.get<{ data: TimelinePoint[] }>(`/v1/vera/reports/timeline?${buildTimelineQs(branchId)}`),
      apiClient.get<BudgetResponse>(`/v1/vera/budgets/current${budgetQs}`),
      apiClient.get<{ data: TxItem[] }>(`/v1/vera/transactions?${txQs}`),
    ]).then(([curr, prev, tl, bdg, txList]) => {
      if (curr.status   === 'fulfilled') setSummary(curr.value)
      if (prev.status   === 'fulfilled') setPrevSummary(prev.value)
      if (tl.status     === 'fulfilled') setTimeline(tl.value.data ?? [])
      if (bdg.status    === 'fulfilled') setBudget(bdg.value)
      if (txList.status === 'fulfilled') setTxs((txList.value.data ?? []).slice(0, 5))
    }).finally(() => setLoading(false))
  }, [branchId])

  useEffect(() => { load() }, [load])

  if (!canAccess) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        No tienes acceso a este módulo
      </div>
    )
  }

  const d = (curr: number, prev: number) =>
    summary && prevSummary ? curr - prev : null

  const selectCls =
    'rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none ' +
    'focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ' +
    'dark:border-slate-700 dark:bg-slate-900 dark:text-white'

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Dashboard financiero</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Resumen del mes actual</p>
        </div>
        <div className="flex items-center gap-3">
          {branches.length > 0 && (
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className={selectCls}
            >
              <option value="">Toda la empresa</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <button
            onClick={() => setShowNewTx(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <span className="text-base leading-none">+</span>
            Nueva transacción
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Ingresos"
          value={summary ? fmt(summary.income) : '—'}
          delta={d(summary?.income ?? 0, prevSummary?.income ?? 0)}
          loading={loading && !summary}
        />
        <KpiCard
          label="Egresos"
          value={summary ? fmt(summary.expense) : '—'}
          delta={d(summary?.expense ?? 0, prevSummary?.expense ?? 0)}
          invertDelta
          loading={loading && !summary}
        />
        <KpiCard
          label="Utilidad bruta"
          value={summary ? fmt(summary.grossProfit) : '—'}
          delta={d(summary?.grossProfit ?? 0, prevSummary?.grossProfit ?? 0)}
          loading={loading && !summary}
        />
        <KpiCard
          label="Margen"
          value={summary ? `${summary.margin}%` : '—'}
          delta={d(summary?.margin ?? 0, prevSummary?.margin ?? 0)}
          isPercent
          loading={loading && !summary}
        />
      </div>

      {/* Budget + Chart */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Budget — 1/3 */}
        <div>
          {loading && !budget ? (
            <div className="h-32 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
          ) : budget ? (
            <BudgetBar budget={budget} />
          ) : null}
        </div>

        {/* Line chart — 2/3 */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Evolución 6 meses
            </p>
            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-5 rounded-full bg-blue-500" />
                Ingresos
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-5 rounded-full bg-red-500" />
                Egresos
              </span>
            </div>
          </div>
          {loading && timeline.length === 0 ? (
            <div className="h-48 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700/50" />
          ) : (
            <LineChart data={timeline} />
          )}
        </div>
      </div>

      {/* Last 5 transactions */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Últimas transacciones</p>
          <Link href="/vera/transactions" className="text-xs text-blue-600 hover:underline">
            Ver todas →
          </Link>
        </div>

        {loading && txs.length === 0 ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-5 animate-pulse rounded-md bg-slate-100 dark:bg-slate-700" />
            ))}
          </div>
        ) : txs.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Sin transacciones registradas</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {txs.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={[
                    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    tx.type === 'income'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                  ].join(' ')}>
                    {tx.type === 'income' ? '+' : '−'}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {tx.description}
                    </p>
                    <p className="text-xs text-slate-400">
                      {tx.txCategory?.name ?? (tx.referenceType ?? 'Sin categoría')}
                      {' · '}
                      {new Date(tx.date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                      {tx.isManual && (
                        <span className="ml-1 text-slate-300 dark:text-slate-600">· Manual</span>
                      )}
                    </p>
                  </div>
                </div>
                <span className={[
                  'ml-4 shrink-0 text-sm font-semibold tabular-nums',
                  tx.type === 'income'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400',
                ].join(' ')}>
                  {tx.type === 'income' ? '+' : '−'}{fmt(tx.amount, tx.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showNewTx && (
        <ManualTransactionModal
          branches={branches}
          onClose={() => setShowNewTx(false)}
          onSuccess={load}
        />
      )}
    </div>
  )
}
