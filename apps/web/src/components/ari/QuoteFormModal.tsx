'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Quote {
  id:          string
  quoteNumber: string
  status:      'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
  subtotal:    number
  discount:    number
  tax:         number
  total:       number
  validUntil:  string | null
  notes:       string | null
  createdAt:   string
  updatedAt:   string
  itemCount:   number
  client:      { id: string; name: string; company: string | null }
  deal:        { id: string; title: string } | null
  creator:     { id: string; name: string }
  items?: QuoteItem[]
}

export interface QuoteItem {
  id:          string
  description: string
  quantity:    number
  unitPrice:   number
  discountPct: number
  total:       number
  product:     { id: string; sku: string; name: string; unit: string } | null
}

interface Client { id: string; name: string; company: string | null }
interface Deal   { id: string; title: string }

interface StockInfo {
  productId:  string
  sku:        string
  name:       string
  unit:       string
  salePrice:  number | null
  totalStock: number
  branches:   { branchId: string; branchName: string; city: string; quantity: number }[]
}

interface LineItem {
  productId:   string
  description: string
  quantity:    string
  unitPrice:   string
  discountPct: string
}

interface Props {
  onClose:   () => void
  onSuccess: (quote: Quote) => void
}

const EMPTY_LINE: LineItem = {
  productId:   '',
  description: '',
  quantity:    '1',
  unitPrice:   '0',
  discountPct: '0',
}

