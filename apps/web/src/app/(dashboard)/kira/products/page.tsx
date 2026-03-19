'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { ProductFormModal } from '@/components/kira/ProductFormModal'
import type { Product } from '@/components/kira/ProductFormModal'
import { SkeletonRows } from '@/components/ui/SkeletonRows'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ProductsResponse {
  data: Product[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ─── Auxiliares ───────────────────────────────────────────────────────────────

function AbcBadge({ cls }: { cls: 'A' | 'B' | 'C' | null }) {
  if (!cls) return <span className="text-slate-300">—</span>
  const color = { A: 'bg-emerald-100 text-emerald-700', B: 'bg-amber-100 text-amber-700', C: 'bg-orange-100 text-orange-700' }[cls]
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${color}`}>
      {cls}
    </span>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const router  = useRouter()
  const user    = useAuthStore((s) => s.user)
  const canEdit = user?.role !== 'OPERATIVE'

  // Lista
  const [products, setProducts]   = useState<Product[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Filtros
  const [search, setSearch]           = useState('')
  const [liveSearch, setLiveSearch]   = useState('')  // valor controlado del input
  const [categoryFilter, setCategory] = useState('')
  const [abcFilter, setAbc]           = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  // Modal
  const [modal, setModal]                 = useState<'closed' | 'create' | 'edit'>('closed')
  const [editingProduct, setEditingProd]  = useState<Product | null>(null)

  // Categorías únicas derivadas de la lista cargada
  const categories = [...new Set(
    products.map((p) => p.category).filter((c): c is string => c !== null)
  )].sort()

  // ── Debounce de búsqueda (300 ms) ────────────────────────────────────────
  function handleSearchInput(value: string) {
    setLiveSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(value), 300)
  }

  // ── Fetch de productos ────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    setFetchError(null)
    const qs = new URLSearchParams()
    if (search)         qs.set('search',   search)
    if (categoryFilter) qs.set('category', categoryFilter)
    if (abcFilter)      qs.set('abcClass', abcFilter)
    const query = qs.toString()

    apiClient.get<ProductsResponse>(`/v1/kira/products${query ? `?${query}` : ''}`)
      .then((res) => { setProducts(res.data); setTotal(res.total) })
      .catch((err: unknown) => {
        const e = err as { message?: string }
        setFetchError(e.message ?? 'Error al cargar productos')
      })
      .finally(() => setLoading(false))
  }, [search, categoryFilter, abcFilter])

  // ── Abrir modales ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditingProd(null)
    setModal('create')
  }

  function openEdit(p: Product, ev: React.MouseEvent) {
    ev.stopPropagation()
    setEditingProd(p)
    setModal('edit')
  }

  function handleModalSuccess(saved: Product) {
    setModal('closed')
    setEditingProd(null)
    // Actualiza la lista localmente
    setProducts((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [saved, ...prev]
    })
    if (modal === 'create') setTotal((n) => n + 1)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6">

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Catálogo de productos</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {loading ? 'Cargando...' : `${total} ${total === 1 ? 'producto' : 'productos'}`}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <span className="text-base leading-none">+</span>
            Nuevo producto
          </button>
        )}
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre o SKU…"
          value={liveSearch}
          onChange={(e) => handleSearchInput(e.target.value)}
          className="w-64 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={abcFilter}
          onChange={(e) => setAbc(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Clase ABC</option>
          <option value="A">A — Alta rotación</option>
          <option value="B">B — Rotación media</option>
          <option value="C">C — Baja rotación</option>
        </select>
      </div>

      {/* ── Tabla ───────────────────────────────────────────────────────── */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Unidad</th>
                <th className="px-4 py-3 text-right">Precio venta</th>
                <th className="px-4 py-3 text-right">Stock mín.</th>
                <th className="px-4 py-3 text-center">ABC</th>
                <th className="px-4 py-3 text-center">Estado</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <SkeletonRows rows={8} cols={canEdit ? 9 : 8} />
              ) : fetchError ? (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="py-16 text-center">
                    <p className="text-sm text-red-500">{fetchError}</p>
                    <button onClick={() => setSearch((s) => s + ' ')} className="mt-3 text-sm text-blue-600 hover:underline">
                      Reintentar
                    </button>
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="py-16 text-center text-sm text-slate-400">
                    No se encontraron productos
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/kira/products/${p.id}`)}
                    className={['cursor-pointer transition-colors hover:bg-slate-50', !p.isActive ? 'opacity-50' : ''].join(' ')}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.sku}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                    <td className="px-4 py-3 text-slate-500">{p.category ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{p.unit}</td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {p.salePrice != null ? `$${p.salePrice.toLocaleString('es-CO')}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">{p.minStock}</td>
                    <td className="px-4 py-3 text-center"><AbcBadge cls={p.abcClass} /></td>
                    <td className="px-4 py-3 text-center">
                      {p.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />Inactivo
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={(ev) => openEdit(p, ev)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal crear / editar ─────────────────────────────────────────── */}
      {modal !== 'closed' && (
        <ProductFormModal
          mode={modal}
          product={editingProduct ?? undefined}
          onClose={() => { setModal('closed'); setEditingProd(null) }}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  )
}
