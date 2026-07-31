'use client'

import { useState, useEffect, useMemo } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'
import { useAuthStore } from '@/store/auth'

interface ClientOpt  { id: string; name: string; isGeneric: boolean }
interface ProductOpt { id: string; name: string; sku: string; unit: string; isRentable: boolean; rentalPrice: number | null }
interface BranchOpt  { id: string; name: string }
interface StockRow   { product: { id: string }; branch: { id: string }; available?: number; quantity: number }

type ChargeType = 'fixed' | 'daily'

function todayPlus(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000)
  const off = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - off).toISOString().slice(0, 10)
}

export function RentalFormModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const user        = useAuthStore((s) => s.user)
  const isOperative = user?.role === 'OPERATIVE'

  const [clients,  setClients]  = useState<ClientOpt[]>([])
  const [products, setProducts] = useState<ProductOpt[]>([])
  const [branches, setBranches] = useState<BranchOpt[]>([])
  const [stocks,   setStocks]   = useState<StockRow[]>([])

  const [clientId,   setClientId]   = useState('')
  const [productId,  setProductId]  = useState('')
  const [branchId,   setBranchId]   = useState(isOperative ? (user?.branchId ?? '') : '')
  const [quantity,   setQuantity]   = useState('1')
  const [chargeType, setChargeType] = useState<ChargeType>('fixed')
  const [price,      setPrice]      = useState('')   // monto fijo o tarifa diaria según chargeType
  const [deposit,    setDeposit]    = useState('')
  const [dueAt,      setDueAt]      = useState(todayPlus(1))
  const [notes,      setNotes]      = useState('')

  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  useEffect(() => {
    apiClient.get<{ data: ClientOpt[] }>('/v1/kira/rentals/clients').then((r) => setClients(r.data)).catch(() => setClients([]))
    apiClient.get<{ data: ProductOpt[] }>('/v1/kira/products?active=true').then((r) => setProducts(r.data.filter((p) => p.isRentable))).catch(() => setProducts([]))
    apiClient.get<{ data: StockRow[] }>('/v1/kira/stock').then((r) => setStocks(r.data)).catch(() => setStocks([]))
    if (!isOperative) apiClient.get<{ data: BranchOpt[] }>('/v1/branches').then((r) => setBranches(r.data)).catch(() => setBranches([]))
  }, [isOperative])

  const selectedProduct = products.find((p) => p.id === productId)

  // Disponible del producto en la sucursal elegida (informativo; el backend es la fuente de verdad).
  const available = useMemo(() => {
    if (!productId || !branchId) return null
    const row = stocks.find((s) => s.product.id === productId && s.branch.id === branchId)
    return row ? (row.available ?? row.quantity) : 0
  }, [productId, branchId, stocks])

  // Prefill del precio con la tarifa del producto al elegirlo.
  useEffect(() => {
    if (selectedProduct?.rentalPrice != null && price === '') setPrice(String(selectedProduct.rentalPrice))
  }, [selectedProduct]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setErr(null)
    if (!clientId)  { setErr('Selecciona un cliente.'); return }
    if (!productId) { setErr('Selecciona un producto.'); return }
    if (!branchId)  { setErr('Selecciona una sucursal.'); return }
    const qty = parseFloat(quantity)
    if (!(qty > 0)) { setErr('La cantidad debe ser mayor a 0.'); return }
    if (available !== null && qty > available) { setErr(`Solo hay ${available} disponible(s) de este producto.`); return }
    const priceNum = parseFloat(price)
    if (!(priceNum > 0)) { setErr(chargeType === 'fixed' ? 'Indica el monto del alquiler.' : 'Indica la tarifa por día.'); return }
    if (!dueAt) { setErr('Indica la fecha de retorno.'); return }

    setSaving(true)
    const body = {
      clientId, productId, branchId,
      quantity: qty,
      chargeType,
      fixedAmount: chargeType === 'fixed' ? priceNum : undefined,
      dailyRate:   chargeType === 'daily' ? priceNum : undefined,
      deposit:     deposit !== '' ? parseFloat(deposit) : 0,
      dueAt:       new Date(`${dueAt}T12:00:00`).toISOString(),
      notes:       notes.trim() || null,
    }
    try {
      await apiClient.post('/v1/kira/rentals', body)
      onSuccess()
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo registrar el alquiler.')
    } finally { setSaving(false) }
  }

  const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
  const lbl = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400'

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nuevo alquiler</h3>
          <p className="mt-0.5 text-xs text-slate-500">Salida temporal: baja el disponible, no el total.</p>

          <div className="mt-4 max-h-[64vh] space-y-3 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Cliente *</label>
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inp}>
                  <option value="">Seleccionar…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isGeneric ? ' (mostrador)' : ''}</option>)}
                </select>
              </div>
              {!isOperative && (
                <div>
                  <label className={lbl}>Sucursal *</label>
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inp}>
                    <option value="">Seleccionar…</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className={lbl}>Producto * <span className="font-normal text-slate-400">(solo alquilables)</span></label>
              <select value={productId} onChange={(e) => { setProductId(e.target.value); setPrice('') }} className={inp}>
                <option value="">Seleccionar…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
              </select>
              {productId && branchId && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Disponible: <span className={available && available > 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-500'}>{available ?? '…'}</span> {selectedProduct?.unit}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Cantidad *</label>
                <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl}>Fecha de retorno *</label>
                <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={inp} />
              </div>
            </div>

            <div>
              <label className={lbl}>Tipo de cobro *</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setChargeType('fixed')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${chargeType === 'fixed' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}>
                  Monto fijo
                </button>
                <button type="button" onClick={() => setChargeType('daily')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${chargeType === 'daily' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}>
                  Por días (tarifa diaria)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>{chargeType === 'fixed' ? 'Monto fijo *' : 'Tarifa por día *'}</label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">$</span>
                  <input type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} className={`${inp} pl-7`} placeholder="0" />
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
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inp} resize-none`} placeholder="Estado del producto, accesorios entregados…" />
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
