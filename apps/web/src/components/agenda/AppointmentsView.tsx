'use client'

import { useState, useEffect, useMemo } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { AppointmentDetailModal } from './AppointmentDetailModal'
import { AppointmentFormModal } from './AppointmentFormModal'
import type { Appointment } from './CalendarView'

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

interface Branch { id: string; name: string }

export function AppointmentsView() {
  const user      = useAuthStore((s) => s.user)
  const isManager = user?.role !== 'OPERATIVE'

  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [branches,     setBranches]     = useState<Branch[]>([])
  const [loading,      setLoading]      = useState(true)
  const [detail,       setDetail]       = useState<Appointment | null>(null)
  const [creating,     setCreating]     = useState(false)

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search,          setSearch]          = useState('')
  const [filterStatus,    setFilterStatus]    = useState('')
  const [filterBranch,    setFilterBranch]    = useState('')
  const [filterDateFrom,  setFilterDateFrom]  = useState('')
  const [filterDateTo,    setFilterDateTo]    = useState('')

  // ── Load branches ──────────────────────────────────────────────────────────
  useEffect(() => {
    apiClient.get<{ data: Branch[] }>('/v1/branches')
      .then((res) => setBranches(res.data ?? []))
      .catch(() => {})
  }, [])

  // ── Fetch appointments (server-side: status + branchId) ───────────────────
  function fetchAppointments() {
    setLoading(true)
    const qs = new URLSearchParams()
    if (filterStatus) qs.set('status', filterStatus)
    if (filterBranch) qs.set('branchId', filterBranch)
    apiClient.get<{ data: Appointment[]; total: number }>(`/v1/agenda/appointments?${qs}`)
      .then((res) => setAppointments(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAppointments() }, [filterStatus, filterBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Client-side filters ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = appointments
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((a) => a.clientName.toLowerCase().includes(q))
    }
    if (filterDateFrom) {
      list = list.filter((a) => a.startAt.slice(0, 10) >= filterDateFrom)
    }
    if (filterDateTo) {
      list = list.filter((a) => a.startAt.slice(0, 10) <= filterDateTo)
    }
    return list.slice().sort((a, b) => b.startAt.localeCompare(a.startAt))
  }, [appointments, search, filterDateFrom, filterDateTo])

  const hasFilters = !!(search || filterStatus || filterBranch || filterDateFrom || filterDateTo)

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleUpdated(updated: Appointment) {
    setAppointments((prev) => prev.map((a) => a.id === updated.id ? updated : a))
    setDetail(updated)
  }

  function handleRescheduled(oldId: string, newAppt: Appointment) {
    setAppointments((prev) => [
      newAppt,
      ...prev.map((a) => a.id === oldId ? { ...a, status: 'cancelled' as Appointment['status'] } : a),
    ])
    setDetail(null)
  }

  function handleCreated(appt: Appointment) {
    setAppointments((prev) => [appt, ...prev])
    setCreating(false)
  }

  function clearFilters() {
    setSearch('')
    setFilterStatus('')
    setFilterBranch('')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  const inputCls =
    'rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white'

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Citas</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {loading
              ? 'Cargando…'
              : `${filtered.length} cita${filtered.length !== 1 ? 's' : ''}${hasFilters ? ' (filtradas)' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <span className="text-base leading-none">+</span>
          Nueva cita
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="min-w-48 flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Buscar cliente
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre del cliente…"
            className={inputCls + ' w-full'}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Estado</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {isManager && branches.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Sucursal</label>
            <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={inputCls}>
              <option value="">Todas</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Desde</label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Hasta</label>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className={inputCls}
          />
        </div>

        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            {hasFilters ? 'Ninguna cita coincide con los filtros.' : 'No hay citas registradas.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/50">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Servicio</th>
                  <th className="px-4 py-3">Profesional</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Hora</th>
                  {isManager && <th className="px-4 py-3">Sucursal</th>}
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((a) => {
                  const start = new Date(a.startAt)
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setDetail(a)}
                      className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-900 dark:text-white">
                            {a.clientName}
                          </span>
                          {a.createdByAgent && (
                            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                              IA
                            </span>
                          )}
                        </div>
                        {a.clientPhone && (
                          <p className="text-xs text-slate-400">{a.clientPhone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {a.serviceType.name}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {a.professional?.name ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-400">
                        {start.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-400">
                        {start.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      {isManager && (
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                          {a.branch.name}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[a.status] ?? STATUS_BADGE.confirmed}`}>
                          {STATUS_LABELS[a.status] ?? a.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detail && (
        <AppointmentDetailModal
          appointment={detail}
          branches={branches}
          onClose={() => setDetail(null)}
          onUpdated={handleUpdated}
          onRescheduled={handleRescheduled}
        />
      )}

      {/* Create modal */}
      {creating && (
        <AppointmentFormModal
          branches={branches}
          onClose={() => setCreating(false)}
          onSuccess={handleCreated}
        />
      )}
    </div>
  )
}
