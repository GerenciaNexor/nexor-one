'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { LineChart, type ChartSeries } from '@/components/vera/LineChart'
import { BarChart, type BarDatum } from '@/components/dashboard/BarChart'
import { businessTodayStr, shiftDayStr, BUSINESS_TZ } from '@/lib/format-date'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Point {
  date:                  string
  purchasesReceived:     number
  purchasesAmount:       number
  salesCount:            number
  salesAmount:           number
  purchaseOrdersCreated: number   // el rollup lo sigue calculando; no se muestra (HU-129)
  quotesCreated:         number   // idem
}
interface Timeseries { from: string; to: string; scope: string; points: Point[] }

// HU-130 — Top 10 de productos
interface TopProduct { productId: string; name: string; sku: string; units: number; profit: number }
interface TopData { from: string; to: string; scope: string; byUnits: TopProduct[]; byProfit: TopProduct[] }

// HU-129 — solo 4 líneas. "OC creadas" y "Cotizaciones realizadas" se retiran de la vista
// (el rollup las sigue calculando; reversible sin migración).
const CHARTS = [
  { key: 'purchasesReceived', title: 'Compras realizadas', color: '#0ea5e9', fmt: 'integer', help: 'OC recibidas + registro rápido, por día' },
  { key: 'salesCount',        title: 'Ventas realizadas',  color: '#10b981', fmt: 'integer', help: 'Deals ganados + registro rápido, por día' },
  { key: 'purchasesAmount',   title: 'Monto comprado',     color: '#0284c7', fmt: 'compact', help: 'Suma de compras (OC recibidas + registro rápido), por día' },
  { key: 'salesAmount',       title: 'Monto vendido',      color: '#059669', fmt: 'compact', help: 'Suma de ventas (deals ganados + registro rápido), por día' },
] as const
type ChartKey = typeof CHARTS[number]['key']
const ALL_KEYS = CHARTS.map((c) => c.key) as ChartKey[]

const SHORTCUTS = [
  { label: 'Hoy',     days: 1  },
  { label: '7 días',  days: 7  },
  { label: '30 días', days: 30 },
  { label: '90 días', days: 90 },
]

