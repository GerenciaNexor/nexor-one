'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { SupplierFormModal } from '@/components/nira/SupplierFormModal'
import type { Supplier } from '@/components/nira/SupplierFormModal'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface SupplierScore {
  priceScore:       number
  deliveryScore:    number
  qualityScore:     number
  overallScore:     number
  totalOrders:      number
  onTimeDeliveries: number
  calculatedAt:     string
}

interface SupplierDetail extends Supplier {
  score: SupplierScore | null
}

interface POSummary {
  id:               string
  orderNumber:      string
  status:           string
  total:            number
  expectedDelivery: string | null
  createdAt:        string
}

// ─── Auxiliares ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft:            'Borrador',
  pending_approval: 'En aprobación',
  approved:         'Aprobada',
  sent:             'Enviada',
  partial:          'Recibida parcial',
  received:         'Recibida',
  cancelled:        'Cancelada',
}

const STATUS_COLORS: Record<string, string> = {
  draft:            'bg-slate-100 text-slate-600',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved:         'bg-blue-100 text-blue-700',
  sent:             'bg-violet-100 text-violet-700',
  partial:          'bg-orange-100 text-orange-700',
  received:         'bg-emerald-100 text-emerald-700',
  cancelled:        'bg-red-100 text-red-500',
}

function scoreColor(score: number): string {
  return score >= 7 ? 'text-emerald-600'
       : score >= 4 ? 'text-amber-600'
       : 'text-red-500'
}

