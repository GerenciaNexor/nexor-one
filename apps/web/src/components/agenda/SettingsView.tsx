'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { ServiceFormModal } from './ServiceFormModal'
import type { ServiceType } from './ServiceFormModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Availability {
  id:        string
  branchId:  string | null
  userId:    string | null
  dayOfWeek: number
  startTime: string
  endTime:   string
  isActive:  boolean
  dayName:   string
  branch:    { id: string; name: string } | null
  user:      { id: string; name: string } | null
}

interface BlockedDate {
  id:       string
  date:     string
  reason:   string | null
  branchId: string | null
  branch:   { id: string; name: string } | null
}

interface Branch { id: string; name: string }

// ─── Day-of-week order: Monday first ──────────────────────────────────────────

const WEEK_DAYS = [
  { day: 1, name: 'Lunes' },
  { day: 2, name: 'Martes' },
  { day: 3, name: 'Miércoles' },
  { day: 4, name: 'Jueves' },
  { day: 5, name: 'Viernes' },
  { day: 6, name: 'Sábado' },
  { day: 0, name: 'Domingo' },
] as const

// ─── SettingsView ─────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['TENANT_ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER']

export function SettingsView() {
  const router = useRouter()
  const user     = useAuthStore((s) => s.user)
  const canWrite = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN' || user?.role === 'AREA_MANAGER'

  useEffect(() => {
    if (user && !ALLOWED_ROLES.includes(user.role)) {
      router.replace('/agenda/calendar')
    }
  }, [user, router])

  // ── Services state ──────────────────────────────────────────────────────────
  const [services,       setServices]       = useState<ServiceType[]>([])
  const [servicesLoad,   setServicesLoad]   = useState(true)
  const [serviceModal,   setServiceModal]   = useState<'closed' | 'create' | 'edit'>('closed')
  const [editingService, setEditingService] = useState<ServiceType | null>(null)

  // ── Availability + blocked dates state ─────────────────────────────────────
  const [branches,        setBranches]        = useState<Branch[]>([])
  const [selectedBranch,  setSelectedBranch]  = useState('')
  const [availability,    setAvailability]    = useState<Availability[]>([])
  const [blockedDates,    setBlockedDates]    = useState<BlockedDate[]>([])
  const [availLoad,       setAvailLoad]       = useState(true)

  // ── Add-block inline form state ─────────────────────────────────────────────
  const [addingDay,  setAddingDay]  = useState<number | null>(null)
  const [newStart,   setNewStart]   = useState('08:00')
  const [newEnd,     setNewEnd]     = useState('17:00')
  const [blockSave,  setBlockSave]  = useState(false)

  // ── Blocked date form state ─────────────────────────────────────────────────
  const [bdDate,    setBdDate]    = useState('')
  const [bdReason,  setBdReason]  = useState('')
  const [bdBranch,  setBdBranch]  = useState(selectedBranch)
  const [bdSaving,  setBdSaving]  = useState(false)
  const [bdError,   setBdError]   = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)

  // ── Fetch services ───────────────────────────────────────────────────────────
  function fetchServices() {
    setServicesLoad(true)
    apiClient.get<{ data: ServiceType[] }>('/v1/agenda/services')
      .then((res) => setServices(res.data ?? []))
      .catch(() => {})
      .finally(() => setServicesLoad(false))
  }

  useEffect(() => { fetchServices() }, [])

  // ── Fetch branches ───────────────────────────────────────────────────────────
  useEffect(() => {
    apiClient.get<{ data: Branch[] }>('/v1/branches')
      .then((res) => setBranches(res.data ?? []))
      .catch(() => {})
  }, [])

  // ── Fetch availability (re-runs on branch change) ───────────────────────────
  function fetchAvailability() {
    setAvailLoad(true)
    const qs = selectedBranch ? `?branchId=${selectedBranch}` : ''
    apiClient.get<{ data: Availability[] }>(`/v1/agenda/availability${qs}`)
      .then((res) => setAvailability(res.data ?? []))
      .catch(() => {})
      .finally(() => setAvailLoad(false))
  }

  useEffect(() => { fetchAvailability() }, [selectedBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch blocked dates ──────────────────────────────────────────────────────
  function fetchBlockedDates() {
    const qs = selectedBranch ? `?branchId=${selectedBranch}` : ''
    apiClient.get<{ data: BlockedDate[] }>(`/v1/agenda/blocked-dates${qs}`)
      .then((res) => setBlockedDates(res.data ?? []))
      .catch(() => {})
  }

  useEffect(() => { fetchBlockedDates() }, [selectedBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Service handlers ─────────────────────────────────────────────────────────

  function handleServiceSaved(saved: ServiceType) {
    setServices((prev) => {
      const idx = prev.findIndex((s) => s.id === saved.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
      return [saved, ...prev]
    })
    setServiceModal('closed')
    setEditingService(null)
  }

  async function toggleServiceActive(s: ServiceType) {
    setActionError(null)
    try {
      const updated = await apiClient.put<ServiceType>(`/v1/agenda/services/${s.id}`, {
        isActive: !s.isActive,
      })
      setServices((prev) => prev.map((x) => x.id === updated.id ? updated : x))
    } catch (err: unknown) {
      const e = err as { message?: string }
      setActionError(e.message ?? 'Error al cambiar estado')
    }
  }

  // ── Availability handlers ───────────────────────────────────────────────────

  async function addBlock() {
    if (addingDay === null) return
    setBlockSave(true)
    setActionError(null)
    try {
      const body: Record<string, unknown> = {
        dayOfWeek: addingDay,
        startTime: newStart,
        endTime:   newEnd,
      }
      if (selectedBranch) body.branchId = selectedBranch
      const row = await apiClient.post<Availability>('/v1/agenda/availability', body)
      setAvailability((prev) => [...prev, row])
      setAddingDay(null)
      setNewStart('08:00')
      setNewEnd('17:00')
    } catch (err: unknown) {
      const e = err as { message?: string }
      setActionError(e.message ?? 'Error al crear bloque')
    } finally {
      setBlockSave(false)
    }
  }

  async function deleteBlock(id: string) {
    setActionError(null)
    try {
      await apiClient.delete(`/v1/agenda/availability/${id}`)
      setAvailability((prev) => prev.filter((a) => a.id !== id))
    } catch (err: unknown) {
      const e = err as { message?: string }
      setActionError(e.message ?? 'Error al eliminar bloque')
    }
  }

  async function toggleBlock(id: string, isActive: boolean) {
    setActionError(null)
    try {
      const updated = await apiClient.put<Availability>(`/v1/agenda/availability/${id}`, { isActive })
      setAvailability((prev) => prev.map((a) => a.id === updated.id ? updated : a))
    } catch (err: unknown) {
      const e = err as { message?: string }
      setActionError(e.message ?? 'Error al actualizar bloque')
    }
  }

  // ── Blocked dates handlers ───────────────────────────────────────────────────

  async function addBlockedDate(e: React.FormEvent) {
    e.preventDefault()
    if (!bdDate) return
    setBdSaving(true)
    setBdError(null)
    try {
      const body: Record<string, unknown> = { date: bdDate }
      if (bdReason.trim()) body.reason   = bdReason.trim()
      if (bdBranch)        body.branchId = bdBranch
      const row = await apiClient.post<BlockedDate>('/v1/agenda/blocked-dates', body)
      setBlockedDates((prev) => [...prev, row].sort((a, b) => a.date.localeCompare(b.date)))
      setBdDate('')
      setBdReason('')
    } catch (err: unknown) {
      const e = err as { message?: string }
      setBdError(e.message ?? 'Error al bloquear fecha')
    } finally {
      setBdSaving(false)
    }
  }

  async function deleteBlockedDate(id: string) {
    setActionError(null)
    try {
      await apiClient.delete(`/v1/agenda/blocked-dates/${id}`)
      setBlockedDates((prev) => prev.filter((bd) => bd.id !== id))
    } catch (err: unknown) {
      const e = err as { message?: string }
      setActionError(e.message ?? 'Error al eliminar fecha bloqueada')
    }
  }

  const inputCls =
    'rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white'

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-5xl space-y-10 p-6">

      {/* Global error */}
      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {actionError}
        </div>
      )}

      {/* ── Sección 1: Servicios ──────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Servicios</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {servicesLoad ? 'Cargando…' : `${services.length} servicio${services.length !== 1 ? 's' : ''} configurados`}
            </p>
          </div>
          {canWrite && (
            <button
              onClick={() => { setEditingService(null); setServiceModal('create') }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <span className="text-base leading-none">+</span>
              Nuevo servicio
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          {servicesLoad ? (
            <div className="flex h-24 items-center justify-center">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : services.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No hay servicios configurados.{canWrite && ' Crea el primero.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/50">
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Duración</th>
                    <th className="px-4 py-3">Precio</th>
                    <th className="px-4 py-3">Profesionales</th>
                    <th className="px-4 py-3">Sucursal</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    {canWrite && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {services.map((s) => (
                    <tr
                      key={s.id}
                      className={[
                        'transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30',
                        !s.isActive ? 'opacity-50' : '',
                      ].join(' ')}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {s.color && (
                            <span
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{ background: s.color }}
                            />
                          )}
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">{s.name}</p>
                            {s.description && (
                              <p className="max-w-xs truncate text-xs text-slate-400">{s.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {s.durationMinutes} min
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {s.price != null
                          ? `$${Number(s.price).toLocaleString('es')}`
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {s.professionals.length > 0
                          ? s.professionals.map((p) => p.name).join(', ')
                          : <span className="text-slate-300">Cualquiera</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {s.branch?.name ?? <span className="text-slate-400 italic">Global</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.isActive ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />Inactivo
                          </span>
                        )}
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => { setEditingService(s); setServiceModal('edit') }}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => toggleServiceActive(s)}
                              className={`text-xs hover:underline ${s.isActive ? 'text-amber-600' : 'text-emerald-600'}`}
                            >
                              {s.isActive ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Sección 2: Disponibilidad ─────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Disponibilidad por sucursal
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Horarios de atención por día de la semana
            </p>
          </div>
          {branches.length > 0 && (
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className={inputCls}
            >
              <option value="">Todas las sucursales</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </div>

        {/* Weekly grid */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          {availLoad ? (
            <div className="flex h-24 items-center justify-center">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : (
            WEEK_DAYS.map(({ day, name }, idx) => {
              const dayBlocks = availability.filter((a) => a.dayOfWeek === day)
              const isLast    = idx === WEEK_DAYS.length - 1
              const hasActive = dayBlocks.some((b) => b.isActive)

              return (
                <div
                  key={day}
                  className={[
                    'flex flex-wrap items-start gap-3 px-4 py-3',
                    !isLast ? 'border-b border-slate-100 dark:border-slate-700' : '',
                  ].join(' ')}
                >
                  {/* Day label */}
                  <div className="w-24 shrink-0 pt-1">
                    <span className={`text-sm font-medium ${hasActive ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>
                      {name}
                    </span>
                    {dayBlocks.length === 0 && (
                      <span className="block text-xs text-slate-400">Sin horario</span>
                    )}
                  </div>

                  {/* Blocks + add button */}
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    {dayBlocks.map((block) => (
                      <div
                        key={block.id}
                        className={[
                          'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs',
                          block.isActive
                            ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-700/30',
                        ].join(' ')}
                      >
                        <span className="font-medium tabular-nums">
                          {block.startTime} – {block.endTime}
                        </span>
                        {canWrite && (
                          <>
                            <button
                              onClick={() => toggleBlock(block.id, !block.isActive)}
                              className="opacity-50 hover:opacity-100 transition-opacity"
                              title={block.isActive ? 'Desactivar bloque' : 'Activar bloque'}
                            >
                              {block.isActive ? '●' : '○'}
                            </button>
                            <button
                              onClick={() => deleteBlock(block.id)}
                              className="text-red-400 opacity-50 hover:opacity-100 hover:text-red-600 transition-all"
                              title="Eliminar bloque"
                            >
                              ×
                            </button>
                          </>
                        )}
                      </div>
                    ))}

                    {/* Inline add form */}
                    {canWrite && addingDay === day ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <input
                          type="time"
                          value={newStart}
                          onChange={(e) => setNewStart(e.target.value)}
                          className={inputCls + ' w-28'}
                        />
                        <span className="text-slate-400">–</span>
                        <input
                          type="time"
                          value={newEnd}
                          onChange={(e) => setNewEnd(e.target.value)}
                          className={inputCls + ' w-28'}
                        />
                        <button
                          onClick={addBlock}
                          disabled={blockSave}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
                        >
                          {blockSave ? '…' : 'Guardar'}
                        </button>
                        <button
                          onClick={() => setAddingDay(null)}
                          className="text-xs text-slate-400 hover:text-slate-600"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : canWrite ? (
                      <button
                        onClick={() => setAddingDay(day)}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-slate-300 text-sm text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors dark:border-slate-600"
                        title="Agregar bloque de horario"
                      >
                        +
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Blocked dates */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Fechas bloqueadas
          </h3>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Festivos o cierres especiales — no afectan citas ya agendadas.
          </p>

          {/* Add form */}
          {canWrite && (
            <form
              onSubmit={addBlockedDate}
              className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Fecha *
                </label>
                <input
                  type="date"
                  value={bdDate}
                  onChange={(e) => setBdDate(e.target.value)}
                  required
                  min={new Date().toLocaleDateString('en-CA')}
                  className={inputCls}
                />
              </div>
              <div className="min-w-40 flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Motivo (opcional)
                </label>
                <input
                  type="text"
                  value={bdReason}
                  onChange={(e) => setBdReason(e.target.value)}
                  placeholder="Ej. Festivo nacional"
                  maxLength={255}
                  className={inputCls + ' w-full'}
                />
              </div>
              {branches.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Sucursal
                  </label>
                  <select
                    value={bdBranch}
                    onChange={(e) => setBdBranch(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Todas las sucursales</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                {bdError && <p className="mb-1 text-xs text-red-500">{bdError}</p>}
                <button
                  type="submit"
                  disabled={bdSaving || !bdDate}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60 transition-colors"
                >
                  {bdSaving ? 'Guardando…' : 'Bloquear fecha'}
                </button>
              </div>
            </form>
          )}

          {/* List */}
          {blockedDates.length === 0 ? (
            <p className="text-sm italic text-slate-400">Sin fechas bloqueadas próximas</p>
          ) : (
            <div className="space-y-2">
              {blockedDates.map((bd) => (
                <div
                  key={bd.id}
                  className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5 dark:border-amber-900/40 dark:bg-amber-900/10"
                >
                  <div>
                    <p className="text-sm font-medium capitalize text-amber-800 dark:text-amber-300">
                      {fmtDate(bd.date)}
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {bd.reason && `${bd.reason} · `}
                      {bd.branch ? bd.branch.name : 'Todas las sucursales'}
                    </p>
                  </div>
                  {canWrite && (
                    <button
                      onClick={() => deleteBlockedDate(bd.id)}
                      className="ml-4 shrink-0 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors dark:hover:bg-red-900/20"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Service modal ─────────────────────────────────────────────────── */}
      {serviceModal !== 'closed' && (
        <ServiceFormModal
          mode={serviceModal}
          service={editingService ?? undefined}
          branches={branches}
          onClose={() => { setServiceModal('closed'); setEditingService(null) }}
          onSuccess={handleServiceSaved}
        />
      )}
    </div>
  )
}
