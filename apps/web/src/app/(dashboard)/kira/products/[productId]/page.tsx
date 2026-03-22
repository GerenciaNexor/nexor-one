'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { ProductFormModal } from '@/components/kira/ProductFormModal'
import type { Product } from '@/components/kira/ProductFormModal'
import { getCache, setCache } from '@/lib/page-cache'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface BranchStock {
  stockId:        string
  branchId:       string
  branchName:     string
  city:           string | null
  isActiveBranch: boolean
  quantity:       number
  belowMin:       boolean
  updatedAt:      string
}

interface CrossBranchResponse {
  product:    Product
  branches:   BranchStock[]
  totalStock: number
}

// ─── Auxiliares ───────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide w-36 shrink-0">{label}</span>
      <span className="text-sm text-slate-800 text-right">{value}</span>
    </div>
  )
}

function AbcBadge({ cls }: { cls: 'A' | 'B' | 'C' | null }) {
  if (!cls) return <span className="text-slate-400">Sin clasificar</span>
  const color = {
    A: 'bg-emerald-100 text-emerald-700',
    B: 'bg-amber-100 text-amber-700',
    C: 'bg-orange-100 text-orange-700',
  }[cls]
  const label = { A: 'A — Alta rotación', B: 'B — Rotación media', C: 'C — Baja rotación' }[cls]
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${color}`}>
      {label}
    </span>
  )
}

// ─── Skeleton de detalle ──────────────────────────────────────────────────────

function ProductDetailSkeleton() {
  return (
    <div className="p-6">
      <div className="mb-4 h-3 w-20 animate-pulse rounded bg-slate-100" />
      <div className="mb-1 h-6 w-1/2 animate-pulse rounded bg-slate-100" />
      <div className="mb-6 h-3 w-28 animate-pulse rounded bg-slate-100" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="mb-4 h-3.5 w-36 animate-pulse rounded bg-slate-100" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex justify-between border-b border-slate-50 py-2.5 last:border-0">
              <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="mb-4 h-3.5 w-32 animate-pulse rounded bg-slate-100" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex justify-between border-b border-slate-50 py-2.5 last:border-0">
              <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-14 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>()
  const router        = useRouter()
  const user          = useAuthStore((s) => s.user)
  const canEdit       = user?.role !== 'OPERATIVE'

  const cacheKey = `product-${productId}`

  const [data, setData]         = useState<CrossBranchResponse | null>(
    () => getCache<CrossBranchResponse>(cacheKey) ?? null
  )
  const [loading, setLoading]   = useState(!getCache<CrossBranchResponse>(cacheKey))
  const [error, setError]       = useState<string | null>(null)
  const [showEdit, setShowEdit] = useState(false)

  function load(silent = false) {
    if (!silent) setLoading(true)
    setError(null)
    apiClient.get<CrossBranchResponse>(`/v1/kira/stock/cross-branch/${productId}`)
      .then((res) => { setData(res); setCache(cacheKey, res) })
      .catch((err: unknown) => {
        const e = err as { message?: string }
        setError(e.message ?? 'Error al cargar el producto')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(!!getCache<CrossBranchResponse>(cacheKey)) }, [productId])

  function handleEditSuccess(saved: Product) {
    setShowEdit(false)
    if (data) setData({ ...data, product: saved })
  }

  // ─── Estados de carga ────────────────────────────────────────────────────

  if (loading) return <ProductDetailSkeleton />

  if (error || !data) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-500">{error ?? 'Producto no encontrado'}</p>
        <button onClick={() => router.back()} className="mt-3 text-sm text-blue-600 hover:underline">
          Volver
        </button>
      </div>
    )
  }

  const { product: p, branches, totalStock } = data

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-6">

      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1.5 text-xs text-slate-400">
        <Link href="/kira/products" className="hover:text-slate-600 hover:underline">
          Catálogo
        </Link>
        <span>/</span>
        <span className="text-slate-600">{p.name}</span>
      </nav>

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">{p.name}</h1>
              {!p.isActive && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
                  Inactivo
                </span>
              )}
            </div>
            <p className="mt-0.5 font-mono text-xs text-slate-400">{p.sku}</p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowEdit(true)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Editar producto
          </button>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">

        {/* ── Ficha del producto ───────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Información general</h2>
          <Row label="Categoría"    value={p.category    ?? <span className="text-slate-300">—</span>} />
          <Row label="Unidad"       value={p.unit} />
          <Row label="Precio venta" value={p.salePrice  != null ? `$${p.salePrice.toLocaleString('es-CO')}` : <span className="text-slate-300">—</span>} />
          <Row label="Costo unit."  value={p.costPrice  != null ? `$${p.costPrice.toLocaleString('es-CO')}` : <span className="text-slate-300">—</span>} />
          <Row label="Stock mín."   value={p.minStock} />
          <Row label="Stock máx."   value={p.maxStock != null ? p.maxStock : <span className="text-slate-300">Sin límite</span>} />
          <Row label="Clase ABC"    value={<AbcBadge cls={p.abcClass} />} />
          {p.description && (
            <Row label="Descripción" value={<span className="max-w-xs text-left">{p.description}</span>} />
          )}
          <Row
            label="Creado"
            value={new Date(p.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
          />
        </div>

        {/* ── Stock por sucursal ───────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Stock por sucursal</h2>
            <span className="text-xs text-slate-400">
              Total: <span className="font-semibold text-slate-700">{totalStock} {p.unit}</span>
            </span>
          </div>

          {branches.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Sin registros de stock aún
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="pb-2">Sucursal</th>
                  <th className="pb-2 text-right">Cantidad</th>
                  <th className="pb-2 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {branches.map((b) => (
                  <tr key={b.branchId}>
                    <td className="py-2.5">
                      <p className="font-medium text-slate-800">{b.branchName}</p>
                      {b.city && <p className="text-xs text-slate-400">{b.city}</p>}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-slate-800">
                      {b.quantity} {p.unit}
                    </td>
                    <td className="py-2.5 text-center">
                      {b.belowMin ? (
                        <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                          Bajo mínimo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal de edición */}
      {showEdit && (
        <ProductFormModal
          mode="edit"
          product={p}
          onClose={() => setShowEdit(false)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  )
}
