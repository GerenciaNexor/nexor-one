'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Client {
  id: string
  tenantId: string
  name: string
  email: string | null
  phone: string | null
  whatsappId: string | null
  company: string | null
  taxId: string | null
  address: string | null
  city: string | null
  source: string | null
  tags: string[]
  notes: string | null
  assignedTo: string | null
  branchId: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  assignedUser?: { id: string; name: string } | null
  activeDealsCount?: number
}

interface User { id: string; name: string }

interface FormFields {
  name: string
  email: string
  phone: string
  whatsappId: string
  company: string
  taxId: string
  address: string
  city: string
  source: string
  tags: string
  notes: string
  assignedTo: string
}

interface Props {
  mode: 'create' | 'edit'
  client?: Client
  onClose: () => void
  onSuccess: (client: Client) => void
}

const EMPTY: FormFields = {
  name: '', email: '', phone: '', whatsappId: '',
  company: '', taxId: '', address: '', city: '',
  source: '', tags: '', notes: '', assignedTo: '',
}

function toFormFields(c: Client): FormFields {
  return {
    name:       c.name,
    email:      c.email      ?? '',
    phone:      c.phone      ?? '',
    whatsappId: c.whatsappId ?? '',
    company:    c.company    ?? '',
    taxId:      c.taxId      ?? '',
    address:    c.address    ?? '',
    city:       c.city       ?? '',
    source:     c.source     ?? '',
    tags:       c.tags.join(', '),
    notes:      c.notes      ?? '',
    assignedTo: c.assignedTo ?? '',
  }
}

const SOURCE_OPTIONS = [
  { value: '',          label: 'Sin especificar' },
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'email',     label: 'Email' },
  { value: 'manual',    label: 'Manual' },
  { value: 'referido',  label: 'Referido' },
]

// ─── Componente ───────────────────────────────────────────────────────────────

export function ClientFormModal({ mode, client, onClose, onSuccess }: Props) {
  const [form, setForm] = useState<FormFields>(
    mode === 'edit' && client ? toFormFields(client) : EMPTY,
  )
  const [errors, setErrors]         = useState<Partial<Record<keyof FormFields, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError]     = useState<string | null>(null)
  const [users, setUsers]           = useState<User[]>([])

  useEffect(() => {
    apiClient.get<{ data: User[] }>('/v1/users')
      .then((res) => setUsers(res.data))
      .catch(() => {})
  }, [])

  function field(key: keyof FormFields) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormFields, string>> = {}
    if (!form.name.trim()) e.name = 'El nombre es obligatorio'
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = 'Email inválido'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError(null)

    const tagsArray = form.tags.trim()
      ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : []

    const body: Record<string, unknown> = {
      name:       form.name.trim(),
      email:      form.email.trim()      || undefined,
      phone:      form.phone.trim()      || undefined,
      whatsappId: form.whatsappId.trim() || undefined,
      company:    form.company.trim()    || undefined,
      taxId:      form.taxId.trim()      || undefined,
      address:    form.address.trim()    || undefined,
      city:       form.city.trim()       || undefined,
      source:     form.source            || undefined,
      tags:       tagsArray.length       ? tagsArray : undefined,
      notes:      form.notes.trim()      || undefined,
      assignedTo: form.assignedTo        || undefined,
    }

    try {
      let saved: Client
      if (mode === 'create') {
        saved = await apiClient.post<Client>('/v1/ari/clients', body)
      } else {
        saved = await apiClient.put<Client>(`/v1/ari/clients/${client!.id}`, body)
      }
      onSuccess(saved)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setApiError(e.message ?? 'Error al guardar el cliente')
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
                {mode === 'create' ? 'Nuevo cliente' : 'Editar cliente'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {mode === 'create'
                  ? 'Completa los datos para registrar el cliente'
                  : `Editando ${client?.name}`}
              </p>
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

          {/* Form */}
          <form id="client-form" onSubmit={handleSubmit} className="max-h-[68vh] overflow-y-auto">
            <div className="space-y-5 px-6 pb-2">

              {/* ── Información principal ───────────────────────────────────── */}
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Información principal</p>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">Nombre *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={field('name')}
                      className={errors.name ? inpErr : inp}
                      placeholder="Nombre completo o razón social"
                    />
                    {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        Empresa <span className="font-normal text-slate-400">(B2B)</span>
                      </label>
                      <input
                        type="text"
                        value={form.company}
                        onChange={field('company')}
                        className={inp}
                        placeholder="Empresa S.A.S."
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">NIT / Cédula</label>
                      <input
                        type="text"
                        value={form.taxId}
                        onChange={field('taxId')}
                        className={inp}
                        placeholder="900.123.456-7"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100" />

              {/* ── Contacto ────────────────────────────────────────────────── */}
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Contacto</p>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2" strokeLinecap="round">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                      </svg>
                      Número de WhatsApp
                    </label>
                    <input
                      type="text"
                      value={form.whatsappId}
                      onChange={field('whatsappId')}
                      className={inp}
                      placeholder="573001234567"
                    />
                    <p className="mt-1 text-[10px] text-slate-400">
                      ID que usa el agente ARI para identificar mensajes entrantes
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">Email</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={field('email')}
                        className={errors.email ? inpErr : inp}
                        placeholder="cliente@empresa.com"
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

              {/* ── Adicional ───────────────────────────────────────────────── */}
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Adicional</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">Origen del contacto</label>
                      <select value={form.source} onChange={field('source')} className={inp}>
                        {SOURCE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">Vendedor asignado</label>
                      <select value={form.assignedTo} onChange={field('assignedTo')} className={inp}>
                        <option value="">Sin asignar</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
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
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">
                      Etiquetas <span className="font-normal text-slate-400">(separadas por coma)</span>
                    </label>
                    <input
                      type="text"
                      value={form.tags}
                      onChange={field('tags')}
                      className={inp}
                      placeholder="vip, recurrente, mayorista"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100" />

              {/* ── Notas ───────────────────────────────────────────────────── */}
              <div className="pb-1">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Notas internas</p>
                <textarea
                  value={form.notes}
                  onChange={field('notes')}
                  rows={2}
                  className={`${inp} resize-none`}
                  placeholder="Observaciones internas sobre el cliente…"
                />
              </div>
            </div>

            {apiError && (
              <div className="mx-6 mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-600 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
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
              form="client-form"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {submitting
                ? 'Guardando…'
                : mode === 'create' ? 'Crear cliente' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
