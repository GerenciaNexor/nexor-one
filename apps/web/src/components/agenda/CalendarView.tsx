'use client'

import { useState, useEffect, useMemo } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { AppointmentDetailModal } from './AppointmentDetailModal'
import { AppointmentFormModal } from './AppointmentFormModal'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Appointment {
  id:             string
  branchId:       string
  clientId:       string | null
  serviceTypeId:  string
  professionalId: string | null
  clientName:     string
  clientEmail:    string | null
  clientPhone:    string | null
  startAt:        string
  endAt:          string
  status:         'confirmed' | 'pending' | 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  notes:          string | null
  channel:        string
  createdByAgent: boolean
  branch:         { id: string; name: string }
  serviceType:    { id: string; name: string; durationMinutes: number }
  professional:   { id: string; name: string } | null
}

type ViewMode  = 'week' | 'day' | 'month'
interface Branch     { id: string; name: string }
interface CreateSlot { date: string; time: string; branchId: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const HOUR_PX    = 64
const GRID_START = 8
const GRID_END   = 21
const HOURS      = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i)
const DAYS_ABBR  = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
const MONTHS     = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                    'septiembre','octubre','noviembre','diciembre']

const STATUS_BLOCK: Record<string, string> = {
  confirmed: 'border-l-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  scheduled: 'border-l-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  pending:   'border-l-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  completed: 'border-l-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  cancelled: 'border-l-red-400 bg-red-50 text-red-700 opacity-60 dark:bg-red-900/20 dark:text-red-300',
  no_show:   'border-l-slate-400 bg-slate-100 text-slate-600 opacity-50 dark:bg-slate-700 dark:text-slate-400',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart(d: Date): Date {
  const r   = new Date(d)
  const dow = r.getDay()
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1))
  r.setHours(0, 0, 0, 0)
  return r
}

function getWeekDays(ws: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws)
    d.setDate(d.getDate() + i)
    return d
  })
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate()
}

function apptTopPx(startAt: string): number {
  const d = new Date(startAt)
  return Math.max(0, ((d.getHours() - GRID_START) * 60 + d.getMinutes()) * HOUR_PX / 60)
}

function apptHeightPx(startAt: string, endAt: string): number {
  const ms = new Date(endAt).getTime() - new Date(startAt).getTime()
  return Math.max((ms / 60000) * HOUR_PX / 60, 24)
}

function getMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1)
  const dow   = first.getDay()
  const start = new Date(first)
  start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1))
  const weeks: Date[][] = []
  const cur = new Date(start)
  for (let w = 0; w < 6; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

// ─── AppointmentBlock ─────────────────────────────────────────────────────────

function AppointmentBlock({ appt, onClick }: { appt: Appointment; onClick: () => void }) {
  const top    = apptTopPx(appt.startAt)
  const height = apptHeightPx(appt.startAt, appt.endAt)
  const style  = STATUS_BLOCK[appt.status] ?? STATUS_BLOCK.confirmed

  return (
    <div
      data-appointment="true"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`absolute left-0.5 right-0.5 cursor-pointer overflow-hidden rounded border-l-2 px-1 py-0.5 text-xs shadow-sm transition-all hover:brightness-95 ${style}`}
      style={{ top: `${top}px`, height: `${height}px`, minHeight: '24px' }}
    >
      <div className="truncate font-medium leading-tight">{appt.clientName}</div>
      {height > 34 && (
        <div className="truncate text-[10px] leading-tight opacity-75">{appt.serviceType.name}</div>
      )}
      {height > 50 && appt.professional && (
        <div className="truncate text-[10px] leading-tight opacity-75">{appt.professional.name}</div>
      )}
      {appt.createdByAgent && (
        <span className="absolute right-0.5 top-0.5 text-[9px] font-semibold opacity-60">IA</span>
      )}
    </div>
  )
}

// ─── DayColumn ────────────────────────────────────────────────────────────────

