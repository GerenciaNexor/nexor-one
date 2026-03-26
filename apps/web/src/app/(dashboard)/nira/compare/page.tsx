'use client'

import { useState, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api-client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Product {
  id:   string
  sku:  string
  name: string
  unit: string
}

interface SupplierRow {
  supplierId:       string
  supplierName:     string
  overallScore:     number | null
  minPrice:         number
  maxPrice:         number
  avgPrice:         number
  timesSupplied:    number
  lastPurchaseDate: string
  isBestPrice:      boolean
  isBestScore:      boolean
}

interface CompareResult {
  product: Product
  data:    SupplierRow[]
  total:   number
  message?: string
}

// ─── Auxiliares ───────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `$${n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-slate-300">—</span>
  const color =
    score >= 7 ? 'text-emerald-600' :
    score >= 4 ? 'text-amber-600' :
    'text-red-500'
  return <span className={`font-semibold ${color}`}>{score.toFixed(1)}</span>
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const [products,     setProducts]     = useState<Product[]>([])
  const [productId,    setProductId]    = useState('')
  const [liveSearch,   setLiveSearch]   = useState('')
  const [search,       setSearch]       = useState('')
  const [result,       setResult]       = useState<CompareResult | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [fetchError,   setFetchError]   = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  // ── Cargar catálogo de productos ───────────────────────────────────────────
  useEffect(() => {
    apiClient.get<{ data: Product[] }>('/v1/kira/products?pageSize=500')
      .then((r) => setProducts(r.data))
      .catch(() => null)
  }, [])

  // ── Debounce de búsqueda ───────────────────────────────────────────────────
  function handleSearchInput(value: string) {
    setLiveSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(value), 250)
  }

  // ── Filtrado local de productos ────────────────────────────────────────────
  const filteredProducts = search
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku.toLowerCase().includes(search.toLowerCase()),
      )
    : products

  // ── Consultar comparador ───────────────────────────────────────────────────
  async function handleCompare(pid: string) {
    if (!pid) return
    setLoading(true)
    setFetchError(null)
    setResult(null)
    try {
      const data = await apiClient.get<CompareResult>(`/v1/nira/compare?productId=${pid}`)
      setResult(data)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setFetchError(e.message ?? 'Error al consultar el comparador')
    } finally {
      setLoading(false)
    }
  }

  function pickProduct(pid: string) {
    setProductId(pid)
    handleCompare(pid)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Comparador de precios</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Compara el historial de precios de un producto entre todos los proveedores que lo han suministrado.
        </p>
      </div>

      {/* ── Buscador de producto ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <label className="mb-2 block text-sm font-medium text-slate-700">Selecciona un producto</label>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Buscar por nombre o SKU…"
            value={liveSearch}
            onChange={(e) => handleSearchInput(e.target.value)}
            className="w-72 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <select
            value={productId}
            onChange={(e) => pickProduct(e.target.value)}
            className="w-72 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">— Elige un producto —</option>
            {filteredProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Estado de carga ──────────────────────────────────────────────── */}
      {loading && (
        <div className="mt-6 flex items-center gap-3 text-sm text-slate-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          Consultando historial de precios…
        </div>
      )}

      {fetchError && (
        <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {fetchError}
        </div>
      )}

      {/* ── Resultado ───────────────────────────────────────────────────── */}
      {result && !loading && (
        <div className="mt-6 space-y-5">

          {/* Producto consultado */}
          <div className="flex items-center gap-3">
            <div>
              <span className="font-mono text-xs text-slate-400">{result.product.sku}</span>
              <h2 className="text-base font-semibold text-slate-900">{result.product.name}</h2>
            </div>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              Unidad: {result.product.unit}
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {result.total} {result.total === 1 ? 'proveedor' : 'proveedores'}
            </span>
          </div>

          {/* Sin historial */}
          {result.data.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-600">Sin historial de compras</p>
              <p className="mt-1 text-xs text-slate-400">{result.message}</p>
            </div>
          ) : (
            <>
              {/* Leyenda */}
              <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Mejor precio
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                  Mejor score general
                </span>
              </div>

              {/* Tabla desktop */}
              <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Proveedor</th>
                      <th className="px-4 py-3 text-right">Precio mín.</th>
                      <th className="px-4 py-3 text-right">Precio máx.</th>
                      <th className="px-4 py-3 text-right">Precio prom.</th>
                      <th className="px-4 py-3 text-center">Veces</th>
                      <th className="px-4 py-3 text-center">Score</th>
                      <th className="px-4 py-3">Última compra</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.data.map((row, idx) => (
                      <tr
                        key={row.supplierId}
                        className={[
                          'transition-colors',
                          row.isBestPrice ? 'bg-emerald-50/60' : 'hover:bg-slate-50',
                        ].join(' ')}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {/* Posición */}
                            <span className={[
                              'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                              idx === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
                            ].join(' ')}>
                              {idx + 1}
                            </span>
                            <span className="font-medium text-slate-900">{row.supplierName}</span>
                            <div className="flex gap-1">
                              {row.isBestPrice && (
                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  Mejor precio
                                </span>
                              )}
                              {row.isBestScore && (
                                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                                  Mejor score
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(row.minPrice)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500">{fmt(row.maxPrice)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={[
                            'font-semibold font-mono',
                            row.isBestPrice ? 'text-emerald-700' : 'text-slate-900',
                          ].join(' ')}>
                            {fmt(row.avgPrice)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500">
                          {row.timesSupplied}×
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ScoreBadge score={row.overallScore} />
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {new Date(row.lastPurchaseDate).toLocaleDateString('es-CO', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tarjetas mobile */}
              <div className="space-y-3 sm:hidden">
                {result.data.map((row, idx) => (
                  <div
                    key={row.supplierId}
                    className={[
                      'rounded-xl border p-4',
                      row.isBestPrice
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : 'border-slate-200 bg-white',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={[
                          'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                          idx === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
                        ].join(' ')}>
                          {idx + 1}
                        </span>
                        <p className="font-medium text-slate-900">{row.supplierName}</p>
                      </div>
                      <ScoreBadge score={row.overallScore} />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-slate-400">Mín.</p>
                        <p className="font-mono font-medium text-slate-700">{fmt(row.minPrice)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Promedio</p>
                        <p className={['font-mono font-semibold', row.isBestPrice ? 'text-emerald-700' : 'text-slate-900'].join(' ')}>
                          {fmt(row.avgPrice)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Máx.</p>
                        <p className="font-mono text-slate-500">{fmt(row.maxPrice)}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                      <span>{row.timesSupplied} compra{row.timesSupplied !== 1 ? 's' : ''}</span>
                      <span>
                        {new Date(row.lastPurchaseDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    {(row.isBestPrice || row.isBestScore) && (
                      <div className="mt-2 flex gap-1.5">
                        {row.isBestPrice && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Mejor precio
                          </span>
                        )}
                        {row.isBestScore && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                            Mejor score
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Placeholder inicial */}
      {!result && !loading && !fetchError && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <p className="text-sm text-slate-400">Selecciona un producto para ver el comparativo de precios</p>
        </div>
      )}
    </div>
  )
}
