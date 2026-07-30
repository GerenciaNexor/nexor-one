'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'

export interface Reminder {
  id:          string
  title:       string
  description: string | null
  remindAt:    string
  alertLevel:  'normal' | 'urgent' | 'critical'
  recurrence:  'none' | 'hourly' | 'daily' | 'weekly' | 'monthly'
  relatedType: 'appointment' | 'client' | 'deal' | 'purchase_order' | null
  relatedId:   string | null
  isActive:    boolean
  lastFiredAt: string | null
  createdAt:   string
}

const ALERTS: { value: Reminder['alertLevel']; label: string; cls: string; on: string }[] = [
  { value: 'normal',   label: 'Normal',   cls: 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300', on: 'border-slate-500 bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100' },
  { value: 'urgent',   label: 'Urgente',  cls: 'border-amber-300 text-amber-600 dark:border-amber-600 dark:text-amber-400', on: 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' },
  { value: 'critical', label: 'Crítico',  cls: 'border-red-300 text-red-600 dark:border-red-600 dark:text-red-400',       on: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' },
]

const RECURRENCES: { value: Reminder['recurrence']; label: string }[] = [
  { value: 'none',    label: 'Una vez (fecha específica)' },
  { value: 'hourly',  label: 'Cada hora' },
  { value: 'daily',   label: 'Cada día' },
  { value: 'weekly',  label: 'Cada semana' },
  { value: 'monthly', label: 'Cada mes' },
]

const RELATED: { value: '' | NonNullable<Reminder['relatedType']>; label: string }[] = [
  { value: '',               label: 'Libre (sin asociar)' },
  { value: 'appointment',    label: 'Una cita' },
  { value: 'client',         label: 'Un cliente' },
  { value: 'deal',           label: 'Una venta / negocio' },
  { value: 'purchase_order', label: 'Una compra' },
]

// ISO → valor para <input type="datetime-local"> (hora local).
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const off = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}
// Valor por defecto = ahora mismo (hora local del navegador), sin sumar horas.
function defaultWhen(): string {
  const off = new Date().getTimezoneOffset() * 60_000
  return new Date(Date.now() - off).toISOString().slice(0, 16)
}

export function ReminderFormModal({ reminder, onClose, onSaved }: {
  reminder?: Reminder | null
  onClose:   () => void
  onSaved:   () => void
}) {
  const isEdit = !!reminder
  const [title, setTitle]       = useState(reminder?.title ?? '')
  const [description, setDesc]  = useState(reminder?.description ?? '')
  const [remindAt, setRemindAt] = useState(reminder ? toLocalInput(reminder.remindAt) : defaultWhen())
  const [alertLevel, setAlert]  = useState<Reminder['alertLevel']>(reminder?.alertLevel ?? 'normal')
  const [recurrence, setRecur]  = useState<Reminder['recurrence']>(reminder?.recurrence ?? 'none')
  const [relatedType, setRel]   = useState<'' | NonNullable<Reminder['relatedType']>>(reminder?.relatedType ?? '')

  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  async function submit() {
    setErr(null)
    if (!title.trim()) { setErr('El título es obligatorio.'); return }
    if (!remindAt)     { setErr('La fecha y hora son obligatorias.'); return }
    // datetime-local (hora local del navegador) → instante absoluto ISO, para que el
    // servidor no reinterprete la hora según SU zona horaria.
    const when = new Date(remindAt)
    if (isNaN(when.getTime())) { setErr('La fecha y hora no son válidas.'); return }
    setSaving(true)
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      remindAt: when.toISOString(),
      alertLevel,
      recurrence,
      relatedType: relatedType || null,
    }
    try {
      if (isEdit) await apiClient.put(`/v1/reminders/${reminder!.id}`, body)
      else        await apiClient.post('/v1/reminders', body)
      onSaved()
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo guardar el recordatorio.')
    } finally { setSaving(false) }
  }

  const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{isEdit ? 'Editar recordatorio' : 'Nuevo recordatorio'}</h3>
          <p className="mt-0.5 text-xs text-slate-500">Para cualquier cosa: una tarea, un cliente, una venta, una compra…</p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Título *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inp} placeholder="Ej: Llamar a Juan, devolver la herramienta…" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Fecha y hora *</label>
              <input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className={inp} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Nivel de alerta</label>
              <div className="flex gap-2">
                {ALERTS.map((a) => (
                  <button key={a.value} type="button" onClick={() => setAlert(a.value)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${alertLevel === a.value ? a.on : a.cls}`}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Recurrencia</label>
                <select value={recurrence} onChange={(e) => setRecur(e.target.value as Reminder['recurrence'])} className={inp}>
                  {RECURRENCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Relacionado con</label>
                <select value={relatedType} onChange={(e) => setRel(e.target.value as typeof relatedType)} className={inp}>
                  {RELATED.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Nota (opcional)</label>
              <textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={2} className={`${inp} resize-none`} placeholder="Detalle del recordatorio…" />
            </div>

            {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
            <button onClick={submit} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear recordatorio'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