function DayColumn({
  day,
  appointments,
  isToday,
  onApptClick,
  onSlotClick,
}: {
  day:          Date
  appointments: Appointment[]
  isToday:      boolean
  onApptClick:  (a: Appointment) => void
  onSlotClick:  (date: string, time: string) => void
}) {
  const totalH = (GRID_END - GRID_START) * HOUR_PX
  const now    = new Date()
  const nowY   = isToday
    ? ((now.getHours() - GRID_START) * 60 + now.getMinutes()) * HOUR_PX / 60
    : -1

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('[data-appointment]')) return
    const y          = Math.max(0, e.clientY - e.currentTarget.getBoundingClientRect().top)
    const totalMin   = GRID_START * 60 + (y / HOUR_PX) * 60
    const snapped    = Math.round(totalMin / 15) * 15
    const h = Math.floor(snapped / 60)
    const m = snapped % 60
    if (h < GRID_START || h >= GRID_END) return
    onSlotClick(
      day.toLocaleDateString('en-CA'),
      `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    )
  }

  return (
    <div
      className="relative flex-1 cursor-pointer"
      style={{ height: `${totalH}px` }}
      onClick={handleClick}
    >
      {HOURS.map((h) => (
        <div
          key={h}
          className="absolute left-0 right-0 border-t border-slate-100 dark:border-slate-700"
          style={{ top: `${(h - GRID_START) * HOUR_PX}px` }}
        />
      ))}

      {/* Current time indicator */}
      {isToday && nowY >= 0 && nowY <= totalH && (
        <div
          className="absolute left-0 right-0 z-10 h-px bg-red-400"
          style={{ top: `${nowY}px` }}
        >
          <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-400" />
        </div>
      )}

      {appointments.map((a) => (
        <AppointmentBlock key={a.id} appt={a} onClick={() => onApptClick(a)} />
      ))}
    </div>
  )
}

// ─── WeekView ─────────────────────────────────────────────────────────────────

function WeekView({
  weekStart,
  appointments,
  onApptClick,
  onSlotClick,
}: {
  weekStart:    Date
  appointments: Appointment[]
  onApptClick:  (a: Appointment) => void
  onSlotClick:  (date: string, time: string) => void
}) {
  const today = new Date()
  const days  = getWeekDays(weekStart)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Day headers */}
      <div className="flex shrink-0 border-b border-slate-200 dark:border-slate-700">
        <div className="w-10 shrink-0" />
        {days.map((day, i) => {
          const isToday = isSameDay(day, today)
          return (
            <div key={i} className="flex-1 py-2 text-center">
              <div className="text-[11px] text-slate-400 dark:text-slate-500">{DAYS_ABBR[i]}</div>
              <div className={[
                'mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                isToday ? 'bg-blue-600 text-white' : 'text-slate-700 dark:text-slate-300',
              ].join(' ')}>
                {day.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="flex flex-1 overflow-y-auto">
        <div className="w-10 shrink-0">
          {HOURS.map((h) => (
            <div
              key={h}
              className="flex items-start justify-end pr-1 text-[9px] text-slate-400"
              style={{ height: `${HOUR_PX}px` }}
            >
              {fmtHour(h)}
            </div>
          ))}
        </div>
        {days.map((day, i) => (
          <DayColumn
            key={i}
            day={day}
            appointments={appointments.filter((a) => isSameDay(new Date(a.startAt), day))}
            isToday={isSameDay(day, today)}
            onApptClick={onApptClick}
            onSlotClick={onSlotClick}
          />
        ))}
      </div>
    </div>
  )
}

// ─── DayView ──────────────────────────────────────────────────────────────────

function DayView({
  day,
  appointments,
  onApptClick,
  onSlotClick,
}: {
  day:          Date
  appointments: Appointment[]
  onApptClick:  (a: Appointment) => void
  onSlotClick:  (date: string, time: string) => void
}) {
  const today = new Date()
  const label = day.toLocaleDateString('es', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-slate-200 px-3 py-2 text-sm font-medium capitalize text-slate-700 dark:border-slate-700 dark:text-slate-300">
        {label}
      </div>
      <div className="flex flex-1 overflow-y-auto">
        <div className="w-10 shrink-0">
          {HOURS.map((h) => (
            <div
              key={h}
              className="flex items-start justify-end pr-1 text-[9px] text-slate-400"
              style={{ height: `${HOUR_PX}px` }}
            >
              {fmtHour(h)}
            </div>
          ))}
        </div>
        <DayColumn
          day={day}
          appointments={appointments.filter((a) => isSameDay(new Date(a.startAt), day))}
          isToday={isSameDay(day, today)}
          onApptClick={onApptClick}
          onSlotClick={onSlotClick}
        />
      </div>
    </div>
  )
}

// ─── MonthView ────────────────────────────────────────────────────────────────

function MonthView({
  date,
  appointments,
  onApptClick,
  onDayClick,
}: {
  date:         Date
  appointments: Appointment[]
  onApptClick:  (a: Appointment) => void
  onDayClick:   (day: Date) => void
}) {
  const today = new Date()
  const grid  = getMonthGrid(date.getFullYear(), date.getMonth())

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Day headers */}
      <div className="grid shrink-0 grid-cols-7 border-b border-slate-200 dark:border-slate-700">
        {DAYS_ABBR.map((d) => (
          <div key={d} className="py-2 text-center text-[11px] font-medium text-slate-400">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="flex-1">
        {grid.map((week, wi) => (
          <div
            key={wi}
            className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-700/50"
            style={{ minHeight: '80px' }}
          >
            {week.map((day, di) => {
              const isCurMonth = day.getMonth() === date.getMonth()
              const isToday    = isSameDay(day, today)
              const dayAppts   = appointments.filter((a) => isSameDay(new Date(a.startAt), day))
              const shown      = dayAppts.slice(0, 3)
              const extra      = dayAppts.length - shown.length

              return (
                <div
                  key={di}
                  onClick={() => onDayClick(day)}
                  className={[
                    'cursor-pointer border-l border-slate-100 p-1 transition-colors hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-800/50',
                    !isCurMonth ? 'opacity-40' : '',
                  ].join(' ')}
                >
                  <div className={[
                    'mb-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium',
                    isToday ? 'bg-blue-600 text-white' : 'text-slate-700 dark:text-slate-300',
                  ].join(' ')}>
                    {day.getDate()}
                  </div>
                  {shown.map((a) => (
                    <div
                      key={a.id}
                      onClick={(e) => { e.stopPropagation(); onApptClick(a) }}
                      className={`mb-0.5 cursor-pointer truncate rounded border-l-2 px-1 text-[9px] font-medium leading-4 ${STATUS_BLOCK[a.status] ?? STATUS_BLOCK.confirmed}`}
                    >
                      {fmtTime(a.startAt)} {a.clientName}
                      {a.createdByAgent && ' ·IA'}
                    </div>
                  ))}
                  {extra > 0 && (
                    <div className="text-[9px] text-slate-400">+{extra} más</div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── CalendarView (main export) ───────────────────────────────────────────────

export function CalendarView() {
  const user      = useAuthStore((s) => s.user)
  const isManager = user?.role !== 'OPERATIVE'

  const [view,        setView]        = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [branches,    setBranches]    = useState<Branch[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [branchFilter, setBranchFilter] = useState('')
  const [profFilter,  setProfFilter]  = useState('')
  const [detailAppt,  setDetailAppt]  = useState<Appointment | null>(null)
  const [createSlot,  setCreateSlot]  = useState<CreateSlot | null>(null)

  // Derive professionals list from loaded appointments
  const professionals = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of appointments) {
      if (a.professional) map.set(a.professional.id, a.professional.name)
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [appointments])

  // Load branches for filters / form
  useEffect(() => {
    apiClient.get<{ data: Branch[] }>('/v1/branches')
      .then((res) => setBranches(res.data ?? []))
      .catch(() => {})
  }, [])

  // Fetch appointments
  function fetchAppointments() {
    setLoading(true)
    setError(null)
    const qs   = new URLSearchParams()
    const bId  = branchFilter || (!isManager && user?.branchId ? user.branchId : '')
    if (bId)        qs.set('branchId', bId)
    if (profFilter) qs.set('professionalId', profFilter)
    const query = qs.toString()
    apiClient.get<{ data: Appointment[] }>(`/v1/agenda/appointments${query ? `?${query}` : ''}`)
      .then((res) => setAppointments(res.data))
      .catch((e: unknown) => {
        const err = e as { message?: string }
        setError(err.message ?? 'Error al cargar citas')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAppointments() }, [branchFilter, profFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mobile → force day view
  useEffect(() => {
    function check() { if (window.innerWidth < 640) setView('day') }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  function navigate(dir: 'prev' | 'next') {
    setCurrentDate((d) => {
      const n = new Date(d)
      if (view === 'day')   n.setDate(n.getDate()   + (dir === 'next' ? 1  : -1))
      if (view === 'week')  n.setDate(n.getDate()   + (dir === 'next' ? 7  : -7))
      if (view === 'month') n.setMonth(n.getMonth() + (dir === 'next' ? 1  : -1))
      return n
    })
  }

  function headerLabel(): string {
    if (view === 'day') {
      return currentDate.toLocaleDateString('es', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    }
    if (view === 'week') {
      const ws = getWeekStart(currentDate)
      const we = new Date(ws); we.setDate(we.getDate() + 6)
      const sameMonth = ws.getMonth() === we.getMonth()
      return sameMonth
        ? `${ws.getDate()}–${we.getDate()} de ${MONTHS[ws.getMonth()]} ${ws.getFullYear()}`
        : `${ws.getDate()} ${MONTHS[ws.getMonth()]} – ${we.getDate()} ${MONTHS[we.getMonth()]} ${we.getFullYear()}`
    }
    return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
  }

  function handleApptUpdated(updated: Appointment) {
    setAppointments((prev) => prev.map((a) => a.id === updated.id ? updated : a))
    setDetailAppt(null)
  }

  function handleApptCreated(appt: Appointment) {
    setAppointments((prev) => [appt, ...prev])
    setCreateSlot(null)
  }

  function openCreate(date?: string, time?: string) {
    setCreateSlot({
      date:     date ?? currentDate.toLocaleDateString('en-CA'),
      time:     time ?? '09:00',
      branchId: branchFilter || user?.branchId || '',
    })
  }

  const weekStart  = getWeekStart(currentDate)
  const navBtnCls = 'rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-3 p-4">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => navigate('prev')} className={navBtnCls}>‹</button>
          <button onClick={() => setCurrentDate(new Date())} className={navBtnCls}>Hoy</button>
          <button onClick={() => navigate('next')} className={navBtnCls}>›</button>
        </div>
        <span className="text-sm font-medium capitalize text-slate-700 dark:text-slate-300">
          {headerLabel()}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* View selector */}
          <div className="hidden overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 sm:flex">
            {(['month', 'week', 'day'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={[
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  view === v
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700',
                ].join(' ')}
              >
                {v === 'month' ? 'Mes' : v === 'week' ? 'Semana' : 'Día'}
              </button>
            ))}
          </div>

          {/* Branch filter (AREA_MANAGER+) */}
          {isManager && branches.length > 0 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <option value="">Todas las sucursales</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}

          {/* Professional filter (AREA_MANAGER+) */}
          {isManager && professionals.length > 0 && (
            <select
              value={profFilter}
              onChange={(e) => setProfFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <option value="">Todos los profesionales</option>
              {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          <button
            onClick={() => openCreate()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + Nueva cita
          </button>
        </div>
      </div>

      {/* ── Calendar body ────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm">
            <p className="text-red-500">{error}</p>
            <button onClick={fetchAppointments} className="text-blue-600 hover:underline">
              Reintentar
            </button>
          </div>
        ) : view === 'week' ? (
          <WeekView
            weekStart={weekStart}
            appointments={appointments}
            onApptClick={setDetailAppt}
            onSlotClick={(date, time) => openCreate(date, time)}
          />
        ) : view === 'day' ? (
          <DayView
            day={currentDate}
            appointments={appointments}
            onApptClick={setDetailAppt}
            onSlotClick={(date, time) => openCreate(date, time)}
          />
        ) : (
          <MonthView
            date={currentDate}
            appointments={appointments}
            onApptClick={setDetailAppt}
            onDayClick={(day) => { setCurrentDate(day); setView('day') }}
          />
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {detailAppt && (
        <AppointmentDetailModal
          appointment={detailAppt}
          onClose={() => setDetailAppt(null)}
          onUpdated={handleApptUpdated}
        />
      )}
      {createSlot && (
        <AppointmentFormModal
          initialDate={createSlot.date}
          initialTime={createSlot.time}
          initialBranchId={createSlot.branchId}
          branches={branches}
          onClose={() => setCreateSlot(null)}
          onSuccess={handleApptCreated}
        />
      )}
    </div>
  )
}
