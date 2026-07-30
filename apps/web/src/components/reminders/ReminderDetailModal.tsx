'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'
import type { Reminder } from './ReminderFormModal'
import { ALERT_LABEL, ALERT_STYLE, RECUR_LABEL, RELATED_LABEL, fmtWhen } from './labels'

/**
 * HU-157 — Detalle de un recordatorio con acciones: Editar, Marcar como hecho,
 * Finalizar serie (recurrentes) y Eliminar (solo si ya está hecho — regla de finalización).
 */
export function ReminderDetailModal({ reminder, onEdit, onClose, onChanged }: {
  reminder: Reminder
  onEdit:   () => void
  onClose:  () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr]   = useState<string | null>(null)

  const isRecurring = reminder.recurrence !== 'none'
  const isDone      = reminder.status === 'done'
  const a           = ALERT_STYLE[reminder.alertLevel]

  async function act(kind: 'done' | 'series' | 'delete') {
    setErr(null); setBusy(kind)
    try {
      if (kind === 'delete')      await apiClient.delete(`/v1/reminders/${reminder.id}`)
      else                        await apiClient.post(`/v1/reminders/${reminder.id}/complete`, kind === 'series' ? { series: true } : {})
      onChanged()
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo completar la acción.')
    } finally { setBusy(null) }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.dot}`} />
                <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{reminder.title}</h3>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{fmtWhen(reminder.remindAt)}</p>
            </div>
            {isDone
              ? <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">✓ Hecho</span>
              : <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">Pendiente</span>}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${a.badge}`}>Alerta: {ALERT_LABEL[reminder.alertLevel]}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">{RECUR_LABEL[reminder.recurrence]}</span>
            {reminder.relatedType && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">Sobre: {RELATED_LABEL[reminder.relatedType]}</span>}
          </div>

          {reminder.description && (
            <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{reminder.description}</p>
          )}

          {err && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{err}</p>}

          <div className="mt-5 space-y-2">
            {!isDone && (
              <>
                <button onClick={() => act('done')} disabled={!!busy}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {busy === 'done' ? 'Guardando…' : isRecurring ? 'Marcar hecho (esta vez)' : 'Marcar como hecho'}
                </button>
                {isRecurring && (
                  <button onClick={() => act('series')} disabled={!!busy}
                    className="w-full rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/20">
                    {busy === 'series' ? 'Guardando…' : 'Finalizar serie (no repetir más)'}
                  </button>
                )}
                <button onClick={onEdit} disabled={!!busy}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                  Editar
                </button>
                <p className="pt-1 text-center text-[11px] text-slate-400">Para eliminarlo, primero márcalo como hecho.</p>
              </>
            )}
            {isDone && (
              <button onClick={() => act('delete')} disabled={!!busy}
                className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {busy === 'delete' ? 'Eliminando…' : 'Eliminar recordatorio'}
              </button>
            )}
            <button onClick={onClose} disabled={!!busy}
              className="w-full rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
