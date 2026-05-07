'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { PurchaseOrderFormModal } from '@/components/nira/PurchaseOrderFormModal'
import { SkeletonRows } from '@/components/ui/SkeletonRows'
import type { OrderExtraction } from '@/components/ocr/OcrExtractButton'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PurchaseOrder {
  id:               string
  orderNumber:      string
  status:           PurchaseOrderStatus
  subtotal:         number
  tax:              number
  total:            number
  expectedDelivery: string | null
  createdAt:        string
  updatedAt:        string
  supplier: { id: string; name: string } | null
  branch:   { id: string; name: string } | null
  creator:  { id: string; name: string }
  approver: { id: string; name: string } | null
  _count:   { items: number }
}

export type PurchaseOrderStatus =
  | 'draft' | 'pending_approval' | 'approved'
  | 'sent'  | 'partial'          | 'received' | 'cancelled'

interface POResponse { data: PurchaseOrder[]; total: number }

// ─── Badge de estado ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft:            'Borrador',
  pending_approval: 'En aprobación',
  approved:         'Aprobada',
  sent:             'Enviada',
  partial:          'Recibida parcial',
  received:         'Recibida',
  cancelled:        'Cancelada',
}

const STATUS_COLORS: Record<PurchaseOrderStatus, string> = {
  draft:            'bg-slate-100 text-slate-600',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved:         'bg-blue-100 text-blue-700',
  sent:             'bg-violet-100 text-violet-700',
  partial:          'bg-orange-100 text-orange-700',
  received:         'bg-emerald-100 text-emerald-700',
  cancelled:        'bg-red-100 text-red-500',
}

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  // Params de alerta de reabastecimiento (llegan desde notificación NIRA)
  const alertProductId = searchParams.get('productId')
  const alertBranchId  = searchParams.get('branchId')
  const hasAlertParams = Boolean(alertProductId && alertBranchId)

  const [orders,     setOrders]     = useState<PurchaseOrder[]>([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [statusFilter,   setStatusFilter]   = useState<PurchaseOrderStatus | ''>('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [suppliers,      setSuppliers]      = useState<{ id: string; name: string }[]>([])
  const [search,         setSearch]         = useState('')
  const [liveSearch,     setLiveSearch]     = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  // Carga proveedores para el filtro
  useEffect(() => {
    apiClient.get<{ data: { id: string; name: string }[] }>('/v1/nira/suppliers?limit=200')
      .then((r) => setSuppliers(r.data))
      .catch(() => null)
  }, [])

  const [showCreateModal, setShowCreateModal] = useState(false)

  const ocrInputRef                 = useRef<HTMLInputElement>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrError,   setOcrError]   = useState<string | null>(null)
  const [ocrData,    setOcrData]    = useState<OrderExtraction | null>(null)

  // Estado del flujo "crear desde alerta"
  const [alertLoading, setAlertLoading] = useState(false)
  const [alertError,   setAlertError]   = useState<string | null>(null)

  // ── Debounce 300 ms ────────────────────────────────────────────────────────
  function handleSearchInput(value: string) {
    setLiveSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(value), 300)
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────
  function fetchOrders() {
    setLoading(true)
    setFetchError(null)
    const qs = new URLSearchParams()
    if (statusFilter) qs.set('status', statusFilter)
    const query = qs.toString()
    apiClient.get<POResponse>(`/v1/nira/purchase-orders${query ? `?${query}` : ''}`)
      .then((res) => {
        const filtered = res.data.filter((o) => {
          const matchSearch = !search ||
            o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
            (o.supplier?.name ?? '').toLowerCase().includes(search.toLowerCase())
          const matchSupplier = !supplierFilter || o.supplier?.id === supplierFilter
          return matchSearch && matchSupplier
        })
        setOrders(filtered)
        setTotal(res.total)
      })
      .catch((err: unknown) => {
        const e = err as { message?: string }
        setFetchError(e.message ?? 'Error al cargar las órdenes de compra')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchOrders() }, [statusFilter, supplierFilter, search]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Crear borrador desde alerta ────────────────────────────────────────────
  async function handleCreateFromAlert() {
    if (!alertProductId || !alertBranchId) return
    setAlertLoading(true)
    setAlertError(null)
    try {
      const po = await apiClient.post<{ id: string }>('/v1/nira/purchase-orders/from-alert', {
        productId: alertProductId,
        branchId:  alertBranchId,
      })
      router.push(`/nira/purchase-orders/${po.id}`)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setAlertError(e.message ?? 'Error al crear el borrador')
      setAlertLoading(false)
    }
  }

  // ── Importar desde documento (OCR) ───────────────────────────────────────

  async function handleOcrFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (ocrInputRef.current) ocrInputRef.current.value = ''

    setOcrLoading(true)
    setOcrError(null)
    setOcrData(null)

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('type', 'order')

      const token  = useAuthStore.getState().token
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

      const res = await fetch(`${apiUrl}/v1/ocr/extract`, {
        method:  'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body:    form,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Error al procesar el documento')
      }

      const json = await res.json() as { data: OrderExtraction }
      setOcrData(json.data)
      setShowCreateModal(true)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setOcrError(e.message ?? 'No se pudo procesar el documento. Intenta con una imagen de mayor calidad.')
    } finally {
      setOcrLoading(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">

      {/* ── Banner de alerta de reabastecimiento ──────────────────────────── */}
      {hasAlertParams && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-900">Alerta de stock crítico</p>
                <p className="mt-0.5 text-sm text-amber-700">
                  Se detectó un producto por debajo del mínimo. El sistema puede crear un borrador de OC
                  con el proveedor de mejor score automáticamente.
                </p>
                {alertError && (
                  <p className="mt-1 text-xs text-red-600">{alertError}</p>
                )}
              </div>
            </div>
            <button
              onClick={handleCreateFromAlert}
              disabled={alertLoading}
              className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
            >
              {alertLoading ? 'Creando borrador…' : 'Crear borrador de OC'}
            </button>
          </div>
        </div>
      )}

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Órdenes de compra</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {loading ? 'Cargando…' : `${total} ${total === 1 ? 'orden' : 'órdenes'} en total`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Input oculto para seleccionar imagen/PDF */}
          <input
            ref={ocrInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
            className="sr-only"
            onChange={handleOcrFile}
            disabled={ocrLoading}
            aria-label="Seleccionar documento para importar orden de compra"
          />
          <button
            onClick={() => ocrInputRef.current?.click()}
            disabled={ocrLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-60"
          >
            {ocrLoading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" />
                <span>Leyendo documento...</span>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
                  <line x1="7" y1="12" x2="17" y2="12"/>
                </svg>
                <span>Importar desde documento</span>
              </>
            )}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <span className="text-base leading-none">+</span>
            Nueva OC
          </button>
        </div>
      </div>

      {/* Error OCR */}
      {ocrError && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span className="flex-1">{ocrError}</span>
          <div className="flex gap-2">
            <button
              onClick={() => ocrInputRef.current?.click()}
              className="rounded px-2 py-1 text-xs font-medium hover:bg-red-100"
            >
              Reintentar
            </button>
            <button
              onClick={() => { setOcrError(null); setShowCreateModal(true) }}
              className="rounded px-2 py-1 text-xs font-medium hover:bg-red-100"
            >
              Crear manualmente
            </button>
          </div>
        </div>
      )}

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar por # OC o proveedor…"
          value={liveSearch}
          onChange={(e) => handleSearchInput(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-60"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PurchaseOrderStatus | '')}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Todos los estados</option>
          {(Object.keys(STATUS_LABELS) as PurchaseOrderStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {suppliers.length > 0 && (
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Todos los proveedores</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Tabla (desktop) ─────────────────────────────────────────────── */}
      <div className="mt-4 hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">N° OC</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Productos</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Entrega esperada</th>
                <th className="px-4 py-3">Creado por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <SkeletonRows rows={6} cols={8} />
              ) : fetchError ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <p className="text-sm text-red-500">{fetchError}</p>
                    <button onClick={fetchOrders} className="mt-3 text-sm text-blue-600 hover:underline">Reintentar</button>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-sm text-slate-400">
                    No se encontraron órdenes de compra
                  </td>
                </tr>
              ) : (
                orders.map((o) => {
                  const isCancelled = o.status === 'cancelled'
                  return (
                    <tr
                      key={o.id}
                      onClick={() => router.push(`/nira/purchase-orders/${o.id}`)}
                      className={[
                        'cursor-pointer transition-colors',
                        isCancelled
                          ? 'bg-slate-50 opacity-60 hover:opacity-80'
                          : 'hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <td className={`px-4 py-3 font-mono text-xs font-semibold ${isCancelled ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        {o.orderNumber}
                      </td>
                      <td className={`px-4 py-3 font-medium ${isCancelled ? 'text-slate-400' : 'text-slate-900'}`}>
                        {o.supplier?.name ?? <span className="italic text-slate-400">Sin proveedor</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {o.branch?.name ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-3 text-slate-500">{o._count.items} {o._count.items === 1 ? 'producto' : 'productos'}</td>
                      <td className={`px-4 py-3 text-right font-medium ${isCancelled ? 'text-slate-400' : 'text-slate-900'}`}>
                        ${o.total.toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {o.expectedDelivery
                          ? new Date(o.expectedDelivery).toLocaleDateString('es-CO')
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{o.creator.name}</td>
                    </tr>
                  )
                })
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
              <div className="mb-2 h-4 w-32 rounded bg-slate-200" />
              <div className="h-3 w-24 rounded bg-slate-100" />
            </div>
          ))
        ) : fetchError ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center text-sm text-red-500">
            {fetchError}
            <button onClick={fetchOrders} className="mt-2 block text-blue-600 hover:underline">Reintentar</button>
          </div>
        ) : orders.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No se encontraron órdenes de compra</p>
        ) : (
          orders.map((o) => {
            const isCancelled = o.status === 'cancelled'
            return (
              <div
                key={o.id}
                onClick={() => router.push(`/nira/purchase-orders/${o.id}`)}
                className={[
                  'cursor-pointer rounded-xl border p-4 transition-colors',
                  isCancelled
                    ? 'border-slate-200 bg-slate-50 opacity-60 hover:opacity-80'
                    : 'border-slate-200 bg-white hover:bg-slate-50',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className={`font-mono text-xs font-semibold ${isCancelled ? 'text-slate-400 line-through' : 'text-slate-500'}`}>
                      {o.orderNumber}
                    </p>
                    <p className={`mt-0.5 font-medium ${isCancelled ? 'text-slate-400' : 'text-slate-900'}`}>
                      {o.supplier?.name ?? <span className="italic text-slate-400">Sin proveedor</span>}
                    </p>
                    {o.branch && (
                      <p className="mt-0.5 text-xs text-slate-400">{o.branch.name}</p>
                    )}
                  </div>
                  <StatusBadge status={o.status} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{o._count.items} productos</span>
                  <span className={`font-medium ${isCancelled ? 'text-slate-400' : 'text-slate-700'}`}>
                    ${o.total.toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Modal crear OC ───────────────────────────────────────────────── */}
      {showCreateModal && (
        <PurchaseOrderFormModal
          onClose={() => { setShowCreateModal(false); setOcrData(null) }}
          initialData={ocrData ?? undefined}
          onSuccess={() => { setShowCreateModal(false); setOcrData(null); fetchOrders() }}
        />
      )}
    </div>
  )
}
