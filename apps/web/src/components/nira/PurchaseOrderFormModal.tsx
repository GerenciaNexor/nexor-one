'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'
import type { Supplier } from './SupplierFormModal'
import { OcrExtractButton } from '@/components/ocr/OcrExtractButton'
import type { OcrResult, Confidence, OrderExtraction } from '@/components/ocr/OcrExtractButton'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  sku: string
  name: string
  unit: string
  costPrice: number | null
}

interface Branch {
  id: string
  name: string
}

interface LineItem {
  productId:       string
  productLabel:    string  // "SKU — Nombre"
  quantityOrdered: string
  unitCost:        string
  ocrDescription?: string  // descripción extraída por OCR — visible como hint al usuario
  _conf?: {
    quantityOrdered?: Confidence
    unitCost?:        Confidence
  }
}

interface Props {
  onClose:      () => void
  onSuccess:    () => void
  initialData?: OrderExtraction
}

const EMPTY_LINE: LineItem = { productId: '', productLabel: '', quantityOrdered: '1', unitCost: '0' }

// ─── Componente ───────────────────────────────────────────────────────────────

export function PurchaseOrderFormModal({ onClose, onSuccess, initialData }: Props) {
  // Datos del formulario
  const [supplierId,       setSupplierId]       = useState('')
  const [branchId,         setBranchId]         = useState('')
  const [expectedDelivery, setExpectedDelivery] = useState('')
  const [taxRate,          setTaxRate]          = useState('0')
  const [notes,            setNotes]            = useState('')
  const [lines,            setLines]            = useState<LineItem[]>([{ ...EMPTY_LINE }])

  // Datos externos
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [branches,  setBranches]  = useState<Branch[]>([])
  const [products,  setProducts]  = useState<Product[]>([])

  // UI
  const [submitting,    setSubmitting]    = useState(false)
  const [apiError,      setApiError]      = useState<string | null>(null)
  const [lineErrors,    setLineErrors]    = useState<string[]>([])
  const [supplierHint,  setSupplierHint]  = useState<string | null>(null)

  // ── Pre-llenado desde OCR (initialData) ───────────────────────────────────
  useEffect(() => {
    if (!initialData || initialData.documentType !== 'order') return
    if (initialData.items.length > 0) {
      setLines(initialData.items.map((item) => ({
        productId:       '',
        productLabel:    '',
        quantityOrdered: String(item.quantity?.value || 1),
        unitCost:        item.unitPrice ? String(item.unitPrice.value) : '',
        ocrDescription:  item.description?.value ?? '',
        _conf: {
          quantityOrdered: item.quantity?.confidence,
          unitCost:        item.unitPrice?.confidence ?? 'low',
        },
      })))
    }
    if (initialData.notes?.value) setNotes(initialData.notes.value)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cargar datos de referencia ─────────────────────────────────────────────
  useEffect(() => {
    apiClient.get<{ data: Supplier[] }>('/v1/nira/suppliers').then((r) => setSuppliers(r.data)).catch(() => null)
    apiClient.get<{ data: Branch[] }>('/v1/branches').then((r) => setBranches(r.data)).catch(() => null)
    apiClient.get<{ data: Product[] }>('/v1/kira/products?pageSize=500').then((r) => setProducts(r.data)).catch(() => null)
  }, [])

  // ── Auto-match proveedor desde OCR cuando la lista carga ─────────────────
  useEffect(() => {
    if (!initialData?.supplier?.value || !suppliers.length || supplierId) return
    const searchName = initialData.supplier.value.toLowerCase()
    const searchNit  = initialData.supplierNit?.value?.toLowerCase() ?? ''
    const matched = suppliers.find((s) => {
      const name = s.name.toLowerCase()
      const nit  = (s.taxId ?? '').toLowerCase().replace(/[^0-9]/g, '')
      const qNit = searchNit.replace(/[^0-9]/g, '')
      return name.includes(searchName) || searchName.includes(name) ||
             (qNit && nit && nit === qNit)
    })
    if (matched) {
      setSupplierId(matched.id)
      setSupplierHint(null)
    } else {
      setSupplierHint(initialData.supplier.value)
    }
  }, [suppliers]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Totales calculados ────────────────────────────────────────────────────
  const subtotal = lines.reduce((acc, l) => {
    const qty  = parseFloat(l.quantityOrdered) || 0
    const cost = parseFloat(l.unitCost)        || 0
    return acc + qty * cost
  }, 0)
  const tax   = subtotal * ((parseFloat(taxRate) || 0) / 100)
  const total = subtotal + tax

  // ── Gestión de líneas ─────────────────────────────────────────────────────
  function updateLine(idx: number, field: keyof LineItem, value: string) {
    setLines((prev) => {
      const next = [...prev]
      const base = { ...next[idx]!, [field]: value }
      if (base._conf && field in base._conf) {
        const cleared = { ...base._conf }
        delete (cleared as Record<string, unknown>)[field as string]
        base._conf = cleared
      }
      next[idx] = base
      return next
    })
  }

  function pickProduct(idx: number, productId: string) {
    const product = products.find((p) => p.id === productId)
    if (!product) return
    setLines((prev) => {
      const next = [...prev]
      next[idx] = {
        ...next[idx]!,
        productId,
        productLabel: `${product.sku} — ${product.name}`,
        unitCost:     product.costPrice != null ? String(product.costPrice) : '0',
        _conf:        undefined,  // el usuario eligió explícitamente — ya no necesita verificar
      }
      return next
    })
  }

  function addLine() { setLines((prev) => [...prev, { ...EMPTY_LINE }]) }

  function handleOcrExtracted(result: OcrResult) {
    if (result.documentType !== 'order') return
    if (result.items.length > 0) {
      setLines(result.items.map((item) => ({
        productId:       '',
        productLabel:    '',
        quantityOrdered: String(item.quantity?.value || 1),
        unitCost:        item.unitPrice ? String(item.unitPrice.value) : '',
        ocrDescription:  item.description?.value ?? '',
        _conf: {
          quantityOrdered: item.quantity?.confidence,
          unitCost:        item.unitPrice?.confidence ?? 'low',
        },
      })))
    }
    if (result.notes?.value) setNotes(result.notes.value)
  }

  function removeLine(idx: number) {
    if (lines.length === 1) return
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Validación y envío ────────────────────────────────────────────────────
  function validate(): boolean {
    const errs: string[] = []
    if (!supplierId) { setApiError('Selecciona un proveedor'); return false }
    lines.forEach((l, i) => {
      if (!l.productId) errs[i] = 'Selecciona un producto'
      else if (!(parseFloat(l.quantityOrdered) > 0)) errs[i] = 'Cantidad inválida'
      else if (parseFloat(l.unitCost) < 0) errs[i] = 'Costo inválido'
      else errs[i] = ''
    })
    setLineErrors(errs)
    return errs.every((e) => !e)
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError(null)

    const body = {
      supplierId,
      branchId:         branchId || undefined,
      expectedDelivery: expectedDelivery || undefined,
      taxRate:          parseFloat(taxRate) || 0,
      notes:            notes.trim() || undefined,
      items: lines.map((l) => ({
        productId:       l.productId,
        quantityOrdered: parseFloat(l.quantityOrdered),
        unitCost:        parseFloat(l.unitCost),
      })),
    }

    try {
      await apiClient.post('/v1/nira/purchase-orders', body)
      onSuccess()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setApiError(e.message ?? 'Error al crear la orden de compra')
    } finally {
      setSubmitting(false)
    }
  }

  const inp    = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
  const inpLow = 'w-full rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100'
  const sel    = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
  const inpErr = 'w-full rounded-lg border border-red-400 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-red-100'
  const confInp = (conf?: Confidence) => conf === 'low' ? inpLow : inp

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-base font-semibold text-slate-900">Nueva orden de compra</h2>
            <OcrExtractButton docType="order" onExtracted={handleOcrExtracted} label="Extraer desde PDF / imagen" />
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Form */}
        <form id="po-form" onSubmit={handleSubmit} className="max-h-[72vh] overflow-y-auto">
          <div className="space-y-5 px-6 py-5">

            {/* ── Encabezado de la OC ──────────────────────────────────── */}
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Datos generales</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Proveedor *</label>
                  <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setSupplierHint(null) }}
                    className={!supplierId && apiError ? inpErr : sel}>
                    <option value="">Seleccionar proveedor…</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {supplierHint && !supplierId && (
                    <p className="mt-1 text-[11px] text-amber-700">
                      OCR detectó &ldquo;{supplierHint}&rdquo; — no encontrado en el catálogo. Créalo primero o selecciónalo manualmente.
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Sucursal destino</label>
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={sel}>
                    <option value="">Sin sucursal específica</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Entrega esperada</label>
                  <input type="date" value={expectedDelivery}
                    onChange={(e) => setExpectedDelivery(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">IVA / Impuesto (%)</label>
                  <input type="number" min="0" max="100" step="0.01"
                    value={taxRate} onChange={(e) => setTaxRate(e.target.value)}
                    className={inp} placeholder="0" />
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Notas</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  rows={2} className={`${inp} resize-none`}
                  placeholder="Instrucciones de entrega, condiciones especiales…" />
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* ── Líneas de productos ──────────────────────────────────── */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Productos</p>
                <button type="button" onClick={addLine}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                  <span className="text-base leading-none">+</span> Agregar línea
                </button>
              </div>

              {/* Encabezado tabla */}
              <div className="mb-1 hidden grid-cols-[1fr_7rem_7rem_1.5rem] gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:grid">
                <span>Producto</span>
                <span className="text-right">Cantidad</span>
                <span className="text-right">Costo unitario</span>
                <span />
              </div>

              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7rem_7rem_1.5rem] sm:items-start">
                    {/* Producto */}
                    <div>
                      <select
                        value={line.productId}
                        onChange={(e) => pickProduct(idx, e.target.value)}
                        className={lineErrors[idx] ? inpErr : sel}
                      >
                        <option value="">Seleccionar producto…</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.sku} — {p.name} ({p.unit})</option>
                        ))}
                      </select>
                      {line.ocrDescription && !line.productId && (
                        <p className="mt-1 text-[11px] text-violet-600 dark:text-violet-400">
                          📄 OCR: {line.ocrDescription}
                        </p>
                      )}
                      {lineErrors[idx] && <p className="mt-1 text-xs text-red-500">{lineErrors[idx]}</p>}
                    </div>

                    {/* Cantidad */}
                    <div>
                      <input type="number" min="0.01" step="0.01"
                        value={line.quantityOrdered}
                        onChange={(e) => updateLine(idx, 'quantityOrdered', e.target.value)}
                        className={`${confInp(line._conf?.quantityOrdered)} text-right`}
                        title={line._conf?.quantityOrdered === 'low' ? 'Verificar este valor' : undefined}
                        placeholder="1" />
                    </div>

                    {/* Costo */}
                    <div>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">$</span>
                        <input type="number" min="0" step="1"
                          value={line.unitCost}
                          onChange={(e) => updateLine(idx, 'unitCost', e.target.value)}
                          className={`${confInp(line._conf?.unitCost)} pl-7 text-right`}
                          title={line._conf?.unitCost === 'low' ? 'Verificar este valor' : undefined}
                          placeholder="0" />
                      </div>
                    </div>

                    {/* Quitar línea */}
                    <div className="flex items-center">
                      <button type="button" onClick={() => removeLine(idx)}
                        disabled={lines.length === 1}
                        className="flex h-8 w-6 items-center justify-center text-slate-300 hover:text-red-400 disabled:opacity-30 transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* ── Resumen de totales ───────────────────────────────────── */}
            <div className="flex justify-end">
              <div className="w-56 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>${subtotal.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</span>
                </div>
                {tax > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Impuesto ({taxRate}%)</span>
                    <span>${tax.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
                  <span>Total</span>
                  <span>${total.toLocaleString('es-CO', { minimumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>
          </div>

          {apiError && (
            <div className="mx-6 mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-600 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {apiError}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button type="submit" form="po-form" disabled={submitting}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-60">
            {submitting ? 'Creando…' : initialData ? 'Confirmar y crear borrador' : 'Crear borrador'}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}