function fmtCOP(n: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(n)
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function QuoteFormModal({ onClose, onSuccess }: Props) {
  const [clientId, setClientId]     = useState('')
  const [dealId, setDealId]         = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [taxRate, setTaxRate]       = useState('0')
  const [notes, setNotes]           = useState('')
  const [items, setItems]           = useState<LineItem[]>([{ ...EMPTY_LINE }])

  const [clients, setClients]       = useState<Client[]>([])
  const [deals, setDeals]           = useState<Deal[]>([])
  const [stockMap, setStockMap]     = useState<Record<string, StockInfo | null>>({})

  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError]     = useState<string | null>(null)
  const [lineErrors, setLineErrors] = useState<string[]>([])

  // ── Carga inicial ──────────────────────────────────────────────────────────

  useEffect(() => {
    apiClient.get<{ data: Client[] }>('/v1/ari/clients')
      .then((res) => setClients(res.data))
      .catch(() => {})
  }, [])

  // Cuando cambia el cliente, cargar sus deals
  useEffect(() => {
    setDealId('')
    setDeals([])
    if (!clientId) return
    apiClient.get<{ data: Deal[] }>(`/v1/ari/deals?clientId=${clientId}`)
      .then((res) => setDeals(res.data))
      .catch(() => {})
  }, [clientId])

  // ── Consulta de stock por producto ────────────────────────────────────────

  const fetchStock = useCallback(async (productId: string) => {
    if (!productId || stockMap[productId] !== undefined) return
    // Marcar como "cargando" con null para no repetir la petición
    setStockMap((prev) => ({ ...prev, [productId]: null }))
    try {
      const info = await apiClient.get<StockInfo>(`/v1/ari/quotes/stock/${productId}`)
      setStockMap((prev) => ({ ...prev, [productId]: info }))
    } catch {
      // Si falla simplemente no hay info de stock; no bloquear
    }
  }, [stockMap])

  // ── Gestión de líneas ─────────────────────────────────────────────────────

  function setLine(idx: number, patch: Partial<LineItem>) {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx]!, ...patch }
      return next
    })
  }

  function handleProductChange(idx: number, productId: string) {
    setLine(idx, { productId })
    if (productId) {
      fetchStock(productId)
      // Pre-fill unitPrice from salePrice when available
      const info = stockMap[productId]
      if (info?.salePrice != null) {
        setLine(idx, { productId, unitPrice: String(info.salePrice), description: info.name })
      }
    }
  }

  // Efecto para auto-rellenar precio/descripción cuando el stock carga después de seleccionar
  useEffect(() => {
    setItems((prev) => prev.map((line) => {
      if (!line.productId) return line
      const info = stockMap[line.productId]
      if (!info) return line
      const updated = { ...line }
      if (!line.description && info.name)   updated.description = info.name
      if (line.unitPrice === '0' && info.salePrice != null) updated.unitPrice = String(info.salePrice)
      return updated
    }))
  }, [stockMap]) // eslint-disable-line react-hooks/exhaustive-deps

  function addLine() {
    setItems((prev) => [...prev, { ...EMPTY_LINE }])
  }

  function removeLine(idx: number) {
    if (items.length === 1) return
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Cálculo de totales ────────────────────────────────────────────────────

  const parsed = items.map((line) => ({
    qty:   Math.max(0, parseFloat(line.quantity)    || 0),
    price: Math.max(0, parseFloat(line.unitPrice)   || 0),
    disc:  Math.max(0, parseFloat(line.discountPct) || 0),
  }))

  const subtotal = parsed.reduce((s, l) => s + l.qty * l.price, 0)
  const discount = parsed.reduce((s, l) => s + l.qty * l.price * (l.disc / 100), 0)
  const taxable  = subtotal - discount
  const tax      = taxable * ((parseFloat(taxRate) || 0) / 100)
  const total    = taxable + tax

  // ── Validación ────────────────────────────────────────────────────────────

  function validate(): boolean {
    const errs: string[] = items.map((line, idx) => {
      if (!line.description.trim()) return `Línea ${idx + 1}: la descripción es requerida`
      if ((parseFloat(line.quantity) || 0) <= 0) return `Línea ${idx + 1}: la cantidad debe ser mayor a 0`
      if ((parseFloat(line.unitPrice) || 0) < 0)  return `Línea ${idx + 1}: el precio no puede ser negativo`
      return ''
    }).filter(Boolean)

    setLineErrors(errs)
    return errs.length === 0 && !!clientId
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) {
      if (!clientId) setApiError('El cliente es requerido')
      return
    }
    setSubmitting(true)
    setApiError(null)

    const body = {
      clientId,
      dealId:     dealId   || undefined,
      validUntil: validUntil || undefined,
      taxRate:    parseFloat(taxRate) || 0,
      notes:      notes.trim() || undefined,
      items: items.map((line) => ({
        productId:   line.productId || undefined,
        description: line.description.trim(),
        quantity:    parseFloat(line.quantity) || 1,
        unitPrice:   parseFloat(line.unitPrice) || 0,
        discountPct: parseFloat(line.discountPct) || 0,
      })),
    }

    try {
      const quote = await apiClient.post<Quote>('/v1/ari/quotes', body)
      onSuccess(quote)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setApiError(e.message ?? 'Error al crear la cotización')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Clases compartidas ────────────────────────────────────────────────────

  const inp = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="flex w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nueva cotización</h2>
              <p className="mt-0.5 text-xs text-slate-400">El número se genera automáticamente (COT-YYYY-NNN)</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              aria-label="Cerrar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Body */}
          <form id="quote-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 pb-4">

              {/* ── Cliente + Deal ── */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Cliente *
                  </label>
                  <select
                    value={clientId}
                    onChange={(e) => { setClientId(e.target.value); setApiError(null) }}
                    className={!clientId && apiError ? inp.replace('border-slate-200', 'border-red-400') : inp}
                  >
                    <option value="">Seleccionar cliente…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.company ? ` — ${c.company}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Deal <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <select
                    value={dealId}
                    onChange={(e) => setDealId(e.target.value)}
                    disabled={!clientId}
                    className={inp}
                  >
                    <option value="">Sin deal asociado</option>
                    {deals.map((d) => (
                      <option key={d.id} value={d.id}>{d.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ── Válida hasta + IVA + Notas ── */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Válida hasta
                  </label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className={inp}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    IVA / Impuesto <span className="font-normal text-slate-400">(%)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className={inp}
                    placeholder="19"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Notas internas
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className={inp}
                    placeholder="Condiciones especiales, plazos…"
                  />
                </div>
              </div>

              {/* ── Líneas de ítems ── */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ítems *
                  </label>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    + Agregar línea
                  </button>
                </div>

                <div className="space-y-3">
                  {items.map((line, idx) => {
                    const stock = line.productId ? stockMap[line.productId] : undefined
                    const lineTotal = (parseFloat(line.quantity) || 0)
                      * (parseFloat(line.unitPrice) || 0)
                      * (1 - (parseFloat(line.discountPct) || 0) / 100)

                    return (
                      <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                        <div className="grid grid-cols-12 gap-2">

                          {/* Descripción (ocupa más espacio) */}
                          <div className="col-span-12 sm:col-span-5">
                            <label className="mb-1 block text-xs text-slate-500">Descripción *</label>
                            <input
                              type="text"
                              value={line.description}
                              onChange={(e) => setLine(idx, { description: e.target.value })}
                              className={inp}
                              placeholder="Producto o servicio…"
                            />
                          </div>

                          {/* Cantidad */}
                          <div className="col-span-4 sm:col-span-2">
                            <label className="mb-1 block text-xs text-slate-500">Cantidad</label>
                            <input
                              type="number"
                              min={0.001}
                              step={0.001}
                              value={line.quantity}
                              onChange={(e) => setLine(idx, { quantity: e.target.value })}
                              className={inp}
                            />
                          </div>

                          {/* Precio unitario */}
                          <div className="col-span-4 sm:col-span-2">
                            <label className="mb-1 block text-xs text-slate-500">Precio unit.</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={line.unitPrice}
                              onChange={(e) => setLine(idx, { unitPrice: e.target.value })}
                              className={inp}
                            />
                          </div>

                          {/* Descuento % */}
                          <div className="col-span-3 sm:col-span-2">
                            <label className="mb-1 block text-xs text-slate-500">Dto. %</label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={line.discountPct}
                              onChange={(e) => setLine(idx, { discountPct: e.target.value })}
                              className={inp}
                            />
                          </div>

                          {/* Total línea + botón eliminar */}
                          <div className="col-span-1 flex flex-col items-end justify-between">
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              disabled={items.length === 1}
                              className="text-slate-300 hover:text-red-400 disabled:invisible transition-colors"
                              aria-label="Eliminar línea"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M18 6 6 18M6 6l12 12"/>
                              </svg>
                            </button>
                            <p className="text-right text-xs font-medium text-slate-700 dark:text-slate-300">
                              {fmtCOP(lineTotal)}
                            </p>
                          </div>
                        </div>

                        {/* Fila de selección de producto + info stock */}
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <label className="text-xs text-slate-400">Producto catálogo:</label>
                            <input
                              type="text"
                              value={line.productId}
                              onChange={(e) => handleProductChange(idx, e.target.value)}
                              placeholder="ID de producto KIRA (opcional)"
                              className="w-52 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            />
                          </div>

                          {/* Stock info */}
                          {line.productId && stock !== undefined && (
                            stock === null ? (
                              <span className="text-xs text-slate-400">Consultando stock…</span>
                            ) : (
                              <span className={`text-xs font-medium ${stock.totalStock > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                Stock: {stock.totalStock} {stock.unit}
                                {stock.branches.length > 1 && (
                                  <span className="ml-1 font-normal text-slate-400">
                                    ({stock.branches.map((b) => `${b.branchName}: ${b.quantity}`).join(', ')})
                                  </span>
                                )}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Errores de líneas */}
                {lineErrors.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {lineErrors.map((e, i) => (
                      <p key={i} className="text-xs text-red-500">{e}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Totales ── */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-500">
                    <dt>Subtotal</dt>
                    <dd>{fmtCOP(subtotal)}</dd>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-slate-500">
                      <dt>Descuento</dt>
                      <dd className="text-amber-600">−{fmtCOP(discount)}</dd>
                    </div>
                  )}
                  {tax > 0 && (
                    <div className="flex justify-between text-slate-500">
                      <dt>IVA ({taxRate}%)</dt>
                      <dd>{fmtCOP(tax)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900 dark:border-slate-600 dark:text-slate-100">
                    <dt>Total</dt>
                    <dd>{fmtCOP(total)}</dd>
                  </div>
                </dl>
              </div>

              {/* Error global */}
              {apiError && (
                <div className="rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-600 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {apiError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="quote-form"
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {submitting ? 'Creando…' : 'Crear cotización'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}
