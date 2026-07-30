'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { ReminderFormModal, type Reminder } from './ReminderFormModal'
import { ReminderDetailModal } from './ReminderDetailModal'
import { ALERT_STYLE, RECUR_LABEL, fmtWhen } from './labels'

/**
 * HU-156/157 — Panel de recordatorios reutilizable.
 * Mismo modal/endpoint desde Inicio (`variant="compact"`) y Agenda (`variant="full"`);
 * no se duplica lógica. Al hacer clic en un recordatorio se abre el detalle (editar / hecho / eliminar).
 */
export function RemindersPanel({ variant = 'compact' }: { variant?: 'compact' | 'full' }) {
  const full = variant === 'full'
  const [items, setItems] = useState<Reminder[] | null>(null)
  const [form, setForm]     = useState<{ open: boolean; edit: Reminder | null }>({ open: false, edit: null })
  const [detail, setDetail] = useState<Reminder | null>(null)

  function load() {
    // Inicio: solo pendientes (lo accionable). Agenda: todos (para gestionar y eliminar los hechos).
    const q = full ? '' : '?status=pending'
    apiClient.get<{ data: Reminder[] }>(`/v1/reminders${q}`)
      .then((r) => setItems(r.data)).catch(() => setItems([]))
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pending = (items ?? []).filter((r) => r.status === 'pending')
  const done    = (items ?? []).filter((r) => r.status === 'done')

  function Row({ r }: { r: Reminder }) {
    const a = ALERT_STYLE[r.alertLevel] ?? ALERT_STYLE.normal
    const isDone = r.status === 'done'
    return (
      <li>
        <button
          onClick={() => setDetail(r)}
          className={`flex w-full items-start gap-2 rounded-lg border border-l-4 ${a.border} border-slate-100 bg-slate-50/60 p-2.5 text-left transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-700/60`}
        >
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${isDone ? 'bg-emerald-500' : a.dot}`} />
          <div className="min-w-0 flex-1">
            <p className={`truncate text-xs font-semibold ${isDone ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>{r.title}</p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {fmtWhen(r.remindAt)}{r.recurrence !== 'none' ? ` · ${RECUR_LABEL[r.recurrence]}` : ''}
            </p>
          </div>
          {isDone && <span className="mt-0.5 shrink-0 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">✓</span>}
        </button>
      </li>
    )
  }

  const body = items === null ? (
    <ul className="space-y-2">{[0, 1].map((i) => <li key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}</ul>
  ) : pending.length === 0 && done.length === 0 ? (
    <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400 dark:border-slate-700">
      No tienes recordatorios. Crea el primero para no olvidar tus pendientes.
    </p>
  ) : (
    <div className="space-y-4">
      {pending.length > 0 && <ul className="space-y-2">{pending.map((r) => <Row key={r.id} r={r} />)}</ul>}
      {full && done.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hechos</p>
          <ul className="space-y-2">{done.map((r) => <Row key={r.id} r={r} />)}</ul>
        </div>
      )}
    </div>
  )

  const inner = (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className={full ? 'text-lg font-semibold text-slate-800 dark:text-slate-100' : 'text-sm font-semibold text-slate-700 dark:text-slate-200'}>Recordatorios</h2>
        <button onClick={() => setForm({ open: true, edit: null })}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">+ Nuevo</button>
      </div>
      {body}

      {form.open && (
        <ReminderFormModal
          reminder={form.edit}
          onClose={() => setForm({ open: false, edit: null })}
          onSaved={() => { setForm({ open: false, edit: null }); load() }}
        />
      )}
      {detail && (
        <ReminderDetailModal
          reminder={detail}
          onEdit={() => { setForm({ open: true, edit: detail }); setDetail(null) }}
          onClose={() => setDetail(null)}
          onChanged={() => { setDetail(null); load() }}
        />
      )}
    </>
  )

  if (full) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">{inner}</div>
  }
  return <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">{inner}</div>
}
