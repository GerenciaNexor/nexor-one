'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Supplier {
  id: string
  tenantId: string
  name: string
  contactName: string | null
  email: string | null
  phone: string | null
  taxId: string | null
  address: string | null
  city: string | null
  paymentTerms: number | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  score?: { overallScore: number } | null
}

interface FormFields {
  name: string
  contactName: string
  email: string
  phone: string
  taxId: string
  address: string
  city: string
  paymentTerms: string
  notes: string
}

interface Props {
  mode: 'create' | 'edit'
  supplier?: Supplier
  onClose: () => void
  onSuccess: (supplier: Supplier) => void
}

const EMPTY: FormFields = {
  name: '', contactName: '', email: '', phone: '',
  taxId: '', address: '', city: '', paymentTerms: '', notes: '',
}

function toFormFields(s: Supplier): FormFields {
  return {
    name:         s.name,
    contactName:  s.contactName  ?? '',
    email:        s.email        ?? '',
    phone:        s.phone        ?? '',
    taxId:        s.taxId        ?? '',
    address:      s.address      ?? '',
    city:         s.city         ?? '',
    paymentTerms: s.paymentTerms != null ? String(s.paymentTerms) : '',
    notes:        s.notes        ?? '',
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function SupplierFormModal({ mode, supplier, onClose, onSuccess }: Props) {
  const [form, setForm] = useState<FormFields>(
    mode === 'edit' && supplier ? toFormFields(supplier) : EMPTY,
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
    if (!form.name.trim()) e.name = 'El nombre es obligatorio'
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = 'Email inválido'
    if (form.paymentTerms !== '') {
      const n = parseInt(form.paymentTerms, 10)
      if (isNaN(n) || n < 0) e.paymentTerms = 'Debe ser un número entero mayor o igual a 0'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError(null)

    const body: Record<string, unknown> = {
      name:         form.name.trim(),
      contactName:  form.contactName.trim()  || undefined,
      email:        form.email.trim()        || undefined,
      phone:        form.phone.trim()        || undefined,
      taxId:        form.taxId.trim()        || undefined,
      address:      form.address.trim()      || undefined,
      city:         form.city.trim()         || undefined,
      paymentTerms: form.paymentTerms !== '' ? parseInt(form.paymentTerms, 10) : undefined,
      notes:        form.notes.trim()        || undefined,
    }

    try {
      let saved: Supplier
      if (mode === 'create') {
        saved = await apiClient.post<Supplier>('/v1/nira/suppliers', body)
      } else {
        saved = await apiClient.put<Supplier>(`/v1/nira/suppliers/${supplier!.id}`, body)
      }
      onSuccess(saved)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setApiError(e.message ?? 'Error al guardar el proveedor')
    } finally {
      setSubmitting(false)
    }
  }

  const inp    = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
  const inpErr = 'w-full rounded-lg border border-red-400 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-red-100'

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {mode === 'create' ? 'Nuevo proveedor' : 'Editar proveedor'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {mode === 'create' ? 'Completa los datos para registrar el proveedor' : `Editando ${supplier?.name}`}
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
        <form id="supplier-form" onSubmit={handleSubmit} className="max-h-[68vh] overflow-y-auto">
          <div className="space-y-5 px-6 pb-2">

            {/* ── Datos básicos ───────────────────────────────────────── */}
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Datos básicos</p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Nombre *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={field('name')}
                    className={errors.name ? inpErr : inp}
                    placeholder="Razón social del proveedor"
                  />
                  {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">NIT / ID Fiscal</label>
                    <input
                      type="text"
                      value={form.taxId}
                      onChange={field('taxId')}
                      className={inp}
                      placeholder="900.123.456-7"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">Días de crédito</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form.paymentTerms}
                      onChange={field('paymentTerms')}
                      className={errors.paymentTerms ? inpErr : inp}
                      placeholder="30"
                    />
                    {errors.paymentTerms && <p className="mt-1 text-xs text-red-500">{errors.paymentTerms}</p>}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* ── Contacto ────────────────────────────────────────────── */}
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Contacto</p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Nombre de contacto</label>
                  <input
                    type="text"
                    value={form.contactName}
                    onChange={field('contactName')}
                    className={inp}
                    placeholder="Persona de referencia"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={field('email')}
                      className={errors.email ? inpErr : inp}
                      placeholder="proveedor@empresa.com"
                    />
                    {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">Teléfono</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={field('phone')}
                      className={inp}
                      placeholder="+57 300 000 0000"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* ── Ubicación y notas ────────────────────────────────────── */}
            <div className="pb-1">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Ubicación y notas</p>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">Dirección</label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={field('address')}
                      className={inp}
                      placeholder="Calle 1 # 2-3"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">Ciudad</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={field('city')}
                      className={inp}
                      placeholder="Bogotá"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Notas <span className="text-slate-400 font-normal">(opcional)</span></label>
                  <textarea
                    value={form.notes}
                    onChange={field('notes')}
                    rows={2}
                    className={`${inp} resize-none`}
                    placeholder="Observaciones internas sobre el proveedor…"
                  />
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
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="supplier-form"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {submitting
              ? 'Guardando…'
              : mode === 'create' ? 'Crear proveedor' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}
