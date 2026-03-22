'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Product {
  id: string
  sku: string
  name: string
  description: string | null
  category: string | null
  unit: string
  salePrice: number | null
  costPrice: number | null
  minStock: number
  maxStock: number | null
  abcClass: 'A' | 'B' | 'C' | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface FormFields {
  sku: string
  name: string
  description: string
  category: string
  unit: string
  salePrice: string
  costPrice: string
  minStock: string
  maxStock: string
}

interface Props {
  mode: 'create' | 'edit'
  product?: Product
  onClose: () => void
  onSuccess: (product: Product) => void
}

const EMPTY: FormFields = {
  sku: '', name: '', description: '', category: '',
  unit: '', salePrice: '', costPrice: '', minStock: '0', maxStock: '',
}

function toFormFields(p: Product): FormFields {
  return {
    sku:         p.sku,
    name:        p.name,
    description: p.description ?? '',
    category:    p.category    ?? '',
    unit:        p.unit,
    salePrice:   p.salePrice  != null ? String(p.salePrice)  : '',
    costPrice:   p.costPrice  != null ? String(p.costPrice)  : '',
    minStock:    String(p.minStock),
    maxStock:    p.maxStock   != null ? String(p.maxStock)   : '',
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function ProductFormModal({ mode, product, onClose, onSuccess }: Props) {
  const [form, setForm] = useState<FormFields>(
    mode === 'edit' && product ? toFormFields(product) : EMPTY,
  )
  const [errors, setErrors]         = useState<Partial<Record<keyof FormFields, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError]     = useState<string | null>(null)

  function field(key: keyof FormFields) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormFields, string>> = {}
    if (mode === 'create' && !form.sku.trim())  e.sku  = 'El SKU es obligatorio'
    if (!form.name.trim())                       e.name = 'El nombre es obligatorio'
    if (!form.unit.trim())                       e.unit = 'La unidad es obligatoria'
    const min = parseFloat(form.minStock)
    if (form.minStock !== '' && (isNaN(min) || min < 0))
      e.minStock = 'El stock mínimo no puede ser negativo'
    const max = parseFloat(form.maxStock)
    if (form.maxStock !== '' && !isNaN(max) && !isNaN(min) && max <= min)
      e.maxStock = 'El stock máximo debe ser mayor al mínimo'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError(null)

    const body: Record<string, unknown> = {
      name:        form.name.trim(),
      description: form.description.trim() || undefined,
      category:    form.category.trim()    || undefined,
      unit:        form.unit.trim(),
      salePrice:   form.salePrice !== '' ? parseFloat(form.salePrice) : undefined,
      costPrice:   form.costPrice !== '' ? parseFloat(form.costPrice) : undefined,
      minStock:    form.minStock  !== '' ? parseFloat(form.minStock)  : 0,
      maxStock:    form.maxStock  !== '' ? parseFloat(form.maxStock)  : undefined,
    }
    if (mode === 'create') body.sku = form.sku.trim()

    try {
      let saved: Product
      if (mode === 'create') {
        saved = await apiClient.post<Product>('/v1/kira/products', body)
      } else {
        saved = await apiClient.put<Product>(`/v1/kira/products/${product!.id}`, body)
      }
      onSuccess(saved)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setApiError(e.message ?? 'Error al guardar el producto')
    } finally {
      setSubmitting(false)
    }
  }

  const inp = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
  const inpErr = 'w-full rounded-lg border border-red-400 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-red-100'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {mode === 'create' ? 'Nuevo producto' : 'Editar producto'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {mode === 'create' ? 'Completa los campos para agregar al catálogo' : `Editando ${product?.sku}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Cerrar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Form */}
        <form id="product-form" onSubmit={handleSubmit}
          className="max-h-[68vh] overflow-y-auto"
        >
          <div className="space-y-5 px-6 pb-2">

            {/* ── Identificación ─────────────────────────────────────── */}
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Identificación</p>
              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">SKU *</label>
                  <input
                    type="text"
                    value={form.sku}
                    disabled={mode === 'edit'}
                    onChange={field('sku')}
                    className={mode === 'edit'
                      ? 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-400 outline-none cursor-not-allowed'
                      : `${errors.sku ? inpErr : inp} font-mono`}
                    placeholder="PROD-001"
                  />
                  {errors.sku && <p className="mt-1 text-xs text-red-500">{errors.sku}</p>}
                </div>
                <div className="col-span-3">
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Nombre *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={field('name')}
                    className={errors.name ? inpErr : inp}
                    placeholder="Nombre del producto"
                  />
                  {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* ── Clasificación ──────────────────────────────────────── */}
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Clasificación</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Categoría</label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={field('category')}
                    className={inp}
                    placeholder="Ej: Analgésicos"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Unidad *</label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={field('unit')}
                    className={errors.unit ? inpErr : inp}
                    placeholder="caja, frasco, und…"
                  />
                  {errors.unit && <p className="mt-1 text-xs text-red-500">{errors.unit}</p>}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* ── Precios ────────────────────────────────────────────── */}
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Precios</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Precio de venta</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">$</span>
                    <input type="number" min="0" step="1" value={form.salePrice}
                      onChange={field('salePrice')}
                      className={`${inp} pl-7`} placeholder="0" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Costo unitario</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">$</span>
                    <input type="number" min="0" step="1" value={form.costPrice}
                      onChange={field('costPrice')}
                      className={`${inp} pl-7`} placeholder="0" />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* ── Inventario ─────────────────────────────────────────── */}
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Inventario</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Stock mínimo</label>
                  <input type="number" min="0" step="1" value={form.minStock}
                    onChange={field('minStock')}
                    className={errors.minStock ? inpErr : inp} />
                  {errors.minStock && <p className="mt-1 text-xs text-red-500">{errors.minStock}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Stock máximo</label>
                  <input type="number" min="0" step="1" value={form.maxStock}
                    onChange={field('maxStock')}
                    className={errors.maxStock ? inpErr : inp} placeholder="Sin límite" />
                  {errors.maxStock && <p className="mt-1 text-xs text-red-500">{errors.maxStock}</p>}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* ── Descripción ────────────────────────────────────────── */}
            <div className="pb-1">
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Descripción <span className="text-slate-400 font-normal">(opcional)</span></label>
              <textarea
                value={form.description}
                onChange={field('description')}
                rows={2}
                className={`${inp} resize-none`}
                placeholder="Notas adicionales sobre el producto…"
              />
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
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="product-form"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {submitting
              ? 'Guardando…'
              : mode === 'create' ? 'Crear producto' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
