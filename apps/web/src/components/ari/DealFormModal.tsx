'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PipelineStage {
  id:          string
  name:        string
  order:       number
  color:       string | null
  isFinalWon:  boolean
  isFinalLost: boolean
}

export interface Deal {
  id:            string
  title:         string
  value:         number | null
  probability:   number | null
  expectedClose: string | null
  lostReason:    string | null
  closedAt:      string | null
  createdAt:     string
  updatedAt:     string
  client:        { id: string; name: string; company: string | null }
  stage:         PipelineStage
  assignedUser:  { id: string; name: string } | null
  branch:        { id: string; name: string } | null
}

interface Client { id: string; name: string; company: string | null }
interface User   { id: string; name: string }
interface Branch { id: string; name: string }

interface FormFields {
  clientId:      string
  stageId:       string
  title:         string
  assignedTo:    string
  branchId:      string
  value:         string
  probability:   string
  expectedClose: string
}

interface Props {
  mode:          'create' | 'edit'
  deal?:         Deal
  stages:        PipelineStage[]
  initialStageId?: string
  onClose:       () => void
  onSuccess:     (deal: Deal) => void
}

const EMPTY: FormFields = {
  clientId:      '',
  stageId:       '',
  title:         '',
  assignedTo:    '',
  branchId:      '',
  value:         '',
  probability:   '',
  expectedClose: '',
}

