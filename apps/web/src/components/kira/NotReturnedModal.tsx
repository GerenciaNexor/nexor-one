'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'

interface RentalDetail {
  id:       string
  quantity: number
  deposit:  number
  product: { sku: string; name: string; unit: string; salePrice: number | null }
  client:  { name: string } | null
  preview: { saleSuggestion: number | null } | null
}

const money = (n: number) => `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`

/** HU-161 — Cierra un alquiler cuyo producto NO fue devuelto: se convierte en venta. */
export function NotReturnedModal({ rentalId, onClose, onSuccess }: {
  rentalId: string
  onClose:  () => void
  onSuccess: () => void
}) {
  const [rental, setRental] = useState<RentalDetail | null>(null)
  const [amount, setAmount] = useState('')
  const [notes, setNotes]   = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  useEffect(() => {
    apiClient.get<{ data: RentalDetail }>(`/v1/kira/rentals/${rentalId}`)
      .then((r) => {
        setRental(r.data)
        const sug = r.data.preview?.saleSuggestion
        if (sug != null) setAmount(String(sug))
      })
      .catch(() => setErr('No se pudo cargar el alquiler.'))
  }, [rentalId])

  const deposit  = rental?.deposit ?? 0
  const sale     = parseFloat(amount) || 0
  const net      = Math.max(0, sale - deposit)

  async function submit() {
    setErr(null)
    if (!(sale > 0)) { setErr('Indica el monto de la venta.'); return }
    setSaving(true)
    try {
      await apiClient.post(`/v1/kira/rentals/${rentalId}/not-returned`, { saleAmount: sale, notes: notes.trim() || null })
      onSuccess()
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo cerrar el alquiler.')
    } finally { setSaving(false) }
  }

  const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Producto no devuelto</h3>
          {!rental ? (
            <p className="mt-4 text-sm text-slate-500">{err ?? 'Cargando…'}</p>
          ) : (
            <>
              <p className="mt-0.5 text-xs text-slate-500">{rental.product.name} · {rental.quantity} {rental.product.unit} · {rental.client?.name ?? '—'}</p>

              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                Esto convierte el alquiler en <b>venta</b>: baja el <b>stock total</b> (la unidad no volverá),
                registra la salida en el inventario y genera un <b>ingreso</b> en VERA. El <b>depósito</b> dejado
                se aplica como parte del pago.
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Monto de la venta *</label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">$</span>
                  <input type="number" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inp} pl-7`} placeholder="0" />
                </div>
                {rental.product.salePrice == null && <p className="mt-1 text-[11px] text-slate-400">El producto no tiene precio de venta: indícalo manualmente.</p>}
              </div>

              <div className="mt-3 space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
                <div className="flex justify-between"><span className="text-slate-500">Depósito aplicado</span><span className="font-medium text-slate-800 dark:text-slate-100">{money(deposit)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5 dark:border-slate-700"><span className="text-slate-500">Falta cobrar al cliente</span><span className="font-semibold text-slate-900 dark:text-slate-100">{money(net)}</span></div>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Nota <span className="font-normal text-slate-400">(opcional)</span></label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inp} resize-none`} placeholder="Detalle de la pérdida…" />
              </div>

              {err && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{err}</p>}
            </>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
            <button onClick={submit} disabled={saving || !rental} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {saving ? 'Cerrando…' : 'Cerrar como venta'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