// Rango anclado a HOY en la zona del negocio (manejo central de fechas, HU-173):
// evita el desfase de `toISOString()` (UTC) que de tarde en Colombia corría el "hasta hoy".
function daysAgo(n: number): string { return shiftDayStr(businessTodayStr(), -n) }

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AnaliticaPage() {
  const user = useAuthStore((s) => s.user)

  const [from, setFrom]       = useState(daysAgo(29))
  const [to, setTo]           = useState(daysAgo(0))
  const [visible, setVisible] = useState<ChartKey[]>(ALL_KEYS)
  const [menuOpen, setMenuOpen] = useState(false)
  const [ts, setTs]           = useState<Timeseries | null>(null)
  const [topData, setTopData] = useState<TopData | null>(null)
  const [topView, setTopView] = useState<'units' | 'profit'>('units')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)          // HU-174: estado del botón "Actualizar"
  const [lastRefresh, setLastRefresh] = useState<string | null>(null) // instante del último recálculo forzado

  const storageKey = user?.id ? `nexor-dashboard-charts:${user.id}` : null

  // Restaurar la selección de gráficos guardada por usuario (HU-129).
  useEffect(() => {
    if (!storageKey) return
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const saved = (JSON.parse(raw) as string[]).filter((k) => (ALL_KEYS as string[]).includes(k)) as ChartKey[]
        setVisible(saved)
      }
    } catch { /* preferencia corrupta → se ignora */ }
  }, [storageKey])

  function persist(next: ChartKey[]): void {
    setVisible(next)
    if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* sin persistencia */ } }
  }
  const toggleChart = (key: ChartKey): void =>
    persist(visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key])

  const rangeError = from > to ? '"Desde" no puede ser posterior a "Hasta".' : null

  const fetchData = useCallback(() => {
    if (from > to) { setLoading(false); return }
    setLoading(true); setError(null)
    Promise.all([
      apiClient.get<{ data: Timeseries }>(`/v1/dashboard/timeseries?from=${from}&to=${to}`).then((r) => setTs(r.data)),
      apiClient.get<{ data: TopData }>(`/v1/dashboard/top-products?from=${from}&to=${to}`).then((r) => setTopData(r.data)),
    ])
      .catch((e: unknown) => setError((e as { message?: string }).message ?? 'Error al cargar el dashboard'))
      .finally(() => setLoading(false))
  }, [from, to])

  useEffect(() => { fetchData() }, [fetchData])

  // HU-174 — Actualizar: fuerza el recálculo del rollup del día en curso en el backend
  // (desde las transacciones reales) y RECIÉN entonces recarga los datos frescos. No es
  // un simple "recargar la vista": primero recalcula, luego lee. Anti-doble-click con `refreshing`.
  async function handleRefresh(): Promise<void> {
    if (refreshing) return
    setRefreshing(true); setError(null)
    try {
      const r = await apiClient.post<{ data: { recalculatedAt: string } }>('/v1/dashboard/refresh', {})
      await new Promise<void>((resolve) => {
        Promise.all([
          apiClient.get<{ data: Timeseries }>(`/v1/dashboard/timeseries?from=${from}&to=${to}`).then((x) => setTs(x.data)),
          apiClient.get<{ data: TopData }>(`/v1/dashboard/top-products?from=${from}&to=${to}`).then((x) => setTopData(x.data)),
        ]).finally(() => resolve())
      })
      setLastRefresh(r.data.recalculatedAt)
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? 'No se pudo actualizar el dashboard')
    } finally {
      setRefreshing(false)
    }
  }

  function applyShortcut(days: number): void { setFrom(daysAgo(days - 1)); setTo(daysAgo(0)) }
  function clearFilters(): void {
    setFrom(daysAgo(29)); setTo(daysAgo(0))   // rango por defecto (30 días)
    persist([...ALL_KEYS])                      // mostrar todos los gráficos
    setTopView('units')                         // Top 10 por defecto
    setMenuOpen(false)
  }

  // ¿Los filtros están en su estado por defecto? (para deshabilitar "Limpiar" si no hay nada que limpiar)
  const isDefault = from === daysAgo(29) && to === daysAgo(0) && visible.length === ALL_KEYS.length && topView === 'units'
  function seriesFor(key: ChartKey, color: string): ChartSeries[] {
    return [{ label: '', color, points: (ts?.points ?? []).map((p) => ({ period: p.date, value: Number(p[key]) })) }]
  }

  const shown = CHARTS.filter((c) => visible.includes(c.key))
  const dateInput = 'rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'

  return (
    <div className="p-6 pb-28">{/* pb-28: deja espacio para que el botón flotante de chat (bottom-6 h-14) no tape el Top 10 */}
      {/* Encabezado */}
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

        {/* HU-174 — Actualizar: recalcula el día en curso y muestra la hora del último cálculo. */}
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Recalcula lo de hoy (ventas, compras y registro rápido) y muestra los valores frescos"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? 'animate-spin' : ''}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            {refreshing ? 'Actualizando…' : 'Actualizar'}
          </button>
          {lastRefresh && !refreshing && (
            <span className="text-xs text-slate-400">
              Actualizado a las {new Date(lastRefresh).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS_TZ })}
            </span>
          )}
        </div>
      </div>

      {/* Controles: rango de fechas + atajos + selección de gráficos */}
      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Desde</label>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={dateInput} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Hasta</label>
          <input type="date" value={to} min={from} max={daysAgo(0)} onChange={(e) => setTo(e.target.value)} className={dateInput} />
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
          {SHORTCUTS.map((s) => (
            <button key={s.label} onClick={() => applyShortcut(s.days)}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
              {s.label}
            </button>
          ))}
        </div>

        <button
          onClick={clearFilters}
          disabled={isDefault}
          title="Restablecer fechas, gráficos y vista del Top 10"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          Limpiar filtros
        </button>

        {/* Selección de gráficos (persistida por usuario) */}
        <div className="relative ml-auto">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
            Gráficos ({shown.length}/{CHARTS.length})
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <div className="flex justify-between px-2 pb-1.5 text-xs">
                  <button onClick={() => persist([...ALL_KEYS])} className="text-blue-600 hover:underline">Todos</button>
                  <button onClick={() => persist([])} className="text-slate-400 hover:underline">Ninguno</button>
                </div>
                {CHARTS.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700">
                    <input type="checkbox" checked={visible.includes(c.key)} onChange={() => toggleChart(c.key)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-200" />
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.title}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {rangeError && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">{rangeError}</div>
      )}
      {error && (
        <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
          <button onClick={fetchData} className="ml-3 text-blue-600 hover:underline">Reintentar</button>
        </div>
      )}

      {/* Grilla de gráficos seleccionados */}
      {shown.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400 dark:border-slate-700">
          No hay gráficos seleccionados. Usa el botón <strong>Gráficos</strong> para elegir cuáles ver.
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {shown.map((c) => (
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
      )}

      {/* Top 10 de productos (HU-130) — ranking en barras, no líneas */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Top 10 productos</h2>
            <span className="text-xs text-slate-400">
              {topView === 'units'
                ? 'Unidades vendidas (salidas con motivo venta)'
                : 'Ganancia = (precio de venta − costo) congelados × unidades'}
            </span>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
            {([['units', 'Más vendidos'], ['profit', 'Mayor ganancia']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setTopView(v)}
                className={['rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  topView === v ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          <BarChart
            data={(topView === 'units'
              ? (topData?.byUnits ?? []).map((p): BarDatum => ({ label: p.name, value: p.units }))
              : (topData?.byProfit ?? []).map((p): BarDatum => ({ label: p.name, value: p.profit })))}
            color={topView === 'units' ? '#10b981' : '#f59e0b'}
            valueFormat={topView === 'units' ? 'integer' : 'compact'}
            emptyText="No hay ventas en el periodo seleccionado."
          />
        )}
      </div>
    </div>
  )
}
