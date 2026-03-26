'use client'

import { useState, useEffect, useMemo } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ProductOption {
  id:       string
  sku:      string
  name:     string
  unit:     string
  isActive: boolean
}

interface BranchOption {
  id:       string
  name:     string
  city:     string | null
  isActive: boolean
}

export interface StockRow {
  id:       string
  quantity: number
  belowMin: boolean
  product:  { id: string; sku: string; name: string; unit: string; minStock: number }
  branch:   { id: string; name: string; city: string | null }
}

interface FormFields {
  type:       'entrada' | 'salida' | 'ajuste'
  productId:  string
  branchId:   string
  quantity:   string
  notes:      string
  lotNumber:  string
  expiryDate: string
}

interface Props {
  stocks:            StockRow[]
  initialProductId?: string
  initialBranchId?:  string
  onClose:           () => void
  onSuccess:         () => void
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function MovementModal({ stocks, initialProductId, initialBranchId, onClose, onSuccess }: Props) {
  const user      = useAuthStore((s) => s.user)
  const isOperative = user?.role === 'OPERATIVE'

  const [products, setProducts]     = useState<ProductOption[]>([])
  const [branches, setBranches]     = useState<BranchOption[]>([])
  const [loadingOpts, setLoadingOpts] = useState(true)

  const [form, setForm] = useState<FormFields>({
    type:       'entrada',
    productId:  initialProductId ?? '',
    branchId:   initialBranchId ?? (isOperative ? (user?.branchId ?? '') : ''),
    quantity:   '',
    notes:      '',
    lotNumber:  '',
    expiryDate: '',
  })
  const [errors, setErrors]         = useState<Partial<Record<keyof FormFields, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError]     = useState<string | null>(null)

  // Carga productos (para el dropdown) y sucursales (solo si no es OPERATIVE)
  useEffect(() => {
    const calls: Promise<unknown>[] = [
      apiClient.get<{ data: ProductOption[] }>('/v1/kira/products?active=true').then((r) => setProducts(r.data)),
    ]
    if (!isOperative) {
      calls.push(
        apiClient.get<{ data: BranchOption[] }>('/v1/branches').then((r) => setBranches(r.data)),
      )
    }
    Promise.all(calls).finally(() => setLoadingOpts(false))
  }, [isOperative])

  // Stock actual del producto+sucursal seleccionados
  const currentStock = useMemo(() => {
    if (!form.productId || !form.branchId) return null
    const row = stocks.find(
      (s) => s.product.id === form.productId && s.branch.id === form.branchId,
    )
    return row ? row.quantity : 0
  }, [form.productId, form.branchId, stocks])

  const selectedProduct = products.find((p) => p.id === form.productId)

