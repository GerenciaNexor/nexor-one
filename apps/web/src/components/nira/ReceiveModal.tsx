'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ReceivableItem {
  id:               string
  quantityOrdered:  number
  quantityReceived: number
  unitCost:         number
  total:            number
  product: { id: string; sku: string; name: string; unit: string }
}

interface LineState {
  itemId:   string
  pending:  number   // cantidad aún pendiente
  qty:      string   // valor del input
  include:  boolean  // checkbox para incluir en esta recepción
}

interface Props {
  poId:        string
  orderNumber: string
  items:       ReceivableItem[]
  onClose:     () => void
  onSuccess:   (updated: unknown) => void
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function ReceiveModal({ poId, orderNumber, items, onClose, onSuccess }: Props) {
  // Solo líneas con cantidad pendiente
  const receivable = items.filter(
    (i) => i.quantityOrdered - i.quantityReceived > 0.0001,
  )

  const [lines, setLines] = useState<LineState[]>(
    receivable.map((i) => {
      const pending = parseFloat((i.quantityOrdered - i.quantityReceived).toFixed(4))
      return {
        itemId:  i.id,
        pending,
        qty:     String(pending),  // por defecto: recibir todo lo pendiente
        include: true,
      }
    }),
  )

  const [submitting, setSubmitting] = useState(false)
  const [apiError,   setApiError]   = useState<string | null>(null)

  function updateQty(idx: number, value: string) {
    setLines((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx]!, qty: value }
      return next
    })
  }

  function toggleInclude(idx: number) {
    setLines((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx]!, include: !next[idx]!.include }
      return next
    })
  }

  function validate(): string | null {
    for (const line of lines) {
      if (!line.include) continue
      const qty = parseFloat(line.qty)
      if (isNaN(qty) || qty <= 0)    return `Cantidad inválida en una línea`
      if (qty > line.pending + 0.001) return `Una cantidad supera la pendiente (${line.pending})`
    }
    if (!lines.some((l) => l.include)) return 'Selecciona al menos una línea'
    return null
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    const err = validate()
    if (err) { setApiError(err); return }
    setSubmitting(true)
    setApiError(null)

    const body = {
      items: lines
        .filter((l) => l.include)
        .map((l) => ({
          purchaseOrderItemId: l.itemId,
          quantityReceived:    parseFloat(l.qty),
        })),
    }

    try {
      const updated = await apiClient.put(`/v1/nira/purchase-orders/${poId}/receive`, body)
      onSuccess(updated)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setApiError(e.message ?? 'Error al registrar la recepción')
    } finally {
      setSubmitting(false)
    }
  }

  const inp = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Registrar recepción</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              OC {orderNumber} · Indica las cantidades reales recibidas
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Form */}
        <form id="receive-form" onSubmit={handleSubmit} className="max-h-[60vh] overflow-y-auto">
          <div className="px-6 py-5">

            {receivable.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                Todos los productos ya fueron recibidos completamente.
              </p>
            ) : (
              <>
                {/* Encabezado columnas */}
                <div className="mb-2 grid grid-cols-[1.5rem_1fr_5rem_5rem_5rem] gap-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <span />
                  <span>Producto</span>
                  <span className="text-right">Ordenado</span>
                  <span className="text-right">Recibido</span>
                  <span className="text-right">A recibir</span>
                </div>

                <div className="space-y-2">
                  {receivable.map((item, idx) => {
                    const line = lines[idx]!
                    return (
                      <div
                        key={item.id}
                        className={[
                          'grid grid-cols-[1.5rem_1fr_5rem_5rem_5rem] items-center gap-3 rounded-lg px-2 py-2 transition-colors',
                          line.include ? 'bg-blue-50/50' : 'opacity-40',
                        ].join(' ')}
                      >
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={line.include}
                          onChange={() => toggleInclude(idx)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600"
                        />

                        {/* Producto */}
                        <div>
                          <p className="text-sm font-medium text-slate-900">{item.product.name}</p>
                          <p className="font-mono text-xs text-slate-400">{item.product.sku}</p>
                        </div>

                        {/* Ordenado */}
                        <p className="text-right text-sm text-slate-500">
                          {item.quantityOrdered.toLocaleString('es-CO')} {item.product.unit}
                        </p>

                        {/* Ya recibido */}
                        <p className="text-right text-sm text-slate-500">
                          {item.quantityReceived.toLocaleString('es-CO')} {item.product.unit}
                        </p>

                        {/* Input cantidad */}
                        <input
                          type="number"
                          min="0.01"
                          max={line.pending}
                          step="0.01"
                          value={line.qty}
                          disabled={!line.include}
                          onChange={(e) => updateQty(idx, e.target.value)}
                          className={`${inp} text-right disabled:cursor-not-allowed disabled:bg-slate-50`}
                        />
                      </div>
                    )
                  })}
                </div>

                {/* Nota informativa */}
                <p className="mt-4 text-xs text-slate-400">
                  Al confirmar, se crearán entradas de stock en KIRA por cada línea seleccionada.
                  El inventario se actualizará automáticamente.
                </p>
              </>
            )}

            {apiError && (
              <div className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-600 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {apiError}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          {receivable.length > 0 && (
            <button type="submit" form="receive-form" disabled={submitting}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-60">
              {submitting ? 'Registrando…' : 'Confirmar recepción'}
            </button>
          )}
        </div>
      </div>
    </div>
    </Portal>
  )
}
