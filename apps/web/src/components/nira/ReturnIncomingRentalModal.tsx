'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'
import { fmtCalendarDate } from '@/lib/format-date'

export interface IncomingRental {
  id: string
  status: 'active' | 'returned'
  description: string
  quantity: number
  project: string
  returnDate: string
  rentalCost: number
  deposit: number
  thirdParty: string | null
  thirdPartyContact: string | null
  isExistingSupplier: boolean
  branchName: string | null
  notes: string | null
  returnedAt: string | null
  returnedByName: string | null
  depositLost: number
  depositRecovered: number
  depositReason: string | null
}

const money = (n: number) => `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`

/**
 * HU-176 — Registrar la devolución de un alquiler ENTRANTE. Muestra todo lo registrado
 * (costo, depósito, fecha, proyecto, tercero) y resuelve el depósito PROPIO:
 * recuperado (vuelve a la empresa) o perdido (el tercero lo retiene, con motivo → egreso VERA).
 */
export function ReturnIncomingRentalModal({ rental, onClose, onSuccess }: {
  rental: IncomingRental
  onClose: () => void
  onSuccess: () => void
}) {
  const [resolution, setResolution] = useState<'recovered' | 'lost'>('recovered')
  const [lost, setLost]     = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes]   = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  const deposit   = rental.deposit
  const lostNum   = resolution === 'lost' ? (parseFloat(lost) || 0) : 0
  const recovered = Math.max(0, deposit - lostNum)

  async function submit() {
    setErr(null)
    if (resolution === 'lost') {
      if (!(lostNum > 0))      { setErr('Indica cuánto retuvo el tercero del depósito.'); return }
      if (lostNum > deposit)   { setErr(`No puedes perder más que el depósito (${money(deposit)}).`); return }
      if (!reason.trim())      { setErr('Indica el motivo por el que se pierde el depósito.'); return }
    }
    setSaving(true)
    const body = {
      depositResolution: resolution,
      lostAmount: resolution === 'lost' ? lostNum : undefined,
      reason:     resolution === 'lost' ? reason.trim() : undefined,
      notes:      notes.trim() || null,
    }
    try {
      await apiClient.post(`/v1/nira/incoming-rentals/${rental.id}/return`, body)
      onSuccess()
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo registrar la devolución.')
    } finally { setSaving(false) }
  }

  const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-3"><span className="text-slate-500">{label}</span><span className="text-right font-medium text-slate-800 dark:text-slate-100">{value}</span></div>
  )

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Registrar devolución</h3>
          <p className="mt-0.5 text-xs text-slate-500">Entregas el producto al tercero. Cierra el alquiler y resuelve tu depósito.</p>

          {/* Todo lo registrado del alquiler */}
          <div className="mt-4 space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
            {row('Rentado', `${rental.description} ×${rental.quantity}`)}
            {row('Tercero', rental.thirdParty ?? '—')}
            {row('Proyecto', rental.project)}
            {row('Fecha de devolución', fmtCalendarDate(rental.returnDate))}
            {row('Costo del alquiler', money(rental.rentalCost))}
            {row('Depósito dejado', money(deposit))}
          </div>

          {deposit > 0 ? (
            <>
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">¿Qué pasó con tu depósito?</p>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-700">
                  <input type="radio" name="res" checked={resolution === 'recovered'} onChange={() => setResolution('recovered')} className="mt-0.5 accent-emerald-600" />
                  <span><span className="font-medium text-slate-800 dark:text-slate-100">Recuperado</span><span className="block text-xs text-slate-400">El tercero nos devuelve el depósito — vuelve a la empresa.</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-700">
                  <input type="radio" name="res" checked={resolution === 'lost'} onChange={() => setResolution('lost')} className="mt-0.5 accent-red-600" />
                  <span><span className="font-medium text-slate-800 dark:text-slate-100">Retenido por el tercero (se pierde)</span><span className="block text-xs text-slate-400">Ej. por daño — lo perdido pasa a egreso en VERA.</span></span>
                </label>
              </div>

              {resolution === 'lost' && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Monto perdido (máx. {money(deposit)})</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">$</span>
                      <input type="number" min="0" max={deposit} step="1" value={lost} onChange={(e) => setLost(e.target.value)} className={`${inp} pl-7`} placeholder="0" />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">Recuperas: <span className="font-semibold text-emerald-600">{money(recovered)}</span></p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Motivo *</label>
                    <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={inp} placeholder="Ej: daño en el equipo, falta un accesorio…" />
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800">Sin depósito: la devolución solo cierra el alquiler.</p>
          )}

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Nota <span className="font-normal text-slate-400">(opcional)</span></label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inp} resize-none`} placeholder="Observaciones de la devolución…" />
          </div>

          {err && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{err}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
            <button onClick={submit} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Guardando…' : 'Confirmar devolución'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
