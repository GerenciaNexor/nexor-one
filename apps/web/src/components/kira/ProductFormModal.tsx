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

  const inp = (extra: string) =>
    `w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none ${extra}`
  const ok  = 'border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
  const bad = 'border-red-400 focus:ring-2 focus:ring-red-100'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {mode === 'create' ? 'Nuevo producto' : 'Editar producto'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form id="product-form" onSubmit={handleSubmit}
          className="max-h-[65vh] overflow-y-auto px-6 py-4"
        >
          <div className="space-y-4">

            {/* SKU */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">SKU *</label>
              <input
                type="text"
                value={form.sku}
                disabled={mode === 'edit'}
                onChange={field('sku')}
                className={inp(mode === 'edit'
                  ? 'cursor-not-allowed bg-slate-50 text-slate-400 border-slate-200'
                  : errors.sku ? bad : ok)}
                placeholder="Ej: PROD-001"
              />
              {errors.sku && <p className="mt-1 text-xs text-red-500">{errors.sku}</p>}
            </div>

            {/* Nombre */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Nombre *</label>
              <input
                type="text"
                value={form.name}
                onChange={field('name')}
                className={inp(errors.name ? bad : ok)}
                placeholder="Ej: Cemento Portland 50 kg"
              />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>

            {/* Categoría + Unidad */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Categoría</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={field('category')}
                  className={inp(ok)}
                  placeholder="Ej: Materiales"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Unidad *</label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={field('unit')}
                  className={inp(errors.unit ? bad : ok)}
                  placeholder="Ej: kg, und, caja"
                />
                {errors.unit && <p className="mt-1 text-xs text-red-500">{errors.unit}</p>}
              </div>
            </div>

            {/* Precios */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Precio de venta</label>
                <input type="number" min="0" step="0.01" value={form.salePrice}
                  onChange={field('salePrice')} className={inp(ok)} placeholder="0.00" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Costo unitario</label>
                <input type="number" min="0" step="0.01" value={form.costPrice}
                  onChange={field('costPrice')} className={inp(ok)} placeholder="0.00" />
              </div>
            </div>

            {/* Stock mín / máx */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Stock mínimo</label>
                <input type="number" min="0" step="1" value={form.minStock}
                  onChange={field('minStock')}
                  className={inp(errors.minStock ? bad : ok)} />
                {errors.minStock && <p className="mt-1 text-xs text-red-500">{errors.minStock}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Stock máximo</label>
                <input type="number" min="0" step="1" value={form.maxStock}
                  onChange={field('maxStock')}
                  className={inp(errors.maxStock ? bad : ok)} placeholder="Sin límite" />
                {errors.maxStock && <p className="mt-1 text-xs text-red-500">{errors.maxStock}</p>}
              </div>
            </div>

            {/* Descripción */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Descripción</label>
              <textarea
                value={form.description}
                onChange={field('description')}
                rows={3}
                className={`${inp(ok)} resize-none`}
                placeholder="Descripción opcional..."
              />
            </div>
          </div>

          {apiError && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{apiError}</p>
          )}
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
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
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {submitting
              ? 'Guardando...'
              : mode === 'create' ? 'Crear producto' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
