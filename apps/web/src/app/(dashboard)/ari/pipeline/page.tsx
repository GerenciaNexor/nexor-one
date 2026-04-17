'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { DealFormModal, type PipelineStage, type Deal } from '@/components/ari/DealFormModal'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos locales ─────────────────────────────────────────────────────────────

interface StagesResponse { data: PipelineStage[]; total: number }
interface DealsResponse  { data: Deal[];          total: number }
interface User           { id: string; name: string }

interface LostReasonState {
  deal:      Deal
  stageId:   string
  stageName: string
}

interface WonConfirmState {
  deal:      Deal
  stageId:   string
  stageName: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCOP(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('es-CO', {
    style:    'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

function pipelineValue(deals: Deal[]): number {
  return deals.reduce((sum, d) => sum + (d.value ?? 0), 0)
}

function daysSince(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

// ─── Modal confirmación "Ganado" ──────────────────────────────────────────────

function WonConfirmModal({
  state,
  onConfirm,
  onCancel,
  loading,
}: {
  state:     WonConfirmState
  onConfirm: () => void
  onCancel:  () => void
  loading:   boolean
}) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <div className="px-6 pt-6 pb-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h3 className="text-center text-base font-semibold text-slate-900 dark:text-slate-100">
              Confirmar deal ganado
            </h3>
            <p className="mt-1.5 text-center text-sm text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">{state.deal.title}</span>{' '}
              pasará a <span className="font-medium text-emerald-600 dark:text-emerald-400">{state.stageName}</span>.
            </p>
            {state.deal.value != null && state.deal.value > 0 && (
              <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 dark:bg-emerald-900/20">
                <p className="text-center text-xs text-emerald-700 dark:text-emerald-400">
                  Se registrará un ingreso de{' '}
                  <span className="font-bold">{formatCOP(state.deal.value)}</span>{' '}
                  en VERA automáticamente.
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-2 border-t border-slate-100 px-6 py-4 dark:border-slate-700">
            <button
              onClick={onCancel}
              className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 rounded-lg bg-emerald-500 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-60"
            >
              {loading ? 'Confirmando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ─── Modal razón de pérdida ────────────────────────────────────────────────────

function LostReasonModal({
  state,
  onConfirm,
  onCancel,
  loading,
}: {
  state:     LostReasonState
  onConfirm: (reason: string) => void
  onCancel:  () => void
  loading:   boolean
}) {
  const [reason, setReason] = useState('')

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <div className="px-6 pt-6 pb-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <h3 className="text-center text-base font-semibold text-slate-900 dark:text-slate-100">
              Marcar como perdido
            </h3>
            <p className="mt-1.5 text-center text-sm text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">{state.deal.title}</span>{' '}
              pasará a <span className="font-medium">{state.stageName}</span>.
            </p>
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Razón de pérdida <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
                placeholder="Ej: Precio, sin presupuesto, eligió a la competencia…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
          <div className="flex gap-2 border-t border-slate-100 px-6 py-4 dark:border-slate-700">
            <button
              onClick={onCancel}
              className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              onClick={() => onConfirm(reason)}
              disabled={loading}
              className="flex-1 rounded-lg bg-red-500 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-60"
            >
              {loading ? 'Moviendo…' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ─── Deal Card ─────────────────────────────────────────────────────────────────

function DealCard({
  deal,
  stages,
  onMove,
  canManage,
}: {
  deal:      Deal
  stages:    PipelineStage[]
  onMove:    (deal: Deal, targetStageId: string) => void
  canManage: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isClosed  = deal.stage.isFinalWon || deal.stage.isFinalLost
  const days      = daysSince(deal.updatedAt)
  const isStale   = !isClosed && days > 7
  const draggable = canManage && !isClosed

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', deal.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={[
        'group relative rounded-xl p-3.5 shadow-sm transition-all',
        draggable ? 'cursor-grab active:cursor-grabbing' : '',
        isClosed  ? 'opacity-70' : 'hover:shadow-md',
        isStale
          ? 'border border-l-4 border-amber-300 bg-white dark:border-amber-600 dark:bg-slate-800'
          : 'border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800',
      ].join(' ')}
    >
      {/* Título + menú kebab */}
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-medium leading-snug text-slate-900 dark:text-slate-100">
          {deal.title}
        </p>

        {/* Menú mover (sólo en hover) */}
        {canManage && !isClosed && (
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-5 w-5 items-center justify-center rounded text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-500 dark:hover:bg-slate-700"
              title="Mover a etapa"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
              </svg>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-6 z-20 min-w-[160px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800">
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Mover a
                  </p>
                  {stages
                    .filter((s) => s.id !== deal.stage.id)
                    .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { onMove(deal, s.id); setMenuOpen(false) }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        {s.color && (
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                        )}
                        {s.name}
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Cliente */}
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {deal.client.name}
        {deal.client.company && (
          <span className="ml-1 text-slate-400"> · {deal.client.company}</span>
        )}
      </p>

      {/* Valor + probabilidad + fecha cierre */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {deal.value != null && (
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {formatCOP(deal.value)}
          </span>
        )}
        {deal.probability != null && (
          <span className="text-xs text-slate-400">{deal.probability}%</span>
        )}
        {deal.expectedClose && (
          <span className="text-xs text-slate-400">
            {new Date(deal.expectedClose).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
          </span>
        )}
      </div>

      {/* Footer: vendedor + días en etapa */}
      <div className="mt-2 flex items-center justify-between">
        {deal.assignedUser ? (
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
              {deal.assignedUser.name.charAt(0).toUpperCase()}
            </span>
            <span className="text-[11px] text-slate-400">{deal.assignedUser.name}</span>
          </div>
        ) : <span />}

        {/* Días en la etapa actual — naranja si >7 días */}
        <span
          className={`text-[10px] ${isStale ? 'font-semibold text-amber-500' : 'text-slate-400'}`}
          title={isStale ? `Sin actividad hace ${days} días` : undefined}
        >
          {isStale && '⚠ '}
          {days === 0 ? 'Hoy' : days === 1 ? '1 día' : `${days} días`}
        </span>
      </div>
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────────────────────

export default function PipelinePage() {
  const user = useAuthStore((s) => s.user)

  const isManager = user?.role !== 'OPERATIVE'

  // Estado principal
  const [stages, setStages]         = useState<PipelineStage[]>([])
  const [deals, setDeals]           = useState<Deal[]>([])
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Filtros
  const [filterAssigned, setFilterAssigned] = useState('')
  const [users, setUsers]                   = useState<User[]>([])

  // Drag and drop
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null)

  // Mobile: columna activa
  const [mobileStageIdx, setMobileStageIdx] = useState(0)

  // Modales
  const [createModal, setCreateModal]         = useState<{ stageId: string } | null>(null)
  const [wonConfirmState, setWonConfirmState] = useState<WonConfirmState | null>(null)
  const [lostReasonState, setLostReasonState] = useState<LostReasonState | null>(null)
  const [moveLoading, setMoveLoading]         = useState(false)

  // ── Fetch usuarios para filtro de manager ────────────────────────────────

  useEffect(() => {
    if (!isManager) return
    apiClient.get<{ data: User[] }>('/v1/users')
      .then((res) => setUsers(res.data))
      .catch(() => {})
  }, [isManager])

  // ── Fetch etapas y deals ─────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams()
      if (filterAssigned) params.set('assignedTo', filterAssigned)
      const qs = params.toString() ? `?${params.toString()}` : ''

      const [s, d] = await Promise.all([
        apiClient.get<StagesResponse>('/v1/ari/stages'),
        apiClient.get<DealsResponse>(`/v1/ari/deals${qs}`),
      ])
      setStages(s.data)
      setDeals(d.data)
      setMobileStageIdx(0)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setFetchError(e.message ?? 'Error al cargar el pipeline')
    } finally {
      setLoading(false)
    }
  }, [filterAssigned])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Mover deal ───────────────────────────────────────────────────────────

  async function executeMoveOnDeal(dealId: string, stageId: string, lostReason?: string) {
    setMoveLoading(true)
    try {
      const updated = await apiClient.put<Deal>(`/v1/ari/deals/${dealId}/stage`, {
        stageId,
        ...(lostReason ? { lostReason } : {}),
      })
      setDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    } catch (err: unknown) {
      const e = err as { message?: string }
      alert(e.message ?? 'Error al mover el deal')
    } finally {
      setMoveLoading(false)
    }
  }

  function handleMoveRequest(deal: Deal, targetStageId: string) {
    const targetStage = stages.find((s) => s.id === targetStageId)
    if (!targetStage) return

    if (targetStage.isFinalWon) {
      setWonConfirmState({ deal, stageId: targetStageId, stageName: targetStage.name })
      return
    }
    if (targetStage.isFinalLost) {
      setLostReasonState({ deal, stageId: targetStageId, stageName: targetStage.name })
      return
    }
    executeMoveOnDeal(deal.id, targetStageId)
  }

  async function handleWonConfirm() {
    if (!wonConfirmState) return
    await executeMoveOnDeal(wonConfirmState.deal.id, wonConfirmState.stageId)
    setWonConfirmState(null)
  }

  async function handleLostConfirm(reason: string) {
    if (!lostReasonState) return
    await executeMoveOnDeal(lostReasonState.deal.id, lostReasonState.stageId, reason)
    setLostReasonState(null)
  }

  // ── Drag and drop ────────────────────────────────────────────────────────

  function handleDrop(e: React.DragEvent, targetStageId: string) {
    e.preventDefault()
    setDragOverStageId(null)
    const dealId = e.dataTransfer.getData('text/plain')
    const draggedDeal = deals.find((d) => d.id === dealId)
    if (draggedDeal && draggedDeal.stage.id !== targetStageId) {
      handleMoveRequest(draggedDeal, targetStageId)
    }
  }

  // ── Deal creado ──────────────────────────────────────────────────────────

  function handleDealCreated(deal: Deal) {
    setDeals((prev) => [deal, ...prev])
    setCreateModal(null)
  }

  function dealsForStage(stageId: string) {
    return deals.filter((d) => d.stage.id === stageId)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const totalValue       = pipelineValue(deals.filter((d) => !d.stage.isFinalLost))
  const currentMobileStage = stages[mobileStageIdx]

  return (
    <div className="flex h-full flex-col">

      {/* ── Encabezado ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Pipeline</h1>
          {!loading && (
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {deals.length} {deals.length === 1 ? 'deal' : 'deals'} ·{' '}
              <span className="font-medium text-emerald-600">{formatCOP(totalValue)} en pipeline</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isManager && (
            <select
              value={filterAssigned}
              onChange={(e) => setFilterAssigned(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              <option value="">Todos los vendedores</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setCreateModal({ stageId: stages[0]?.id ?? '' })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <span className="text-base leading-none">+</span>
            Nuevo deal
          </button>
        </div>
      </div>

      {/* ── Navegación mobile (una columna a la vez) ─────────────────────────── */}
      {!loading && stages.length > 0 && (
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 md:hidden dark:border-slate-700 dark:bg-slate-900">
          <button
            onClick={() => setMobileStageIdx((i) => Math.max(0, i - 1))}
            disabled={mobileStageIdx === 0}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5">
              {currentMobileStage?.color && (
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: currentMobileStage.color }} />
              )}
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {currentMobileStage?.name ?? ''}
              </span>
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                {dealsForStage(currentMobileStage?.id ?? '').length}
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              {mobileStageIdx + 1} / {stages.length}
            </span>
          </div>

          <button
            onClick={() => setMobileStageIdx((i) => Math.min(stages.length - 1, i + 1))}
            disabled={mobileStageIdx >= stages.length - 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      )}

      {/* ── Contenido ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex gap-4 overflow-x-auto p-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 animate-pulse rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-4 h-4 w-24 rounded bg-slate-200 dark:bg-slate-700" />
              {Array.from({ length: 3 }).map((__, j) => (
                <div key={j} className="mb-2 h-20 rounded-xl bg-slate-100 dark:bg-slate-700" />
              ))}
            </div>
          ))}
        </div>
      ) : fetchError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <p className="text-sm text-red-500">{fetchError}</p>
          <button onClick={fetchData} className="text-sm text-blue-600 hover:underline">Reintentar</button>
        </div>
      ) : (
        /* ── Kanban ─────────────────────────────────────────────────────────── */
        <div className="flex flex-1 gap-4 overflow-x-auto p-4 md:p-6">
          {stages.map((stage, idx) => {
            const stageDeals  = dealsForStage(stage.id)
            const stageValue  = pipelineValue(stageDeals)
            const isDropTarget = dragOverStageId === stage.id

            return (
              <div
                key={stage.id}
                className={[
                  'flex shrink-0 flex-col rounded-2xl border transition-colors',
                  // Mobile: full width, solo la columna activa; desktop: ancho fijo
                  'w-full md:w-72',
                  idx !== mobileStageIdx ? 'hidden md:flex' : 'flex',
                  isDropTarget
                    ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50',
                ].join(' ')}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setDragOverStageId(stage.id)}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverStageId(null)
                  }
                }}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                {/* Cabecera de columna */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {stage.color && (
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                    )}
                    <span className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {stage.name}
                    </span>
                    <span className="ml-1 shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                      {stageDeals.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setCreateModal({ stageId: stage.id })}
                    title={`Nuevo deal en ${stage.name}`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors dark:hover:bg-slate-700"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                  </button>
                </div>

                {/* Valor total de la columna */}
                {stageValue > 0 && (
                  <div className="px-4 pb-2">
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      {formatCOP(stageValue)}
                    </span>
                  </div>
                )}

                {/* Deals */}
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
                  {stageDeals.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center py-8">
                      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                        Sin deals en esta etapa
                      </p>
                    </div>
                  ) : (
                    stageDeals.map((deal) => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        stages={stages}
                        onMove={handleMoveRequest}
                        canManage={true}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}

          {stages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16">
              <p className="text-slate-400 dark:text-slate-500">
                No hay etapas configuradas en el pipeline.
              </p>
              {isManager && (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Activa el módulo ARI en la configuración del tenant para crear las etapas por defecto.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Modal crear deal ─────────────────────────────────────────────────── */}
      {createModal && (
        <DealFormModal
          mode="create"
          stages={stages}
          initialStageId={createModal.stageId}
          onClose={() => setCreateModal(null)}
          onSuccess={handleDealCreated}
        />
      )}

      {/* ── Modal deal ganado ────────────────────────────────────────────────── */}
      {wonConfirmState && (
        <WonConfirmModal
          state={wonConfirmState}
          onConfirm={handleWonConfirm}
          onCancel={() => setWonConfirmState(null)}
          loading={moveLoading}
        />
      )}

      {/* ── Modal razón de pérdida ──────────────────────────────────────────── */}
      {lostReasonState && (
        <LostReasonModal
          state={lostReasonState}
          onConfirm={handleLostConfirm}
          onCancel={() => setLostReasonState(null)}
          loading={moveLoading}
        />
      )}
    </div>
  )
}
