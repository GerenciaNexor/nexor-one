'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { Portal } from '@/components/ui/Portal'
import { ReceiveModal } from '@/components/nira/ReceiveModal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Status =
  | 'draft' | 'pending_approval' | 'approved'
  | 'sent'  | 'partial'          | 'received' | 'cancelled'

interface POItem {
  id:               string
  quantityOrdered:  number
  quantityReceived: number
  unitCost:         number
  total:            number
  product: { id: string; sku: string; name: string; unit: string }
}

interface PurchaseOrder {
  id:               string
  orderNumber:      string
  status:           Status
  subtotal:         number
  tax:              number
  total:            number
  expectedDelivery: string | null
  deliveredAt:      string | null
  notes:            string | null
  createdAt:        string
  updatedAt:        string
  supplier: { id: string; name: string; taxId: string | null; contactName: string | null; email: string | null; phone: string | null } | null
  branch:   { id: string; name: string } | null
  creator:  { id: string; name: string }
  approver: { id: string; name: string } | null
  items:    POItem[]
}

// ─── Auxiliares ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Status, string> = {
  draft:            'Borrador',
  pending_approval: 'En aprobación',
  approved:         'Aprobada',
  sent:             'Enviada',
  partial:          'Recibida parcial',
  received:         'Recibida',
  cancelled:        'Cancelada',
}

const STATUS_COLORS: Record<Status, string> = {
  draft:            'bg-slate-100 text-slate-600',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved:         'bg-blue-100 text-blue-700',
  sent:             'bg-violet-100 text-violet-700',
  partial:          'bg-orange-100 text-orange-700',
  received:         'bg-emerald-100 text-emerald-700',
  cancelled:        'bg-red-100 text-red-500',
}

function fmt(amount: number) {
  return `$${amount.toLocaleString('es-CO', { minimumFractionDigits: 0 })}`
}

// ─── Modal de confirmación genérico ──────────────────────────────────────────