function toFormFields(d: Deal): FormFields {
  return {
    clientId:      d.client.id,
    stageId:       d.stage.id,
    title:         d.title,
    assignedTo:    d.assignedUser?.id ?? '',
    branchId:      d.branch?.id ?? '',
    value:         d.value != null ? String(d.value) : '',
    probability:   d.probability != null ? String(d.probability) : '',
    expectedClose: d.expectedClose ? d.expectedClose.slice(0, 10) : '',
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function DealFormModal({ mode, deal, stages, initialStageId, onClose, onSuccess }: Props) {
  const [form, setForm] = useState<FormFields>(() => {
    if (mode === 'edit' && deal) return toFormFields(deal)
    return { ...EMPTY, stageId: initialStageId ?? stages[0]?.id ?? '' }
  })

  const [errors, setErrors]         = useState<Partial<Record<keyof FormFields, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError]     = useState<string | null>(null)

  const [clients, setClients]   = useState<Client[]>([])
  const [users, setUsers]       = useState<User[]>([])
  const [branches, setBranches] = useState<Branch[]>([])

  useEffect(() => {
    apiClient.get<{ data: Client[] }>('/v1/ari/clients')
      .then((res) => setClients(res.data))
      .catch(() => {})
    apiClient.get<{ data: User[] }>('/v1/users')
      .then((res) => setUsers(res.data))
      .catch(() => {})
    apiClient.get<{ data: Branch[] }>('/v1/branches')
      .then((res) => setBranches(res.data))
      .catch(() => {})
  }, [])

  function field(key: keyof FormFields) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormFields, string>> = {}
    if (!form.clientId)     e.clientId = 'El cliente es obligatorio'
    if (!form.stageId)      e.stageId  = 'La etapa es obligatoria'
    if (!form.title.trim()) e.title    = 'El título es obligatorio'
    if (form.value && isNaN(Number(form.value)))
      e.value = 'El valor debe ser un número'
    if (form.probability) {
      const p = Number(form.probability)
      if (isNaN(p) || p < 0 || p > 100)
        e.probability = 'La probabilidad debe ser entre 0 y 100'
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
      clientId:      form.clientId,
      stageId:       form.stageId,
      title:         form.title.trim(),
      assignedTo:    form.assignedTo    || undefined,
      branchId:      form.branchId      || undefined,
      value:         form.value         ? Number(form.value)       : undefined,
      probability:   form.probability   ? Number(form.probability) : undefined,
      expectedClose: form.expectedClose || undefined,
    }

    try {
      let saved: Deal
      if (mode === 'create') {
        saved = await apiClient.post<Deal>('/v1/ari/deals', body)
      } else {
        // Para editar usamos el endpoint de mover etapa + recrear — en V1 solo movemos
        saved = await apiClient.put<Deal>(`/v1/ari/deals/${deal!.id}/stage`, {
          stageId: form.stageId,
        })
      }
      onSuccess(saved)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setApiError(e.message ?? 'Error al guardar el deal')
    } finally {
      setSubmitting(false)
    }
  }

  const inp    = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
  const inpErr = 'w-full rounded-lg border border-red-400 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-red-100'

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {mode === 'create' ? 'Nuevo deal' : 'Mover etapa'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {mode === 'create'
                  ? 'Registra una nueva oportunidad de venta'
                  : `Moviendo "${deal?.title}"`}
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
          <form id="deal-form" onSubmit={handleSubmit} className="max-h-[68vh] overflow-y-auto">
            <div className="space-y-4 px-6 pb-2">

              {mode === 'create' && (
                <>
                  {/* ── Cliente + Título ── */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Cliente *
                    </label>
                    <select value={form.clientId} onChange={field('clientId')} className={errors.clientId ? inpErr : inp}>
                      <option value="">Seleccionar cliente…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.company ? ` — ${c.company}` : ''}
                        </option>
                      ))}
                    </select>
                    {errors.clientId && <p className="mt-1 text-xs text-red-500">{errors.clientId}</p>}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Título del deal *
                    </label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={field('title')}
                      className={errors.title ? inpErr : inp}
                      placeholder="Ej: Pedido 50 unidades shampoo"
                    />
                    {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
                  </div>
                </>
              )}

              {/* ── Etapa ── */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Etapa *
                </label>
                <select value={form.stageId} onChange={field('stageId')} className={errors.stageId ? inpErr : inp}>
                  <option value="">Seleccionar etapa…</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {errors.stageId && <p className="mt-1 text-xs text-red-500">{errors.stageId}</p>}
              </div>

              {/* Aviso si la etapa seleccionada es Perdido → pedir razón */}
              {stages.find((s) => s.id === form.stageId)?.isFinalLost && mode === 'edit' && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Razón de pérdida <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={field('title')}
                    className={inp}
                    placeholder="Ej: Precio, competencia, sin presupuesto…"
                  />
                </div>
              )}

              {mode === 'create' && (
                <>
                  <div className="border-t border-slate-100 dark:border-slate-700" />

                  {/* ── Valor + Probabilidad ── */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Valor estimado <span className="font-normal text-slate-400">(COP)</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={form.value}
                        onChange={field('value')}
                        className={errors.value ? inpErr : inp}
                        placeholder="1.500.000"
                      />
                      {errors.value && <p className="mt-1 text-xs text-red-500">{errors.value}</p>}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Probabilidad <span className="font-normal text-slate-400">(%)</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={form.probability}
                        onChange={field('probability')}
                        className={errors.probability ? inpErr : inp}
                        placeholder="70"
                      />
                      {errors.probability && <p className="mt-1 text-xs text-red-500">{errors.probability}</p>}
                    </div>
                  </div>

                  {/* ── Fecha de cierre esperada ── */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Fecha esperada de cierre
                    </label>
                    <input
                      type="date"
                      value={form.expectedClose}
                      onChange={field('expectedClose')}
                      className={inp}
                    />
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-700" />

                  {/* ── Vendedor + Sucursal ── */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Vendedor asignado
                      </label>
                      <select value={form.assignedTo} onChange={field('assignedTo')} className={inp}>
                        <option value="">Sin asignar</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Sucursal
                      </label>
                      <select value={form.branchId} onChange={field('branchId')} className={inp}>
                        <option value="">Sin sucursal</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>

            {apiError && (
              <div className="mx-6 mb-4 mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-600 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {apiError}
              </div>
            )}
          </form>

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
              form="deal-form"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {submitting
                ? 'Guardando…'
                : mode === 'create' ? 'Crear deal' : 'Mover deal'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
