'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { SkeletonRows } from '@/components/ui/SkeletonRows'
import { getCache, setCache } from '@/lib/page-cache'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type POStatus = 'draft' | 'submitted' | 'approved' | 'sent' | 'partial' | 'received' | 'cancelled'

interface PurchaseOrder {
  id: string
  orderNumber: string
  status: POStatus
  total: number
  createdAt: string
  expectedDelivery: string | null
  supplier: { name: string } | null
}

interface POResponse { data: PurchaseOrder[]; total: number }

// ─── Estados canónicos (HU-116) ────────────────────────────────────────────────

const STATUS_LABELS: Record<POStatus, string> = {
  draft: 'Borrador', submitted: 'En aprobación', approved: 'Aprobada',
  sent: 'Enviada', partial: 'Recibida parcial', received: 'Recibida', cancelled: 'Cancelada',
}
const STATUS_COLORS: Record<POStatus, string> = {
  draft:     'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  approved:  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  sent:      'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  partial:   'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  received:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',
}
const STATUS_ORDER: POStatus[] = ['draft', 'submitted', 'approved', 'sent', 'partial', 'received', 'cancelled']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ComprasHistoryPage() {
  const router = useRouter()

  const [orders, setOrders]   = useState<PurchaseOrder[]>(() => getCache<PurchaseOrder[]>('nira-history') ?? [])
  const [total, setTotal]     = useState(() => getCache<{ total: number }>('nira-history-meta')?.total ?? 0)
  const [loading, setLoading] = useState(!getCache<PurchaseOrder[]>('nira-history'))
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [status, setStatus] = useState<POStatus | ''>('')
  const [from, setFrom]     = useState('')
  const [to, setTo]         = useState('')
  const [rangeError, setRangeError] = useState<string | null>(null)

  useEffect(() => {
    if (from && to && from > to) { setRangeError('La fecha "Desde" no puede ser posterior a "Hasta"'); return }
    setRangeError(null)

    const noFilters = !status && !from && !to
    if (!(noFilters && getCache<PurchaseOrder[]>('nira-history'))) setLoading(true)
    setFetchError(null)

    const qs = new URLSearchParams()
    if (status) qs.set('status', status)
    if (from)   qs.set('from', from)
    if (to)     qs.set('to', to)
    const query = qs.toString()

    apiClient.get<POResponse>(`/v1/nira/purchase-orders${query ? `?${query}` : ''}`)
      .then((res) => {
        setOrders(res.data); setTotal(res.total)
        if (noFilters) { setCache('nira-history', res.data); setCache('nira-history-meta', { total: res.total }) }
      })
      .catch((err: unknown) => setFetchError((err as { message?: string }).message ?? 'Error al cargar el historial'))
      .finally(() => setLoading(false))
  }, [status, from, to])

  function clearFilters(): void {
    setStatus(''); setFrom(''); setTo('')
  }
  const hasFilters = !!(status || from || to)

  return (
    <div className="p-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Compras realizadas</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {loading ? 'Cargando…' : `${total} ${total === 1 ? 'orden' : 'órdenes'}${hasFilters ? ' (filtradas)' : ''}`}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Estado</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as POStatus | '')}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">Todos los estados</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
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
                <th className="px-4 py-3">Orden</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {loading ? (
                <SkeletonRows rows={6} cols={5} />
              ) : fetchError ? (
                <tr><td colSpan={5} className="py-16 text-center text-sm text-red-500">{fetchError}</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={5} className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
                  {hasFilters ? 'No hay órdenes para el filtro aplicado' : 'Aún no hay órdenes de compra'}
                </td></tr>
              ) : (
                orders.map((po) => (
                  <tr
                    key={po.id}
                    onClick={() => router.push(`/nira/purchase-orders/${po.id}`)}
                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{po.orderNumber}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{po.supplier?.name ?? <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[po.status]}`}>{STATUS_LABELS[po.status]}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">{fmtCurrency(po.total)}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{fmtDate(po.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