function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmColor,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string
  message: string
  confirmLabel: string
  confirmColor: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60">
          <div className="px-6 pt-6 pb-4">
            <h3 className="text-center text-base font-semibold text-slate-900">{title}</h3>
            <p className="mt-2 text-center text-sm text-slate-500">{message}</p>
          </div>
          <div className="flex gap-2 border-t border-slate-100 px-6 py-4">
            <button onClick={onCancel}
              className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button onClick={onConfirm} disabled={loading}
              className={`flex-1 rounded-lg py-2 text-sm font-medium text-white transition-colors disabled:opacity-60 ${confirmColor}`}>
              {loading ? 'Procesando…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function PurchaseOrderDetailPage({ params }: { params: { id: string } }) {
  const { id }  = params
  const router  = useRouter()
  const user    = useAuthStore((s) => s.user)
  const isManager = user?.role === 'AREA_MANAGER' || user?.role === 'BRANCH_ADMIN' ||
                    user?.role === 'TENANT_ADMIN'  || user?.role === 'SUPER_ADMIN'

  const [po,         setPo]         = useState<PurchaseOrder | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [actionLoading,   setActionLoading]   = useState(false)
  const [actionError,     setActionError]     = useState<string | null>(null)
  const [confirm,         setConfirm]         = useState<'submit' | 'approve' | 'cancel' | null>(null)
  const [showReceive,     setShowReceive]     = useState(false)
  const [receivedSuccess, setReceivedSuccess] = useState(false)

  useEffect(() => {
    apiClient.get<PurchaseOrder>(`/v1/nira/purchase-orders/${id}`)
      .then(setPo)
      .catch((err: unknown) => {
        const e = err as { message?: string }
        setError(e.message ?? 'Error al cargar la orden de compra')
      })
      .finally(() => setLoading(false))
  }, [id])

  async function executeAction(action: 'submit' | 'approve' | 'cancel') {
    setActionLoading(true)
    setActionError(null)
    setConfirm(null)
    try {
      let updated: PurchaseOrder
      if (action === 'submit') {
        updated = await apiClient.post<PurchaseOrder>(`/v1/nira/purchase-orders/${id}/submit`, {})
      } else if (action === 'approve') {
        updated = await apiClient.put<PurchaseOrder>(`/v1/nira/purchase-orders/${id}/approve`, {})
      } else {
        updated = await apiClient.put<PurchaseOrder>(`/v1/nira/purchase-orders/${id}/cancel`, {})
      }
      setPo(updated)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setActionError(e.message ?? 'Error al procesar la acción')
    } finally {
      setActionLoading(false)
    }
  }

  // ─── Loading / Error ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 rounded bg-slate-200" />
          <div className="h-4 w-32 rounded bg-slate-100" />
          <div className="mt-6 h-40 rounded-xl bg-slate-100" />
        </div>
      </div>
    )
  }

  if (error || !po) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-500">{error ?? 'Orden no encontrada'}</p>
        <button onClick={() => router.back()} className="mt-3 text-sm text-blue-600 hover:underline">Volver</button>
      </div>
    )
  }

  const canSubmit  = po.status === 'draft'
  const canApprove = po.status === 'pending_approval' && isManager
  const canCancel  = ['draft', 'pending_approval', 'approved', 'sent', 'partial'].includes(po.status) && isManager
  const canReceive = ['approved', 'sent', 'partial'].includes(po.status)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6">

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-lg font-semibold text-slate-900">{po.orderNumber}</h1>
              <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[po.status]}`}>
                {STATUS_LABELS[po.status]}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {po.supplier?.name ?? 'Sin proveedor asignado'} · Creada por {po.creator.name}
            </p>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex flex-wrap gap-2">
          {canSubmit && (
            <button onClick={() => setConfirm('submit')} disabled={actionLoading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-60">
              Enviar a aprobación
            </button>
          )}
          {canApprove && (
            <button onClick={() => setConfirm('approve')} disabled={actionLoading}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-60">
              Aprobar OC
            </button>
          )}
          {canReceive && (
            <button onClick={() => setShowReceive(true)} disabled={actionLoading}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors disabled:opacity-60">
              Registrar recepción
            </button>
          )}
          {canCancel && (
            <button onClick={() => setConfirm('cancel')} disabled={actionLoading}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors disabled:opacity-60">
              Cancelar OC
            </button>
          )}
        </div>
      </div>

      {receivedSuccess && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            Recepción registrada. El stock en KIRA se actualizó automáticamente.
          </div>
          <button onClick={() => setReceivedSuccess(false)} className="ml-4 text-emerald-500 hover:text-emerald-700">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}
      {actionError && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{actionError}</div>
      )}

      {/* ── Contenido ───────────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">

        {/* Columna principal */}
        <div className="space-y-6 lg:col-span-2">

          {/* Líneas de productos */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-700">Productos</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3 text-right">Ordenado</th>
                    <th className="px-4 py-3 text-right">Recibido</th>
                    <th className="px-4 py-3 text-right">Costo unit.</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {po.items.map((item) => {
                    const pending = item.quantityOrdered - item.quantityReceived
                    return (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.product.sku}</td>
                      <td className="px-4 py-3 text-slate-900">{item.product.name}</td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {item.quantityOrdered.toLocaleString('es-CO')} {item.product.unit}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={item.quantityReceived > 0 ? 'text-emerald-600 font-medium' : 'text-slate-300'}>
                          {item.quantityReceived.toLocaleString('es-CO')} {item.product.unit}
                        </span>
                        {pending > 0.001 && (
                          <span className="ml-1 text-xs text-amber-500">({pending.toLocaleString('es-CO')} pend.)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{fmt(item.unitCost)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">{fmt(item.total)}</td>
                    </tr>
                    )
                  })}
                </tbody>
                {/* Totales */}
                <tfoot className="border-t border-slate-200 bg-slate-50 text-sm">
                  {po.tax > 0 && (
                    <>
                      <tr>
                        <td colSpan={5} className="px-4 py-2 text-right text-slate-500">Subtotal</td>
                        <td className="px-4 py-2 text-right text-slate-700">{fmt(po.subtotal)}</td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="px-4 py-2 text-right text-slate-500">Impuestos</td>
                        <td className="px-4 py-2 text-right text-slate-700">{fmt(po.tax)}</td>
                      </tr>
                    </>
                  )}
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-right font-semibold text-slate-900">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{fmt(po.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notas */}
          {po.notes && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">Notas</h2>
              <p className="whitespace-pre-line text-sm text-slate-600">{po.notes}</p>
            </div>
          )}
        </div>

        {/* Columna lateral */}
        <div className="space-y-4">

          {/* Datos del proveedor */}
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Proveedor</h2>
            {po.supplier ? (
              <div className="space-y-1.5 text-sm">
                <p className="font-medium text-slate-900">{po.supplier.name}</p>
                {po.supplier.taxId       && <p className="font-mono text-xs text-slate-500">{po.supplier.taxId}</p>}
                {po.supplier.contactName && <p className="text-slate-500">{po.supplier.contactName}</p>}
                {po.supplier.email       && <p className="text-slate-500">{po.supplier.email}</p>}
                {po.supplier.phone       && <p className="text-slate-500">{po.supplier.phone}</p>}
              </div>
            ) : (
              <p className="text-sm italic text-amber-600">
                Sin proveedor asignado — edita la OC para seleccionar uno antes de enviarla a aprobación.
              </p>
            )}
          </div>

          {/* Detalles de la OC */}
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Detalles</h2>
            <dl className="space-y-2 text-sm">
              {po.branch && (
                <>
                  <dt className="text-slate-500">Sucursal destino</dt>
                  <dd className="font-medium text-slate-900">{po.branch.name}</dd>
                </>
              )}
              {po.expectedDelivery && (
                <>
                  <dt className="text-slate-500">Entrega esperada</dt>
                  <dd className="font-medium text-slate-900">
                    {new Date(po.expectedDelivery).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </dd>
                </>
              )}
              {po.approver && (
                <>
                  <dt className="text-slate-500">Aprobada por</dt>
                  <dd className="font-medium text-slate-900">{po.approver.name}</dd>
                </>
              )}
              <dt className="text-slate-500">Creada</dt>
              <dd className="text-slate-700">
                {new Date(po.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
              </dd>
            </dl>
          </div>
        </div>
      </div>

      {/* ── Modales de confirmación ──────────────────────────────────────── */}
      {confirm === 'submit' && (
        <ConfirmModal
          title="Enviar a aprobación"
          message={`La orden ${po.orderNumber} se enviará al jefe de compras para aprobación. Ya no podrá editarla.`}
          confirmLabel="Enviar"
          confirmColor="bg-blue-600 hover:bg-blue-700"
          onConfirm={() => executeAction('submit')}
          onCancel={() => setConfirm(null)}
          loading={actionLoading}
        />
      )}
      {confirm === 'approve' && (
        <ConfirmModal
          title="Aprobar orden de compra"
          message={`Aprobar ${po.orderNumber} por ${fmt(po.total)}. Se generará automáticamente un egreso en finanzas.`}
          confirmLabel="Aprobar"
          confirmColor="bg-emerald-600 hover:bg-emerald-700"
          onConfirm={() => executeAction('approve')}
          onCancel={() => setConfirm(null)}
          loading={actionLoading}
        />
      )}
      {confirm === 'cancel' && (
        <ConfirmModal
          title="Cancelar orden de compra"
          message={`La orden ${po.orderNumber} quedará cancelada. Si ya estaba aprobada, el egreso en finanzas se revertirá. Esta acción no se puede deshacer.`}
          confirmLabel="Cancelar OC"
          confirmColor="bg-red-600 hover:bg-red-700"
          onConfirm={() => executeAction('cancel')}
          onCancel={() => setConfirm(null)}
          loading={actionLoading}
        />
      )}

      {/* ── Modal de recepción ───────────────────────────────────────────── */}
      {showReceive && (
        <ReceiveModal
          poId={po.id}
          orderNumber={po.orderNumber}
          items={po.items}
          onClose={() => setShowReceive(false)}
          onSuccess={(updated) => {
            setPo(updated as typeof po)
            setShowReceive(false)
            setReceivedSuccess(true)
          }}
        />
      )}
    </div>
  )
}
