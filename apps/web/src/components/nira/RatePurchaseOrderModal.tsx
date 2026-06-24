'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'

interface Props {
  poId:         string
  orderNumber:  string
  supplierName: string
  initial?:     { deliveryRating: number; qualityRating: number; notes: string | null } | null
  onClose:      () => void
  onRated:      () => void
}

function Stars({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} de 5`}
          className="transition-transform hover:scale-110">
          <svg width="26" height="26" viewBox="0 0 24 24" fill={n <= value ? color : 'none'} stroke={color} strokeWidth="1.5" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      ))}
    </div>
  )
}

export function RatePurchaseOrderModal({ poId, orderNumber, supplierName, initial, onClose, onRated }: Props) {
  const [delivery, setDelivery]     = useState(initial?.deliveryRating ?? 0)
  const [quality, setQuality]       = useState(initial?.qualityRating ?? 0)
  const [notes, setNotes]           = useState(initial?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  async function submit() {
    if (delivery < 1 || quality < 1) { setError('Califica Entrega y Calidad (1 a 5)'); return }
    setSubmitting(true); setError(null)
    try {
      await apiClient.post(`/v1/nira/purchase-orders/${poId}/rate`, {
        deliveryRating: delivery, qualityRating: quality, notes: notes.trim() || undefined,
      })
      onRated()
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Error al calificar el proveedor')
    } finally { setSubmitting(false) }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60">
          <div className="px-6 py-5">
            <h2 className="text-base font-semibold text-slate-900">Calificar proveedor</h2>
            <p className="mt-0.5 text-xs text-slate-400">{supplierName} · OC {orderNumber} · opcional pero recomendado</p>
          </div>

          <div className="space-y-5 px-6 pb-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Entrega <span className="font-normal text-slate-400">(puntualidad, estado del pedido)</span>
              </label>
              <Stars value={delivery} onChange={setDelivery} color="#8b5cf6" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Calidad <span className="font-normal text-slate-400">(producto conforme, sin defectos)</span>
              </label>
              <Stars value={quality} onChange={setQuality} color="#10b981" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Notas <span className="font-normal text-slate-400">(opcional)</span></label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Observaciones sobre la entrega…" />
            </div>
            <p className="text-[10px] text-slate-400">Alimenta el ranking del proveedor (ejes Entrega y Calidad). Es opcional: puedes omitirla sin afectar la recepción.</p>
          </div>

          {error && <div className="mx-6 mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Omitir</button>
            <button type="button" onClick={submit} disabled={submitting}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              {submitting ? 'Guardando…' : 'Calificar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
