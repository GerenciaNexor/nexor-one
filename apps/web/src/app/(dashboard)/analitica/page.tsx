'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { LineChart, type ChartSeries } from '@/components/vera/LineChart'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Point {
  date:                  string
  purchasesReceived:     number
  purchasesAmount:       number
  salesCount:            number
  salesAmount:           number
  purchaseOrdersCreated: number
  quotesCreated:         number
}
interface Timeseries { from: string; to: string; scope: string; points: Point[] }

const RANGES = [
  { label: '7 días',  days: 7  },
  { label: '30 días', days: 30 },
  { label: '90 días', days: 90 },
]

const CHARTS: { title: string; key: keyof Point; color: string; fmt: 'integer' | 'compact'; help: string }[] = [
  { title: 'Compras realizadas',         key: 'purchasesReceived',     color: '#0ea5e9', fmt: 'integer', help: 'OC recibidas, por día' },
  { title: 'Monto comprado',             key: 'purchasesAmount',       color: '#0284c7', fmt: 'compact', help: 'Suma de OC recibidas, por día' },
  { title: 'Ventas realizadas',          key: 'salesCount',            color: '#10b981', fmt: 'integer', help: 'Deals ganados, por día' },
  { title: 'Monto vendido',              key: 'salesAmount',           color: '#059669', fmt: 'compact', help: 'Suma de deals ganados, por día' },
  { title: 'Órdenes de compra creadas',  key: 'purchaseOrdersCreated', color: '#8b5cf6', fmt: 'integer', help: 'OC creadas (≠ recibidas), por día' },
  { title: 'Cotizaciones realizadas',    key: 'quotesCreated',         color: '#f59e0b', fmt: 'integer', help: 'Cotizaciones creadas, por día' },
]

function dateStr(d: Date): string { return d.toISOString().slice(0, 10) }

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AnaliticaPage() {
  const [days, setDays]       = useState(30)
  const [ts, setTs]           = useState<Timeseries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetchData = useCallback(() => {
    setLoading(true); setError(null)
    const to   = new Date()
    const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
    apiClient.get<{ data: Timeseries }>(`/v1/dashboard/timeseries?from=${dateStr(from)}&to=${dateStr(to)}`)
      .then((r) => setTs(r.data))
      .catch((e: unknown) => setError((e as { message?: string }).message ?? 'Error al cargar el dashboard'))
      .finally(() => setLoading(false))
  }, [days])

  useEffect(() => { fetchData() }, [fetchData])

  function seriesFor(key: keyof Point, color: string): ChartSeries[] {
    return [{ label: '', color, points: (ts?.points ?? []).map((p) => ({ period: p.date, value: Number(p[key]) })) }]
  }

  return (
    <div className="p-6">
      {/* Encabezado + selector de rango */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Tendencias de compras y ventas en el tiempo.
            {ts && (
              <span className="ml-1 text-slate-400">
                {ts.scope === 'consolidado' ? 'Vista consolidada (todas las sucursales).' : 'Vista de tu sucursal.'}
              </span>
            )}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={[
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                days === r.days
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
              ].join(' ')}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
          <button onClick={fetchData} className="ml-3 text-blue-600 hover:underline">Reintentar</button>
        </div>
      )}

      {/* Grilla de 6 gráficos */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {CHARTS.map((c) => (
          <div key={c.key} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{c.title}</h2>
              <span className="text-xs text-slate-400">{c.help}</span>
            </div>
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              </div>
            ) : (
              <LineChart series={seriesFor(c.key, c.color)} dateFormat="day" valueFormat={c.fmt} className="h-48" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
