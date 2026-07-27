'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { SkeletonRows } from '@/components/ui/SkeletonRows'
import { getCache, setCache } from '@/lib/page-cache'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Stage { id: string; name: string; color: string | null; isFinalWon: boolean; isFinalLost: boolean }
interface Deal {
  id: string
  title: string
  value: number | null
  createdAt: string
  closedAt: string | null
  client: { id: string; name: string; company: string | null } | null
  stage: { id: string; name: string; color: string | null; isFinalWon: boolean; isFinalLost: boolean } | null
}

interface StagesResponse { data: Stage[]; total: number }
interface DealsResponse  { data: Deal[];  total: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number | null): string {
  if (n == null) return '—'
  return `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Estado de la venta derivado de la etapa (HU-126): ganada / perdida / en proceso. */
function dealOutcome(stage: Deal['stage']): { label: string; cls: string } {
  if (stage?.isFinalWon)  return { label: 'Ganada',     cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }
  if (stage?.isFinalLost) return { label: 'Perdida',    cls: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300' }
  return { label: 'En proceso', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' }
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function VentasHistoryPage() {
  const router = useRouter()

  const [deals, setDeals]     = useState<Deal[]>(() => getCache<Deal[]>('ari-history') ?? [])
  const [total, setTotal]     = useState(() => getCache<{ total: number }>('ari-history-meta')?.total ?? 0)
  const [loading, setLoading] = useState(!getCache<Deal[]>('ari-history'))
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [stages, setStages]   = useState<Stage[]>([])
  const [stageId, setStageId] = useState('')
  const [from, setFrom]       = useState('')
  const [to, setTo]           = useState('')
  const [rangeError, setRangeError] = useState<string | null>(null)

  // Etapas para el filtro (una vez)
  useEffect(() => {
    apiClient.get<StagesResponse>('/v1/ari/stages')
      .then((r) => setStages(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (from && to && from > to) { setRangeError('La fecha "Desde" no puede ser posterior a "Hasta"'); return }
    setRangeError(null)

    const noFilters = !stageId && !from && !to
    if (!(noFilters && getCache<Deal[]>('ari-history'))) setLoading(true)
    setFetchError(null)

    const qs = new URLSearchParams()
    if (stageId) qs.set('stageId', stageId)
    if (from)    qs.set('from', from)
    if (to)      qs.set('to', to)
    const query = qs.toString()

    apiClient.get<DealsResponse>(`/v1/ari/deals${query ? `?${query}` : ''}`)
      .then((res) => {
        setDeals(res.data); setTotal(res.total)
        if (noFilters) { setCache('ari-history', res.data); setCache('ari-history-meta', { total: res.total }) }
      })
      .catch((err: unknown) => setFetchError((err as { message?: string }).message ?? 'Error al cargar el historial'))
      .finally(() => setLoading(false))
  }, [stageId, from, to])

  function clearFilters(): void {
    setStageId(''); setFrom(''); setTo('')
  }
  const hasFilters = !!(stageId || from || to)

  return (
    <div className="p-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Ventas realizadas</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {loading ? 'Cargando…' : `${total} ${total === 1 ? 'venta' : 'ventas'}${hasFilters ? ' (filtradas)' : ''}`}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Etapa</label>
          <select
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">Todas las etapas</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isFinalWon ? ' (ganada)' : s.isFinalLost ? ' (perdida)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Desde</label>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Hasta</label>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" />
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Limpiar filtros
          </button>
        )}
      </div>
      {rangeError && <p className="mt-2 text-xs text-red-500">{rangeError}</p>}

      {/* Tabla */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                <th className="px-4 py-3">Venta</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Etapa</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {loading ? (
                <SkeletonRows rows={6} cols={6} />
              ) : fetchError ? (
                <tr><td colSpan={6} className="py-16 text-center text-sm text-red-500">{fetchError}</td></tr>
              ) : deals.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
                  {hasFilters ? 'No hay ventas para el filtro aplicado' : 'Aún no hay ventas registradas'}
                </td></tr>
              ) : (
                deals.map((d) => {
                  const outcome = dealOutcome(d.stage)
                  return (
                    <tr
                      key={d.id}
                      onClick={() => router.push('/ari/pipeline')}
                      className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{d.title}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{d.client?.name ?? <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.stage?.color ?? '#94a3b8' }} />
                          {d.stage?.name ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${outcome.cls}`}>{outcome.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">{fmtCurrency(d.value)}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{fmtDate(d.createdAt)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
