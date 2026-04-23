'use client'

import { useState, useEffect } from 'react'
import { Portal } from '@/components/ui/Portal'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import type { Appointment } from './CalendarView'

interface Branch  { id: string; name: string }
interface Service { id: string; name: string; durationMinutes: number; price: number | null }
interface Slot    {
  startTime: string
  endTime:   string
  startAt:   string
  availableProfessionals?: Array<{ id: string; name: string }>
}

interface Props {
  initialDate?:     string
  initialTime?:     string
  initialBranchId?: string
  branches:         Branch[]
  onClose:          () => void
  onSuccess:        (a: Appointment) => void
}

export function AppointmentFormModal({
  initialDate,
  initialTime,
  initialBranchId,
  branches,
  onClose,
  onSuccess,
}: Props) {
  const user        = useAuthStore((s) => s.user)
  const isOperative = user?.role === 'OPERATIVE'
  const defaultBranch = initialBranchId || (isOperative ? (user?.branchId ?? '') : '')

  const [branchId,     setBranchId]     = useState(defaultBranch)
  const [serviceId,    setServiceId]    = useState('')
  const [date,         setDate]         = useState(initialDate ?? new Date().toLocaleDateString('en-CA'))
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [clientName,   setClientName]   = useState('')
  const [clientPhone,  setClientPhone]  = useState('')
  const [clientEmail,  setClientEmail]  = useState('')
  const [profId,       setProfId]       = useState('')
  const [notes,        setNotes]        = useState('')

  const [services,     setServices]     = useState<Service[]>([])
  const [slots,        setSlots]        = useState<Slot[] | null>(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError,   setSlotsError]   = useState<string | null>(null)
  const [submitting,   setSubmitting]   = useState(false)
  const [submitError,  setSubmitError]  = useState<string | null>(null)

  // Load services when branch changes
  useEffect(() => {
    if (!branchId) { setServices([]); return }
    apiClient.get<{ data: Service[] }>(`/v1/agenda/services?branchId=${branchId}`)
      .then((res) => setServices(res.data ?? []))
      .catch(() => {})
  }, [branchId])

  // Load slots when service + branch + date are ready
  useEffect(() => {
    if (!serviceId || !branchId || !date) { setSlots(null); return }
    setSlotsLoading(true)
    setSlotsError(null)
    setSelectedSlot(null)
    const qs = new URLSearchParams({ serviceId, branchId, date })
    if (profId) qs.set('professionalId', profId)
    apiClient.get<{ slots: Slot[] }>(`/v1/agenda/slots?${qs.toString()}`)
      .then((res) => setSlots(res.slots))
      .catch((e: unknown) => {
        const err = e as { message?: string }
        setSlotsError(err.message ?? 'Error al cargar horarios')
        setSlots([])
      })
      .finally(() => setSlotsLoading(false))
  }, [serviceId, branchId, date, profId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-select slot matching initialTime
  useEffect(() => {
    if (!slots || !initialTime || selectedSlot) return
    const match = slots.find((s) => s.startTime.startsWith(initialTime))
    if (match) setSelectedSlot(match)
  }, [slots]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedSlot)       { setSubmitError('Selecciona un horario disponible'); return }
    if (!clientName.trim())  { setSubmitError('El nombre del cliente es requerido'); return }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const body: Record<string, unknown> = {
        branchId,
        serviceTypeId: serviceId,
        startAt:       selectedSlot.startAt,
        clientName:    clientName.trim(),
        status:        'confirmed',
        channel:       'internal',
      }
      if (clientPhone.trim()) body.clientPhone    = clientPhone.trim()
      if (clientEmail.trim()) body.clientEmail    = clientEmail.trim()
      if (profId)             body.professionalId = profId
      if (notes.trim())       body.notes          = notes.trim()

      const appt = await apiClient.post<Appointment>('/v1/agenda/appointments', body)
      onSuccess(appt)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setSubmitError(e.message ?? 'Error al crear la cita')
    } finally {
      setSubmitting(false)
    }
  }

  const professionals = selectedSlot?.availableProfessionals ?? []

  const inputCls =
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white'

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-800 dark:ring-slate-700">

          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-700">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Nueva cita</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition-colors dark:hover:bg-slate-700"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="13" y2="13" /><line x1="13" y1="1" x2="1" y2="13" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-4">

              {/* Branch */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Sucursal</label>
                <select
                  value={branchId}
                  onChange={(e) => { setBranchId(e.target.value); setServiceId(''); setSlots(null) }}
                  required
                  disabled={isOperative}
                  className={inputCls + ' disabled:opacity-60'}
                >
                  <option value="">Seleccionar sucursal</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              {/* Service */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Servicio</label>
                <select
                  value={serviceId}
                  onChange={(e) => { setServiceId(e.target.value); setSelectedSlot(null) }}
                  required
                  className={inputCls}
                >
                  <option value="">Seleccionar servicio</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMinutes} min{s.price != null ? ` · $${Number(s.price).toLocaleString('es')}` : ''})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Fecha</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setSelectedSlot(null) }}
                  required
                  min={new Date().toLocaleDateString('en-CA')}
                  className={inputCls}
                />
              </div>

              {/* Available slots */}
              {serviceId && branchId && date && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Horario disponible
                  </label>
                  {slotsLoading ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                      Cargando horarios…
                    </div>
                  ) : slotsError ? (
                    <p className="text-xs text-red-500">{slotsError}</p>
                  ) : slots !== null && slots.length === 0 ? (
                    <p className="text-xs text-slate-400">No hay horarios disponibles para esta fecha.</p>
                  ) : slots ? (
                    <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-slate-100 p-2 dark:border-slate-700">
                      {slots.map((s) => (
                        <button
                          key={s.startAt}
                          type="button"
                          onClick={() => { setSelectedSlot(s); setProfId('') }}
                          className={[
                            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                            selectedSlot?.startAt === s.startAt
                              ? 'bg-blue-600 text-white'
                              : 'border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600 dark:border-slate-600 dark:text-slate-300',
                          ].join(' ')}
                        >
                          {s.startTime}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Professional (shown once a slot is selected and has professionals) */}
              {selectedSlot && professionals.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Profesional (opcional)
                  </label>
                  <select value={profId} onChange={(e) => setProfId(e.target.value)} className={inputCls}>
                    <option value="">Sin preferencia</option>
                    {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              {/* Client info */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Nombre del cliente *
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                    placeholder="Nombre completo"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="+57 300 000 0000"
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Email (envía confirmación)
                  </label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="cliente@email.com"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Notas adicionales
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Observaciones para el profesional…"
                  className={inputCls + ' resize-none'}
                />
              </div>

              {submitError && <p className="text-xs text-red-500">{submitError}</p>}
            </div>

            {/* Footer */}
            <div className="flex gap-3 border-t border-slate-100 px-6 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || !selectedSlot}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {submitting ? 'Agendando…' : 'Agendar cita'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}