  function set(key: keyof FormFields) {
    return (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: ev.target.value }))
      setErrors((prev) => ({ ...prev, [key]: undefined }))
    }
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormFields, string>> = {}
    if (!form.productId) e.productId = 'Selecciona un producto'
    if (!form.branchId)  e.branchId  = 'Selecciona una sucursal'

    const qty = parseFloat(form.quantity)
    if (!form.quantity || isNaN(qty) || qty === 0) {
      e.quantity = form.type === 'ajuste'
        ? 'La cantidad no puede ser cero'
        : 'Ingresa una cantidad mayor a cero'
    } else if (form.type !== 'ajuste' && qty < 0) {
      e.quantity = 'La cantidad debe ser positiva para entradas y salidas'
    } else if (form.type === 'salida' && currentStock !== null && qty > currentStock) {
      e.quantity = `Stock insuficiente. Disponible: ${currentStock} ${selectedProduct?.unit ?? ''}`
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError(null)

    const body: Record<string, unknown> = {
      type:      form.type,
      productId: form.productId,
      branchId:  form.branchId,
      quantity:  parseFloat(form.quantity),
      notes:     form.notes.trim() || undefined,
      lotNumber: form.lotNumber.trim() || undefined,
      expiryDate: form.expiryDate || undefined,
    }

    try {
      await apiClient.post('/v1/kira/stock/movements', body)
      onSuccess()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setApiError(e.message ?? 'Error al registrar el movimiento')
    } finally {
      setSubmitting(false)
    }
  }

  const inp = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
  const inpErr = 'w-full rounded-lg border border-red-400 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-red-100'

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Registrar movimiento</h2>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar"
          >✕</button>
        </div>

        {loadingOpts ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          </div>
        ) : (
          <form id="movement-form" onSubmit={handleSubmit}
            className="max-h-[65vh] overflow-y-auto px-6 py-4"
          >
            <div className="space-y-4">

              {/* Tipo de movimiento */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Tipo *</label>
                <select value={form.type} onChange={set('type')} className={inp}>
                  <option value="entrada">Entrada (ingreso)</option>
                  <option value="salida">Salida (egreso)</option>
                  <option value="ajuste">Ajuste de inventario</option>
                </select>
              </div>

              {/* Producto */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Producto *</label>
                <select
                  value={form.productId}
                  onChange={set('productId')}
                  className={errors.productId ? inpErr : inp}
                  disabled={!!initialProductId}
                >
                  <option value="">Seleccionar producto…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
                {errors.productId && <p className="mt-1 text-xs text-red-500">{errors.productId}</p>}
              </div>

              {/* Sucursal (solo si no es OPERATIVE) */}
              {!isOperative && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Sucursal *</label>
                  <select
                    value={form.branchId}
                    onChange={set('branchId')}
                    className={errors.branchId ? inpErr : inp}
                    disabled={!!initialBranchId}
                  >
                    <option value="">Seleccionar sucursal…</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}{b.city ? ` — ${b.city}` : ''}
                      </option>
                    ))}
                  </select>
                  {errors.branchId && <p className="mt-1 text-xs text-red-500">{errors.branchId}</p>}
                </div>
              )}

              {/* Stock actual (informativo) */}
              {form.productId && form.branchId && currentStock !== null && (
                <div className={[
                  'flex items-center justify-between rounded-lg px-3 py-2 text-sm',
                  currentStock <= (stocks.find((s) => s.product.id === form.productId)?.product.minStock ?? 0)
                    ? 'bg-red-50 text-red-700'
                    : 'bg-slate-50 text-slate-600',
                ].join(' ')}>
                  <span>Stock actual disponible</span>
                  <span className="font-semibold">
                    {currentStock} {selectedProduct?.unit ?? ''}
                  </span>
                </div>
              )}

              {/* Cantidad */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Cantidad * {form.type === 'ajuste' ? '(negativo para reducir)' : ''}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.quantity}
                  onChange={set('quantity')}
                  className={errors.quantity ? inpErr : inp}
                  placeholder={form.type === 'ajuste' ? 'Ej: -5 o +10' : 'Ej: 20'}
                />
                {errors.quantity && <p className="mt-1 text-xs text-red-500">{errors.quantity}</p>}
              </div>

              {/* Notas */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={set('notes')}
                  rows={2}
                  className={`${inp} resize-none`}
                  placeholder="Opcional — referencia, proveedor, motivo del ajuste…"
                />
              </div>

              {/* Lote y caducidad (opcionales, colapsados en grid) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Nro. de lote</label>
                  <input type="text" value={form.lotNumber} onChange={set('lotNumber')}
                    className={inp} placeholder="Opcional" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Fecha de caducidad</label>
                  <input type="date" value={form.expiryDate} onChange={set('expiryDate')}
                    className={inp} />
                </div>
              </div>
            </div>

            {apiError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{apiError}</p>
            )}
          </form>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button type="submit" form="movement-form" disabled={submitting || loadingOpts}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {submitting ? 'Guardando…' : 'Registrar movimiento'}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}
