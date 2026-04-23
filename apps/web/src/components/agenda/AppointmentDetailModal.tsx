'use client'

import { useState } from 'react'
import { Portal } from '@/components/ui/Portal'
import { apiClient } from '@/lib/api-client'
import { AppointmentFormModal } from './AppointmentFormModal'
import type { Appointment } from './CalendarView'

interface Branch { id: string; name: string }

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmada',
  scheduled: 'Programada',
  pending:   'Pendiente',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show:   'No asistió',
}

const STATUS_BADGE: Record<string, string> = {
  confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  scheduled: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  pending:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  no_show:   'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
}

interface Props {
  appointment:   Appointment
  branches?:     Branch[]
  onClose:       () => void
  onUpdated:     (a: Appointment) => void
  onRescheduled?: (oldId: string, newAppt: Appointment) => void
}

export function AppointmentDetailModal({ appointment, branches = [], onClose, onUpdated, onRescheduled }: Props) {
  const [loading,      setLoading]      = useState<string | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [rescheduling, setRescheduling] = useState(false)

  const start = new Date(appointment.startAt)
  const end   = new Date(appointment.endAt)

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

  async function changeStatus(newStatus: string) {
    setLoading(newStatus)
    setError(null)
    try {
      await apiClient.put<{ id: string; status: string }>(
        `/v1/agenda/appointments/${appointment.id}/status`,
        { status: newStatus },
      )
      onUpdated({ ...appointment, status: newStatus as Appointment['status'] })
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e.message ?? 'Error al actualizar el estado')
    } finally {
      setLoading(null)
    }
  }

  const isTerminal = ['cancelled', 'no_show', 'completed'].includes(appointment.status)

  async function handleRescheduleSuccess(newAppt: Appointment) {
    try {
      await apiClient.put(`/v1/agenda/appointments/${appointment.id}/status`, { status: 'cancelled' })
    } catch {
      // best-effort cancel
    }
    onRescheduled?.(appointment.id, newAppt)
    onClose()
  }

  if (rescheduling) {
    return (
      <AppointmentFormModal
        initialBranchId={appointment.branchId}
        branches={branches}
        onClose={() => setRescheduling(false)}
        onSuccess={handleRescheduleSuccess}
      />
    )
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-800 dark:ring-slate-700">

          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Detalle de cita</h2>
              {appointment.createdByAgent && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  IA
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors dark:hover:bg-slate-700"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="13" y2="13" /><line x1="13" y1="1" x2="1" y2="13" />
              </svg>
            </button>
          </div>

          <div className="space-y-4 px-6 py-4">
            {/* Status badge */}
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[appointment.status] ?? STATUS_BADGE.confirmed}`}>
              {STATUS_LABELS[appointment.status] ?? appointment.status}
            </span>

            {/* Client */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Cliente</p>
              <p className="mt-0.5 font-medium text-slate-900 dark:text-white">{appointment.clientName}</p>
              {appointment.clientPhone && <p className="text-sm text-slate-500 dark:text-slate-400">{appointment.clientPhone}</p>}
              {appointment.clientEmail && <p className="text-sm text-slate-500 dark:text-slate-400">{appointment.clientEmail}</p>}
            </div>

            {/* Service + professional */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Servicio</p>
                <p className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-300">{appointment.serviceType.name}</p>
                <p className="text-xs text-slate-400">{appointment.serviceType.durationMinutes} min</p>
              </div>
              {appointment.professional && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Profesional</p>
                  <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{appointment.professional.name}</p>
                </div>
              )}
            </div>

            {/* Date/time */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Fecha y hora</p>
              <p className="mt-0.5 text-sm font-medium capitalize text-slate-700 dark:text-slate-300">{fmtDate(start)}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{fmtTime(start)} – {fmtTime(end)}</p>
            </div>

            {/* Branch + channel */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Sucursal</p>
                <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{appointment.branch.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Canal</p>
                <p className="mt-0.5 text-sm capitalize text-slate-700 dark:text-slate-300">{appointment.channel}</p>
              </div>
            </div>

            {/* Notes */}
            {appointment.notes && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Notas</p>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{appointment.notes}</p>
              </div>
            )}

            {/* Error */}
            {error && <p className="text-xs text-red-500">{error}</p>}

            {/* Actions */}
            {!isTerminal && (
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                {(appointment.status === 'pending' || appointment.status === 'scheduled') && (
                  <button
                    onClick={() => changeStatus('confirmed')}
                    disabled={!!loading}
                    className="flex-1 rounded-lg bg-blue-600 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
                  >
                    {loading === 'confirmed' ? '…' : 'Confirmar'}
                  </button>
                )}
                {(appointment.status === 'confirmed' || appointment.status === 'scheduled') && (
                  <button
                    onClick={() => changeStatus('completed')}
                    disabled={!!loading}
                    className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                  >
                    {loading === 'completed' ? '…' : 'Completar'}
                  </button>
                )}
                {(appointment.status === 'confirmed' || appointment.status === 'scheduled') && (
                  <button
                    onClick={() => changeStatus('no_show')}
                    disabled={!!loading}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60 transition-colors dark:border-slate-600 dark:text-slate-400"
                  >
                    {loading === 'no_show' ? '…' : 'No asistió'}
                  </button>
                )}
                {branches.length > 0 && onRescheduled && (
                  <button
                    onClick={() => setRescheduling(true)}
                    disabled={!!loading}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60 transition-colors dark:border-slate-600 dark:text-slate-400"
                  >
                    Reagendar
                  </button>
                )}
                <button
                  onClick={() => changeStatus('cancelled')}
                  disabled={!!loading}
                  className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors dark:border-red-800 dark:text-red-400"
                >
                  {loading === 'cancelled' ? '…' : 'Cancelar'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  )
}
