'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'

interface SupplierOpt { id: string; name: string; isGeneric: boolean }

function todayPlus(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000)
  const off = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - off).toISOString().slice(0, 10)
}

type ThirdPartyMode = 'supplier' | 'new'

/**
 * HU-175 — Registrar un alquiler ENTRANTE (rentamos de un tercero). El tercero puede ser un
 * proveedor existente de NIRA o una entidad nueva suelta (nombre + contacto). El producto NO
 * entra a KIRA. Costo → egreso; depósito (opcional) → retención por cobrar.
 */
export function IncomingRentalFormModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([])

  const [mode, setMode]         = useState<ThirdPartyMode>('supplier')
  const [supplierId, setSupplierId] = useState('')
  const [tpName, setTpName]     = useState('')
  const [tpContact, setTpContact] = useState('')

  const [description, setDescription] = useState('')
  const [quantity, setQuantity]   = useState('1')
  const [project, setProject]     = useState('')
  const [returnDate, setReturnDate] = useState(todayPlus(7))
  const [rentalCost, setRentalCost] = useState('')
  const [deposit, setDeposit]     = useState('')
  const [notes, setNotes]         = useState('')

  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  useEffect(() => {
    apiClient.get<{ data: SupplierOpt[] }>('/v1/nira/suppliers').then((r) => setSuppliers(r.data)).catch(() => setSuppliers([]))
  }, [])

  async function submit() {
    setErr(null)
    if (mode === 'supplier' && !supplierId) { setErr('Selecciona un proveedor.'); return }
    if (mode === 'new' && !tpName.trim())   { setErr('Indica el nombre del tercero.'); return }
    if (!description.trim()) { setErr('Describe lo que rentas.'); return }
    const qty = parseFloat(quantity)
    if (!(qty > 0)) { setErr('La cantidad debe ser mayor a 0.'); return }
    if (!project.trim()) { setErr('Indica el proyecto.'); return }
    if (!returnDate) { setErr('Indica la fecha de devolución.'); return }
    const cost = parseFloat(rentalCost)
    if (!(cost >= 0) || rentalCost === '') { setErr('Indica el costo del alquiler.'); return }

    setSaving(true)
    const body = {
      ...(mode === 'supplier'
        ? { supplierId }
        : { thirdPartyName: tpName.trim(), thirdPartyContact: tpContact.trim() || null }),
      description: description.trim(),
      quantity:   qty,
      project:    project.trim(),
      returnDate,                       // YYYY-MM-DD (fecha de calendario)
      rentalCost: cost,
      deposit:    deposit !== '' ? parseFloat(deposit) : 0,
      notes:      notes.trim() || null,
    }
    try {
      await apiClient.post('/v1/nira/incoming-rentals', body)
      onSuccess()
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo registrar el alquiler entrante.')
    } finally { setSaving(false) }
  }

  const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
  const lbl = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400'
  const tab = (active: boolean) => `flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${active ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nuevo alquiler entrante</h3>
          <p className="mt-0.5 text-xs text-slate-500">Rentas un producto de un tercero. No entra a tu inventario; el costo va a tus finanzas.</p>

          <div className="mt-4 max-h-[64vh] space-y-3 overflow-y-auto pr-1">
            {/* Tercero: proveedor existente o entidad nueva suelta */}
            <div>
              <label className={lbl}>¿De quién lo rentas? *</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setMode('supplier')} className={tab(mode === 'supplier')}>Proveedor existente</button>
                <button type="button" onClick={() => setMode('new')} className={tab(mode === 'new')}>Otro (tercero nuevo)</button>
              </div>
            </div>

            {mode === 'supplier' ? (
              <div>
                <label className={lbl}>Proveedor *</label>
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inp}>
                  <option value="">Seleccionar…</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isGeneric ? ' (ocasional)' : ''}</option>)}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Nombre del tercero *</label>
                  <input value={tpName} onChange={(e) => setTpName(e.target.value)} className={inp} placeholder="Ej. Rentas Pepe" />
                </div>
                <div>
                  <label className={lbl}>Contacto <span className="font-normal text-slate-400">(opcional)</span></label>
                  <input value={tpContact} onChange={(e) => setTpContact(e.target.value)} className={inp} placeholder="Teléfono o email" />
                </div>
              </div>
            )}

            <div>
              <label className={lbl}>¿Qué rentas? *</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={inp} placeholder="Ej. Andamio de 6m" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Cantidad *</label>
                <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl}>Fecha de devolución *</label>
                <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={inp} />
              </div>
            </div>

            <div>
              <label className={lbl}>Proyecto *</label>
              <input value={project} onChange={(e) => setProject(e.target.value)} className={inp} placeholder="Ej. Obra Norte" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Costo del alquiler *</label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">$</span>
                  <input type="number" min="0" step="1" value={rentalCost} onChange={(e) => setRentalCost(e.target.value)} className={`${inp} pl-7`} placeholder="0" />
                </div>
              </div>
              <div>
                <label className={lbl}>Depósito <span className="font-normal text-slate-400">(opcional)</span></label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">$</span>
                  <input type="number" min="0" step="1" value={deposit} onChange={(e) => setDeposit(e.target.value)} className={`${inp} pl-7`} placeholder="0" />
                </div>
              </div>
            </div>

            <div>
              <label className={lbl}>Nota <span className="font-normal text-slate-400">(opcional)</span></label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inp} resize-none`} placeholder="Estado del producto, accesorios recibidos…" />
            </div>

            {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
            <button onClick={submit} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Registrando…' : 'Registrar alquiler'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
