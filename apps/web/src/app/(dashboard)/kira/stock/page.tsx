'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { MovementModal } from '@/components/kira/MovementModal'
import type { StockRow } from '@/components/kira/MovementModal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface StockResponse {
  data:  StockRow[]
  total: number
}

// ─── Auxiliares ───────────────────────────────────────────────────────────────

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function StockPage() {
  const router      = useRouter()
  const user        = useAuthStore((s) => s.user)
  const isOperative = user?.role === 'OPERATIVE'

  const [stocks, setStocks]         = useState<StockRow[]>([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Modal de movimiento
  const [modalOpen, setModalOpen]             = useState(false)
  const [modalProductId, setModalProductId]   = useState<string | undefined>()
  const [modalBranchId, setModalBranchId]     = useState<string | undefined>()

  // Filtros
  const [search, setSearch]       = useState('')
  const [branchFilter, setBranch] = useState('')
  const [onlyCritical, setCrit]   = useState(false)

  function load() {
    setLoading(true)
    setFetchError(null)
    apiClient.get<StockResponse>('/v1/kira/stock')
      .then((r) => { setStocks(r.data); setTotal(r.data.length) })
      .catch((err: unknown) => {
        const e = err as { message?: string }
        setFetchError(e.message ?? 'Error al cargar el stock')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Sucursales únicas (para filtro de AREA_MANAGER)
  const branchOptions = [...new Map(
    stocks.map((s) => [s.branch.id, s.branch])
  ).values()]

  // Filtrado local (el endpoint ya aplica el filtro de sucursal para OPERATIVE)
  const filtered = stocks.filter((s) => {
    if (branchFilter && s.branch.id !== branchFilter) return false
    if (onlyCritical && !s.belowMin) return false
    if (search) {
      const q = search.toLowerCase()
      return s.product.name.toLowerCase().includes(q) || s.product.sku.toLowerCase().includes(q)
    }
    return true
  })

  const criticalCount = stocks.filter((s) => s.belowMin).length

  function openModal(productId?: string, branchId?: string) {
    setModalProductId(productId)
    setModalBranchId(branchId)
    setModalOpen(true)
  }

  function handleMovementSuccess() {
    setModalOpen(false)
    setModalProductId(undefined)
    setModalBranchId(undefined)
    load() // refresca el stock en pantalla
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-6">

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Stock actual</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {loading
              ? 'Cargando…'
              : `${total} registros${criticalCount > 0 ? ` · ${criticalCount} bajo mínimo` : ''}`}
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <span className="text-base leading-none">+</span>
          Nuevo movimiento
        </button>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar producto o SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        {!isOperative && branchOptions.length > 1 && (
          <select
            value={branchFilter}
            onChange={(e) => setBranch(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Todas las sucursales</option>
            {branchOptions.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          <input
            type="checkbox"
            checked={onlyCritical}
            onChange={(e) => setCrit(e.target.checked)}
            className="accent-red-500"
          />
          Solo críticos
        </label>
      </div>

      {/* ── Tabla ───────────────────────────────────────────────────────── */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Spinner /></div>
        ) : fetchError ? (
          <div className="py-16 text-center">
            <p className="text-sm text-red-500">{fetchError}</p>
            <button onClick={load} className="mt-3 text-sm text-blue-600 hover:underline">Reintentar</button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">
            {onlyCritical ? 'No hay productos con stock crítico' : 'No se encontraron productos'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">SKU</th>
                  {!isOperative && <th className="px-4 py-3">Sucursal</th>}
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3 text-right">Mínimo</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/kira/products/${s.product.id}`)}
                    className={[
                      'cursor-pointer transition-colors hover:bg-slate-50',
                      s.belowMin ? 'bg-red-50/40' : '',
                    ].join(' ')}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{s.product.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.product.sku}</td>
                    {!isOperative && (
                      <td className="px-4 py-3 text-slate-500">{s.branch.name}</td>
                    )}
                    <td className={[
                      'px-4 py-3 text-right font-semibold',
                      s.belowMin ? 'text-red-600' : 'text-slate-800',
                    ].join(' ')}>
                      {s.quantity} {s.product.unit}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">{s.product.minStock}</td>
                    <td className="px-4 py-3 text-center">
                      {s.belowMin ? (
                        <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          <AlertIcon />
                          Bajo mínimo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          OK
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation()
                          openModal(s.product.id, s.branch.id)
                        }}
                        className="whitespace-nowrap rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-white transition-colors"
                      >
                        + Movimiento
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <MovementModal
          stocks={stocks}
          initialProductId={modalProductId}
          initialBranchId={modalBranchId}
          onClose={() => setModalOpen(false)}
          onSuccess={handleMovementSuccess}
        />
      )}
    </div>
  )
}
