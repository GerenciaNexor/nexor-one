'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'
import { useAuthStore } from '@/store/auth'
import { ProductFormModal, type Product } from '@/components/kira/ProductFormModal'

type Mode = 'purchase' | 'sale'
interface Opt   { id: string; name: string; isGeneric?: boolean }
interface Prod  { id: string; sku: string; name: string; unit: string; salePrice: number | null; costPrice: number | null }

const money = (n: number) => `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`

export function QuickRegisterModal({ initialMode = 'purchase', lockMode = false, onClose, onSuccess }: {
  initialMode?: Mode
  /** Si es true, no muestra el toggle compra/venta (fija el modo — p. ej. "Compras rápidas" en NIRA). */
  lockMode?: boolean
  onClose:  () => void
  onSuccess: () => void
}) {
  const user        = useAuthStore((s) => s.user)
  const isOperative = user?.role === 'OPERATIVE'

  const [mode, setMode] = useState<Mode>(initialMode)
  const [counterparties, setCP] = useState<Opt[]>([])
  const [products, setProducts] = useState<Prod[]>([])
  const [branches, setBranches] = useState<Opt[]>([])

  const [affects, setAffects]   = useState<boolean | null>(null)
  const [cpId, setCpId]         = useState('')
  const [branchId, setBranchId] = useState(isOperative ? (user?.branchId ?? '') : '')
  // Producto (buscable): existente o crear al vuelo (solo compra, con el MISMO formulario de KIRA).
  const [pQuery, setPQuery]     = useState('')
  const [pOpen, setPOpen]       = useState(false)
  const [productId, setProductId] = useState('')
  const [showProductForm, setShowProductForm] = useState(false)
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice]       = useState('')   // costo (compra) o precio (venta)
  const [description, setDesc]  = useState('')
  const [amount, setAmount]     = useState('')

  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  useEffect(() => {
    apiClient.get<{ data: Prod[] }>('/v1/quick/products').then((r) => setProducts(r.data)).catch(() => setProducts([]))
    apiClient.get<{ data: Opt[] }>('/v1/quick/branches').then((r) => { setBranches(r.data); if (r.data.length === 1 && !isOperative) setBranchId(r.data[0]!.id) }).catch(() => setBranches([]))
  }, [isOperative])
  useEffect(() => {
    const url = mode === 'purchase' ? '/v1/quick/suppliers' : '/v1/quick/clients'
    apiClient.get<{ data: Opt[] }>(url).then((r) => { setCP(r.data); setCpId(r.data.find((o) => o.isGeneric)?.id ?? '') }).catch(() => setCP([]))
  }, [mode])

  const qLow = pQuery.trim().toLowerCase()
  const matches = (qLow && !productId)
    ? products.filter((p) => p.name.toLowerCase().includes(qLow) || p.sku.toLowerCase().includes(qLow)).slice(0, 8)
    : []
  const noMatch = !!qLow && !productId && matches.length === 0

  function pickProduct(p: Prod) {
    setProductId(p.id); setPQuery(`${p.sku} — ${p.name}`); setPOpen(false)
    const suggested = mode === 'sale' ? p.salePrice : p.costPrice
    setPrice(suggested != null ? String(suggested) : '')
  }
  function onQueryChange(v: string) { setPQuery(v); setProductId(''); setPOpen(true) }
  function resetProduct() { setPQuery(''); setProductId(''); setPrice('') }
  function switchMode(m: Mode) { setMode(m); resetProduct() }

  // El producto se creó con el MISMO formulario de KIRA → queda seleccionado como existente.
  function onProductCreated(saved: Product) {
    const p: Prod = { id: saved.id, sku: saved.sku, name: saved.name, unit: saved.unit, salePrice: saved.salePrice, costPrice: saved.costPrice }
    setProducts((prev) => [p, ...prev])
    setShowProductForm(false)
    pickProduct(p)
    if (saved.costPrice != null) setPrice(String(saved.costPrice))
  }

  const inventoryAmount = (parseFloat(quantity) || 0) * (parseFloat(price) || 0)
  const totalPreview = affects ? inventoryAmount : (parseFloat(amount) || 0)
  const isSale = mode === 'sale'

  async function submit() {
    setErr(null)
    if (affects === null) { setErr('Responde si afecta al inventario.'); return }
    if (affects) {
      if (!productId) {
        setErr(isSale
          ? 'Este producto no existe en tu inventario. Agrégalo primero (por ejemplo con una compra).'
          : 'Selecciona un producto o créalo.')
        return
      }
      if (!isOperative && !branchId) { setErr('Selecciona la sucursal.'); return }
      if (!(parseFloat(quantity) > 0)) { setErr('Indica la cantidad.'); return }
      if (price === '' || !(parseFloat(price) >= 0)) { setErr(isSale ? 'Indica el precio.' : 'Indica el costo.'); return }
    } else {
      if (!description.trim()) { setErr('Describe la transacción.'); return }
      if (!(parseFloat(amount) > 0)) { setErr('Indica el monto.'); return }
    }
    setSaving(true)
    const body: Record<string, unknown> = {
      affectsInventory: affects,
      ...(mode === 'purchase' ? { supplierId: cpId || null } : { clientId: cpId || null }),
    }
    if (affects) {
      Object.assign(body, {
        productId, branchId: branchId || undefined, quantity: parseInt(quantity, 10),
        ...(isSale ? { unitPrice: parseFloat(price) } : { unitCost: parseFloat(price) }),
      })
    } else {
      Object.assign(body, { description: description.trim(), amount: parseFloat(amount) })
    }
    try {
      await apiClient.post(`/v1/quick/${mode === 'purchase' ? 'purchases' : 'sales'}`, body)
      onSuccess()
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo registrar.')
    } finally { setSaving(false) }
  }

  const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
  const lbl = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400'

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Registro rápido</h3>
          <p className="mt-0.5 text-xs text-slate-500">Una compra o venta que ya ocurrió — se registra completada, sin aprobación.</p>

          {!lockMode && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(['purchase', 'sale'] as const).map((m) => (
                <button key={m} onClick={() => switchMode(m)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${mode === m ? (m === 'sale' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300') : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}>
                  {m === 'purchase' ? 'Compra' : 'Venta'}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 max-h-[62vh] space-y-3 overflow-y-auto pr-1">
            <div>
              <label className={lbl}>{isSale ? 'Cliente' : 'Proveedor'}</label>
              <select value={cpId} onChange={(e) => setCpId(e.target.value)} className={inp}>
                {counterparties.map((o) => <option key={o.id} value={o.id}>{o.name}{o.isGeneric ? ' (genérico)' : ''}</option>)}
              </select>
            </div>

            <div>
              <label className={lbl}>¿Es un producto que debe estar en el inventario? *</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAffects(true)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${affects === true ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}>
                  Sí, afecta inventario
                </button>
                <button type="button" onClick={() => setAffects(false)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${affects === false ? 'border-slate-500 bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}>
                  No (servicio/consumo)
                </button>
              </div>
            </div>

            {affects === true && (
              <>
                <div className="relative">
                  <label className={lbl}>Producto *</label>
                  <input type="text" value={pQuery} onChange={(e) => onQueryChange(e.target.value)}
                    onFocus={() => { if (matches.length) setPOpen(true) }}
                    onBlur={() => setTimeout(() => setPOpen(false), 150)}
                    className={inp} placeholder="Escribe el nombre o SKU…" />
                  {pOpen && matches.length > 0 && (
                    <div className="absolute left-0 top-full z-20 mt-0.5 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900">
                      {matches.map((p) => (
                        <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickProduct(p)}
                          className="block w-full px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{p.name}</span> <span className="text-slate-400">{p.sku} · {p.unit}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* No existe → asimetría HU-170 */}
                  {noMatch && !isSale && (
                    <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                      «{pQuery.trim()}» no existe. <button type="button" onClick={() => setShowProductForm(true)} className="font-semibold underline">¿Deseas ingresarlo?</button>
                    </div>
                  )}
                  {noMatch && isSale && (
                    <p className="mt-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                      Este producto no existe en tu inventario. <b>Agrégalo primero</b> (por ejemplo con una compra) antes de venderlo.
                    </p>
                  )}
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Cantidad *</label>
                    <input type="number" min="1" step="1" value={quantity}
                      onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setQuantity(v) }} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>{isSale ? 'Precio unit. *' : 'Costo unit. *'}</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">$</span>
                      <input type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} className={`${inp} pl-7`} placeholder="0" />
                    </div>
                  </div>
                </div>
              </>
            )}

            {affects === false && (
              <>
                <div>
                  <label className={lbl}>Descripción *</label>
                  <input type="text" value={description} onChange={(e) => setDesc(e.target.value)} className={inp} placeholder={isSale ? 'Ej: mano de obra, servicio…' : 'Ej: café de oficina, servilletas…'} />
                </div>
                <div>
                  <label className={lbl}>Monto *</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">$</span>
                    <input type="number" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inp} pl-7`} placeholder="0" />
                  </div>
                </div>
              </>
            )}

            {affects !== null && (
              <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                <span className="text-slate-500">{isSale ? 'Ingreso' : 'Gasto'} a registrar</span>
                <span className={`font-semibold ${isSale ? 'text-emerald-600' : 'text-slate-800 dark:text-slate-100'}`}>{money(totalPreview)}</span>
              </div>
            )}

            {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
            <button onClick={submit} disabled={saving} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${isSale ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {saving ? 'Registrando…' : `Registrar ${isSale ? 'venta' : 'compra'}`}
            </button>
          </div>
        </div>
      </div>

      {/* HU-170 — alta de producto con el MISMO formulario de KIRA (idéntico al del inventario). */}
      {showProductForm && (
        <ProductFormModal mode="create" onClose={() => setShowProductForm(false)} onSuccess={onProductCreated} />
      )}
    </Portal>
  )
}