function scoreBg(score: number): string {
  return score >= 7 ? 'bg-emerald-500'
       : score >= 4 ? 'bg-amber-500'
       : 'bg-red-500'
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className={`font-semibold ${scoreColor(value)}`}>{value.toFixed(1)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${scoreBg(value)}`}
          style={{ width: `${(value / 10) * 100}%` }}
        />
      </div>
    </div>
  )
}

// ─── Modal de confirmación ────────────────────────────────────────────────────

function DeactivateModal({
  supplier, onConfirm, onCancel, loading,
}: { supplier: SupplierDetail; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
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
              <span className="font-medium text-slate-700">{supplier.name}</span> quedará inactivo y no aparecerá en nuevas órdenes de compra.
            </p>
          </div>
          <div className="flex gap-2 border-t border-slate-100 px-6 py-4">
            <button onClick={onCancel} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button onClick={onConfirm} disabled={loading} className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-60">
              {loading ? 'Desactivando…' : 'Desactivar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ─── Página de detalle ────────────────────────────────────────────────────────

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = use(params)
  const router  = useRouter()
  const user    = useAuthStore((s) => s.user)
  const canEdit = user?.role === 'AREA_MANAGER' || user?.role === 'BRANCH_ADMIN' ||
                  user?.role === 'TENANT_ADMIN'  || user?.role === 'SUPER_ADMIN'

  const [supplier,     setSupplier]     = useState<SupplierDetail | null>(null)
  const [recentPos,    setRecentPos]    = useState<POSummary[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [showEdit,     setShowEdit]     = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [deactivateLoad, setDeactivateLoad] = useState(false)

  useEffect(() => {
    Promise.all([
      apiClient.get<SupplierDetail>(`/v1/nira/suppliers/${id}`),
      apiClient.get<{ data: POSummary[] }>(`/v1/nira/purchase-orders?supplierId=${id}`),
    ])
      .then(([sup, pos]) => {
        setSupplier(sup)
        setRecentPos(pos.data.slice(0, 5))
      })
      .catch((e: unknown) => {
        const err = e as { message?: string }
        setError(err.message ?? 'Error al cargar el proveedor')
      })
      .finally(() => setLoading(false))
  }, [id])

  async function confirmDeactivate() {
    if (!supplier) return
    setDeactivateLoad(true)
    try {
      await apiClient.delete(`/v1/nira/suppliers/${id}`)
      setSupplier((prev) => prev ? { ...prev, isActive: false } : prev)
      setDeactivating(false)
    } catch (e: unknown) {
      const err = e as { message?: string }
      alert(err.message ?? 'Error al desactivar')
    } finally {
      setDeactivateLoad(false)
    }
  }

  // ─── Loading / Error ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 rounded bg-slate-200" />
          <div className="h-4 w-32 rounded bg-slate-100" />
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 h-48 rounded-xl bg-slate-100" />
            <div className="h-48 rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !supplier) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-500">{error ?? 'Proveedor no encontrado'}</p>
        <button onClick={() => router.back()} className="mt-3 text-sm text-blue-600 hover:underline">Volver</button>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6">

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">{supplier.name}</h1>
              {!supplier.isActive && (
                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  Inactivo
                </span>
              )}
            </div>
            {supplier.taxId && (
              <p className="mt-0.5 font-mono text-xs text-slate-400">{supplier.taxId}</p>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowEdit(true)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Editar
            </button>
            {supplier.isActive && (
              <button
                onClick={() => setDeactivating(true)}
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
              >
                Desactivar
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Contenido ───────────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">

        {/* ── Columna principal ─────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">

          {/* Información de contacto */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-700">Información</h2>
            </div>
            <div className="grid gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-2">
              {[
                { label: 'Contacto',        value: supplier.contactName },
                { label: 'Correo',          value: supplier.email },
                { label: 'Teléfono',        value: supplier.phone },
                { label: 'Ciudad',          value: supplier.city },
                { label: 'Dirección',       value: supplier.address },
                { label: 'Días de crédito', value: supplier.paymentTerms != null ? `${supplier.paymentTerms} días` : null },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">
                    {value ?? <span className="font-normal text-slate-300">—</span>}
                  </p>
                </div>
              ))}
              {supplier.notes && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-400">Notas</p>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{supplier.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Últimas 5 órdenes de compra */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-700">Últimas órdenes de compra</h2>
            </div>
            {recentPos.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">Sin órdenes de compra registradas</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-2.5">N° OC</th>
                    <th className="px-5 py-2.5">Estado</th>
                    <th className="px-5 py-2.5 text-right">Total</th>
                    <th className="px-5 py-2.5">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentPos.map((po) => (
                    <tr
                      key={po.id}
                      onClick={() => router.push(`/nira/purchase-orders/${po.id}`)}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                    >
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-700">{po.orderNumber}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[po.status] ?? 'bg-slate-100 text-slate-500'}`}>
                          {STATUS_LABELS[po.status] ?? po.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-slate-900">
                        ${po.total.toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {new Date(po.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Columna lateral — Score ────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Score del proveedor</h2>

            {supplier.score ? (
              <>
                {/* Score general grande */}
                <div className="mb-5 flex items-center gap-3">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white ${
                    supplier.score.overallScore >= 7 ? 'bg-emerald-500'
                    : supplier.score.overallScore >= 4 ? 'bg-amber-500'
                    : 'bg-red-500'
                  }`}>
                    {supplier.score.overallScore.toFixed(1)}
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Score general</p>
                    <p className={`text-sm font-semibold ${scoreColor(supplier.score.overallScore)}`}>
                      {supplier.score.overallScore >= 7 ? 'Excelente'
                       : supplier.score.overallScore >= 4 ? 'Regular'
                       : 'Bajo rendimiento'}
                    </p>
                  </div>
                </div>

                {/* Tres dimensiones */}
                <div className="space-y-3">
                  <ScoreBar label="Precio" value={supplier.score.priceScore} />
                  <ScoreBar label="Entrega a tiempo" value={supplier.score.deliveryScore} />
                  <ScoreBar label="Calidad" value={supplier.score.qualityScore} />
                </div>

                {/* Estadísticas */}
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                  <div>
                    <p className="text-xs text-slate-400">OC recibidas</p>
                    <p className="text-sm font-semibold text-slate-900">{supplier.score.totalOrders}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Entregas a tiempo</p>
                    <p className="text-sm font-semibold text-slate-900">{supplier.score.onTimeDeliveries}</p>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-400">
                  Actualizado {new Date(supplier.score.calculatedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </>
            ) : (
              <div className="rounded-lg bg-slate-50 px-4 py-6 text-center">
                <p className="text-sm text-slate-500">Sin score calculado</p>
                <p className="mt-1 text-xs text-slate-400">
                  El score se calcula automáticamente cuando hay órdenes recibidas.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal editar ─────────────────────────────────────────────────── */}
      {showEdit && (
        <SupplierFormModal
          mode="edit"
          supplier={supplier}
          onClose={() => setShowEdit(false)}
          onSuccess={(saved) => {
            setSupplier((prev) => prev ? { ...prev, ...saved, score: prev.score } : prev)
            setShowEdit(false)
          }}
        />
      )}

      {/* ── Modal desactivar ─────────────────────────────────────────────── */}
      {deactivating && (
        <DeactivateModal
          supplier={supplier}
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivating(false)}
          loading={deactivateLoad}
        />
      )}
    </div>
  )
}
