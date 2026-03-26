'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { SupplierFormModal } from '@/components/nira/SupplierFormModal'
import type { Supplier } from '@/components/nira/SupplierFormModal'
import { SkeletonRows } from '@/components/ui/SkeletonRows'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface SuppliersResponse {
  data: Supplier[]
  total: number
}

// ─── Auxiliares ───────────────────────────────────────────────────────────────

function DeactivateModal({
  supplier,
  onConfirm,
  onCancel,
  loading,
}: {
  supplier: Supplier
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60">
          <div className="px-6 pt-6 pb-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3 className="text-center text-base font-semibold text-slate-900">Desactivar proveedor</h3>
            <p className="mt-2 text-center text-sm text-slate-500">
              <span className="font-medium text-slate-700">{supplier.name}</span> quedará inactivo y no aparecerá en
              nuevas órdenes de compra. Las órdenes existentes no se verán afectadas.
            </p>
          </div>
          <div className="flex gap-2 border-t border-slate-100 px-6 py-4">
            <button
              onClick={onCancel}
              className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-60"
            >
              {loading ? 'Desactivando…' : 'Desactivar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

// Helper de color de score — umbral: >= 7 verde, >= 4 ámbar, < 4 rojo
function scoreColor(score: number): string {
  return score >= 7 ? 'bg-emerald-100 text-emerald-700'
       : score >= 4 ? 'bg-amber-100 text-amber-700'
       : 'bg-red-100 text-red-600'
}

export default function SuppliersPage() {
  const router  = useRouter()
  const user    = useAuthStore((s) => s.user)
  const canEdit = user?.role === 'AREA_MANAGER' || user?.role === 'BRANCH_ADMIN' ||
                  user?.role === 'TENANT_ADMIN'  || user?.role === 'SUPER_ADMIN'

  // Lista
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Filtros
  const [search, setSearch]         = useState('')
  const [liveSearch, setLiveSearch] = useState('')
  const [activeFilter, setActive]   = useState<'true' | 'false' | ''>('')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  // Modal crear/editar
  const [modal, setModal]                      = useState<'closed' | 'create' | 'edit'>('closed')
  const [editingSupplier, setEditingSupplier]  = useState<Supplier | null>(null)

  // Modal desactivar
  const [deactivating, setDeactivating]        = useState<Supplier | null>(null)
  const [deactivateLoading, setDeactivateLoad] = useState(false)

  // ── Debounce 300 ms ────────────────────────────────────────────────────────
  function handleSearchInput(value: string) {
    setLiveSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(value), 300)
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────
  function fetchSuppliers() {
    setLoading(true)
    setFetchError(null)
    const qs = new URLSearchParams()
    if (search)       qs.set('search', search)
    if (activeFilter) qs.set('active', activeFilter)
    const query = qs.toString()
    apiClient.get<SuppliersResponse>(`/v1/nira/suppliers${query ? `?${query}` : ''}`)
      .then((res) => { setSuppliers(res.data); setTotal(res.total) })
      .catch((err: unknown) => {
        const e = err as { message?: string }
        setFetchError(e.message ?? 'Error al cargar proveedores')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchSuppliers() }, [search, activeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modales ────────────────────────────────────────────────────────────────
  function openCreate() { setEditingSupplier(null); setModal('create') }

  function openEdit(s: Supplier, ev: React.MouseEvent) {
    ev.stopPropagation()
    setEditingSupplier(s)
    setModal('edit')
  }

  function handleModalSuccess(saved: Supplier) {
    setModal('closed')
    setEditingSupplier(null)
    setSuppliers((prev) => {
      const idx = prev.findIndex((s) => s.id === saved.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
      return [saved, ...prev]
    })
    if (modal === 'create') setTotal((n) => n + 1)
  }

  async function confirmDeactivate() {
    if (!deactivating) return
    setDeactivateLoad(true)
    try {
      await apiClient.delete(`/v1/nira/suppliers/${deactivating.id}`)
      setSuppliers((prev) => prev.map((s) =>
        s.id === deactivating.id ? { ...s, isActive: false } : s,
      ))
      setDeactivating(null)
    } catch (err: unknown) {
      const e = err as { message?: string }
      alert(e.message ?? 'Error al desactivar el proveedor')
    } finally {
      setDeactivateLoad(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const colCount = canEdit ? 8 : 7

  return (
    <div className="p-6">

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Proveedores</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {loading ? 'Cargando…' : `${total} ${total === 1 ? 'proveedor' : 'proveedores'}`}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <span className="text-base leading-none">+</span>
            Nuevo proveedor
          </button>
        )}
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre o NIT…"
          value={liveSearch}
          onChange={(e) => handleSearchInput(e.target.value)}
          className="w-64 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <select
          value={activeFilter}
          onChange={(e) => setActive(e.target.value as 'true' | 'false' | '')}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Solo activos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      </div>

      {/* ── Tabla (desktop) ─────────────────────────────────────────────── */}
      <div className="mt-4 hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">NIT</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Ciudad</th>
                <th className="px-4 py-3 text-right">Días crédito</th>
                <th className="px-4 py-3 text-center">Score</th>
                <th className="px-4 py-3 text-center">Estado</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <SkeletonRows rows={6} cols={colCount} />
              ) : fetchError ? (
                <tr>
                  <td colSpan={colCount} className="py-16 text-center">
                    <p className="text-sm text-red-500">{fetchError}</p>
                    <button onClick={fetchSuppliers} className="mt-3 text-sm text-blue-600 hover:underline">
                      Reintentar
                    </button>
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="py-16 text-center text-sm text-slate-400">
                    No se encontraron proveedores
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/nira/suppliers/${s.id}`)}
                    className={['cursor-pointer transition-colors hover:bg-slate-50', !s.isActive ? 'opacity-50' : ''].join(' ')}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.taxId ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-slate-500">{s.contactName ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-slate-500">{s.city ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {s.paymentTerms != null ? `${s.paymentTerms} días` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.score?.overallScore != null ? (
                        <span className={[
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                          s.score.overallScore >= 7 ? 'bg-emerald-100 text-emerald-700' :
                          s.score.overallScore >= 4 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-600',
                        ].join(' ')}>
                          {s.score.overallScore.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.isActive ? (
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
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={(ev) => { ev.stopPropagation(); openEdit(s, ev) }} className="text-xs text-blue-600 hover:underline">
                            Editar
                          </button>
                          {s.isActive && (
                            <button
                              onClick={(ev) => { ev.stopPropagation(); setDeactivating(s) }}
                              className="text-xs text-amber-600 hover:underline"
                            >
                              Desactivar
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Tarjetas (mobile) ────────────────────────────────────────────── */}
      <div className="mt-4 space-y-3 sm:hidden">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 h-4 w-40 rounded bg-slate-200" />
              <div className="h-3 w-28 rounded bg-slate-100" />
            </div>
          ))
        ) : fetchError ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center text-sm text-red-500">
            {fetchError}
            <button onClick={fetchSuppliers} className="mt-2 block text-blue-600 hover:underline">Reintentar</button>
          </div>
        ) : suppliers.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No se encontraron proveedores</p>
        ) : (
          suppliers.map((s) => (
            <div
              key={s.id}
              onClick={() => router.push(`/nira/suppliers/${s.id}`)}
              className={['cursor-pointer rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50', !s.isActive ? 'opacity-50' : ''].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{s.name}</p>
                  {s.taxId && <p className="mt-0.5 font-mono text-xs text-slate-400">{s.taxId}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {s.score?.overallScore != null && (
                    <span className={[
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                      s.score.overallScore >= 7 ? 'bg-emerald-100 text-emerald-700' :
                      s.score.overallScore >= 4 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-600',
                    ].join(' ')}>
                      {s.score.overallScore.toFixed(1)}
                    </span>
                  )}
                  {s.isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />Inactivo
                    </span>
                  )}
                </div>
              </div>
              {(s.contactName || s.city || s.paymentTerms != null) && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {s.contactName && <span>{s.contactName}</span>}
                  {s.city        && <span>{s.city}</span>}
                  {s.paymentTerms != null && <span>{s.paymentTerms} días de crédito</span>}
                </div>
              )}
              {canEdit && (
                <div className="mt-3 flex gap-3 border-t border-slate-100 pt-3">
                  <button onClick={(ev) => { ev.stopPropagation(); openEdit(s, ev) }} className="text-xs font-medium text-blue-600">
                    Editar
                  </button>
                  {s.isActive && (
                    <button onClick={(ev) => { ev.stopPropagation(); setDeactivating(s) }} className="text-xs font-medium text-amber-600">
                      Desactivar
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ── Modal crear / editar ─────────────────────────────────────────── */}
      {modal !== 'closed' && (
        <SupplierFormModal
          mode={modal}
          supplier={editingSupplier ?? undefined}
          onClose={() => { setModal('closed'); setEditingSupplier(null) }}
          onSuccess={handleModalSuccess}
        />
      )}

      {/* ── Modal desactivar ─────────────────────────────────────────────── */}
      {deactivating && (
        <DeactivateModal
          supplier={deactivating}
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivating(null)}
          loading={deactivateLoading}
        />
      )}
    </div>
  )
}
