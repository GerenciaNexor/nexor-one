'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'

interface RentalDetail {
  id:          string
  quantity:    number
  chargeType:  'fixed' | 'daily'
  fixedAmount: number | null
  dailyRate:   number | null
  deposit:     number
  rentedAt:    string
  dueAt:       string | null
  product: { sku: string; name: string; unit: string }
  client:  { name: string } | null
  preview: { daysElapsed: number; chargeTotal: number; depositLeft: number } | null
}

const money = (n: number) => `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`

export function ReturnRentalModal({ rentalId, onClose, onSuccess }: {
  rentalId: string
  onClose:  () => void
  onSuccess: () => void
}) {
  const [rental, setRental] = useState<RentalDetail | null>(null)
  const [resolution, setResolution] = useState<'returned' | 'retained'>('returned')
  const [retained, setRetained] = useState('')
  const [reason, setReason]     = useState('')
  const [condition, setCondition] = useState<'good' | 'damaged'>('good')
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  useEffect(() => {
    apiClient.get<{ data: RentalDetail }>(`/v1/kira/rentals/${rentalId}`)
      .then((r) => setRental(r.data)).catch(() => setErr('No se pudo cargar el alquiler.'))
  }, [rentalId])

  const deposit    = rental?.deposit ?? 0
  const retainNum  = resolution === 'retained' ? (parseFloat(retained) || 0) : 0
  const toReturn   = Math.max(0, deposit - retainNum)
  const charge     = rental?.preview?.chargeTotal ?? 0

  async function submit() {
    setErr(null)
    if (resolution === 'retained') {
      if (!(retainNum > 0))         { setErr('Indica cuánto retienes del depósito.'); return }
      if (retainNum > deposit)      { setErr(`No puedes retener más que el depósito (${money(deposit)}).`); return }
      if (!reason.trim())           { setErr('Indica el motivo de la retención.'); return }
    }
    setSaving(true)
    const body = {
      depositResolution: resolution,
      retainedAmount:    resolution === 'retained' ? retainNum : undefined,
      reason:            resolution === 'retained' ? reason.trim() : undefined,
      productCondition:  condition,
      notes:             notes.trim() || null,
    }
    try {
      await apiClient.post(`/v1/kira/rentals/${rentalId}/return`, body)
      onSuccess()
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo registrar la devolución.')
    } finally { setSaving(false) }
  }

  const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Registrar devolución</h3>
          {!rental ? (
            <p className="mt-4 text-sm text-slate-500">{err ?? 'Cargando…'}</p>
          ) : (
            <>
              <p className="mt-0.5 text-xs text-slate-500">{rental.product.name} · {rental.quantity} {rental.product.unit} · {rental.client?.name ?? '—'}</p>

              {/* Resumen del alquiler */}
              <div className="mt-4 space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
                <div className="flex justify-between"><span className="text-slate-500">Depósito dejado</span><span className="font-medium text-slate-800 dark:text-slate-100">{money(deposit)}</span></div>
                <div className="flex justify-between">
                  <span className="text-slate-500">A cobrar por el alquiler{rental.chargeType === 'daily' ? ` (${rental.preview?.daysElapsed ?? 0} día(s) × ${money(rental.dailyRate ?? 0)})` : ' (fijo)'}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">{money(charge)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5 dark:border-slate-700">
                  <span className="text-slate-500">Depósito a devolver al cliente</span>
                  <span className="font-semibold text-emerald-600">{money(toReturn)}</span>
                </div>
              </div>

              {/* Resolución del depósito */}
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Resolución del depósito</p>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-700">
                  <input type="radio" name="res" checked={resolution === 'returned'} onChange={() => setResolution('returned')} className="mt-0.5 accent-blue-600" />
                  <span><span className="font-medium text-slate-800 dark:text-slate-100">Devolver todo</span><span className="block text-xs text-slate-400">Producto en buenas condiciones — no genera ingreso.</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-700">
                  <input type="radio" name="res" checked={resolution === 'retained'} onChange={() => { setResolution('retained'); setCondition('damaged') }} className="mt-0.5 accent-amber-600" />
                  <span><span className="font-medium text-slate-800 dark:text-slate-100">Retener (total o parcial)</span><span className="block text-xs text-slate-400">Producto dañado/faltante — lo retenido pasa a ingreso en VERA.</span></span>
                </label>
              </div>

              {resolution === 'retained' && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Monto a retener (máx. {money(deposit)})</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">$</span>
                      <input type="number" min="0" max={deposit} step="1" value={retained} onChange={(e) => setRetained(e.target.value)} className={`${inp} pl-7`} placeholder="0" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Motivo *</label>
                    <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={inp} placeholder="Ej: raspón en la carcasa, falta un accesorio…" />
                  </div>
                </div>
              )}

              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Nota <span className="font-normal text-slate-400">(opcional)</span></label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inp} resize-none`} placeholder="Observaciones de la devolución…" />
              </div>

              {err && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{err}</p>}
            </>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
            <button onClick={submit} disabled={saving || !rental} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Guardando…' : 'Confirmar devolución'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
