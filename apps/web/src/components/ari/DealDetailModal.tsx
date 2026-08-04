'use client'

import { useState, useEffect, useCallback } from 'react'
import { fmtCalendarDate } from '@/lib/format-date'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'
import { DealFormModal, type Deal as FormDeal, type PipelineStage } from '@/components/ari/DealFormModal'

// ─── Tipos del detalle (respuesta de GET /v1/ari/deals/:id) ────────────────────

interface DetailQuote { id: string; quoteNumber: string; status: string; total: number | null; validUntil: string | null; createdAt: string }
interface DetailInteraction { id: string; type: string; direction: string; content: string; createdAt: string; user: { name: string } | null }

interface DealDetail {
  id:            string
  title:         string
  value:         number | null
  probability:   number | null
  expectedClose: string | null
  lostReason:    string | null
  closedAt:      string | null
  createdAt:     string
  updatedAt:     string
  client:        { id: string; name: string; company: string | null; email: string | null; phone: string | null }
  stage:         { id: string; name: string; color: string | null; isFinalWon: boolean; isFinalLost: boolean }
  assignedUser:  { id: string; name: string } | null
  branch:        { id: string; name: string } | null
  quotes:        DetailQuote[]
  interactions:  DetailInteraction[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtCOP(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}
function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

const QUOTE_STATUS: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'Borrador',  cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  sent:     { label: 'Enviada',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  accepted: { label: 'Aceptada',  cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  rejected: { label: 'Rechazada', cls: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300' },
  expired:  { label: 'Vencida',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
}

function outcome(stage: DealDetail['stage']): { label: string; cls: string } {
  if (stage.isFinalWon)  return { label: 'Ganada',     cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }
  if (stage.isFinalLost) return { label: 'Perdida',    cls: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300' }
  return { label: 'En proceso', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' }
}

// ─── Componente reutilizable (Negocios en curso + Ventas realizadas) ───────────

export function DealDetailModal({ dealId, onClose, onChanged }: {
  dealId:    string
  onClose:   () => void
  onChanged?: () => void
}) {
  const [deal, setDeal]       = useState<DealDetail | null>(null)
  const [stages, setStages]   = useState<PipelineStage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [busy, setBusy]       = useState(false)
  const [editing, setEditing] = useState(false)
  const [lostOpen, setLostOpen] = useState(false)
  const [lostReason, setLostReason] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    apiClient.get<DealDetail>(`/v1/ari/deals/${dealId}`)
      .then((d) => { setDeal(d); setError(null) })
      .catch((e: { message?: string }) => setError(e.message ?? 'No se pudo cargar el negocio'))
      .finally(() => setLoading(false))
  }, [dealId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    apiClient.get<{ data: PipelineStage[] }>('/v1/ari/stages').then((r) => setStages(r.data)).catch(() => {})
  }, [])

  async function moveTo(stageId: string, reason?: string) {
    setBusy(true)
    try {
      await apiClient.put(`/v1/ari/deals/${dealId}/stage`, { stageId, ...(reason ? { lostReason: reason } : {}) })
      setLostOpen(false); setLostReason('')
      load()
      onChanged?.()
    } catch (e: unknown) {
      alert((e as { message?: string }).message ?? 'No se pudo mover el negocio')
    } finally { setBusy(false) }
  }

  const wonStage  = stages.find((s) => s.isFinalWon)
  const lostStage = stages.find((s) => s.isFinalLost)
  const isClosed  = !!deal && (deal.stage.isFinalWon || deal.stage.isFinalLost)

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
        <div
          className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700 max-h-[calc(100vh-2rem)]"
          onClick={(e) => e.stopPropagation()}
        >
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : error || !deal ? (
            <div className="p-8 text-center">
              <p className="text-sm text-red-500">{error ?? 'No encontrado'}</p>
              <button onClick={onClose} className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300">Cerrar</button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5 dark:border-slate-700">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{deal.title}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${outcome(deal.stage).cls}`}>{outcome(deal.stage).label}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: deal.stage.color ?? '#94a3b8' }} />
                    {deal.stage.name}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => setEditing(true)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Editar</button>
                  <button onClick={onClose} aria-label="Cerrar" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">

                {/* Datos del negocio */}
                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Datos del negocio</h3>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                    <Row label="Monto"><span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmtCOP(deal.value)}</span></Row>
                    <Row label="Probabilidad">{deal.probability != null ? `${deal.probability}%` : '—'}</Row>
                    <Row label="Cierre estimado">{fmtCalendarDate(deal.expectedClose, { day: '2-digit', month: 'short', year: 'numeric' })}</Row>
                    <Row label="Vendedor">{deal.assignedUser?.name ?? '—'}</Row>
                    <Row label={isClosed ? 'Cerrado' : 'Días en la etapa'}>{isClosed ? fmtDate(deal.closedAt) : `${daysSince(deal.updatedAt)} d`}</Row>
                    <Row label="Sucursal">{deal.branch?.name ?? '—'}</Row>
                  </dl>
                  {deal.stage.isFinalLost && deal.lostReason && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">Razón de pérdida: {deal.lostReason}</p>
                  )}
                </section>

                {/* Cliente (enlace a su ficha) */}
                <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Cliente</h3>
                      <p className="mt-0.5 truncate text-sm font-medium text-slate-900 dark:text-slate-100">{deal.client.name}{deal.client.company ? ` · ${deal.client.company}` : ''}</p>
                      <p className="truncate text-xs text-slate-500">{[deal.client.email, deal.client.phone].filter(Boolean).join(' · ') || 'Sin contacto'}</p>
                    </div>
                    <Link href={`/ari/clients/${deal.client.id}`} onClick={onClose} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-800 dark:text-blue-400">
                      Ver ficha →
                    </Link>
                  </div>
                </section>

                {/* Cotizaciones vinculadas */}
                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Cotizaciones ({deal.quotes.length})</h3>
                  {deal.quotes.length === 0 ? (
                    <p className="text-xs text-slate-400">Este negocio no tiene cotizaciones vinculadas.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                      {deal.quotes.map((q) => {
                        const st = QUOTE_STATUS[q.status] ?? { label: q.status, cls: 'bg-slate-100 text-slate-600' }
                        return (
                          <li key={q.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{q.quoteNumber}</p>
                              <p className="text-[11px] text-slate-400">{fmtDate(q.createdAt)}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{fmtCOP(q.total)}</span>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>

                {/* Interacciones / notas */}
                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Interacciones y notas ({deal.interactions.length})</h3>
                  {deal.interactions.length === 0 ? (
                    <p className="text-xs text-slate-400">Aún no hay interacciones registradas para este negocio.</p>
                  ) : (
                    <ul className="space-y-2">
                      {deal.interactions.map((it) => (
                        <li key={it.id} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{it.type}{it.direction ? ` · ${it.direction}` : ''}</span>
                            <span className="text-[11px] text-slate-400">{fmtDate(it.createdAt)}{it.user?.name ? ` · ${it.user.name}` : ''}</span>
                          </div>
                          <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{it.content}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {/* Acciones */}
              {!isClosed && (
                <div className="border-t border-slate-100 px-6 py-4 dark:border-slate-700">
                  {lostOpen ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={lostReason}
                        onChange={(e) => setLostReason(e.target.value)}
                        placeholder="Razón de pérdida (opcional)…"
                        className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      />
                      <button disabled={busy} onClick={() => lostStage && moveTo(lostStage.id, lostReason.trim() || undefined)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60">Confirmar pérdida</button>
                      <button disabled={busy} onClick={() => { setLostOpen(false); setLostReason('') }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300">Cancelar</button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Mover de etapa */}
                      <select
                        value=""
                        disabled={busy}
                        onChange={(e) => { if (e.target.value) moveTo(e.target.value) }}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        <option value="">Mover de etapa…</option>
                        {stages.filter((s) => s.id !== deal.stage.id && !s.isFinalWon && !s.isFinalLost).map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <div className="flex-1" />
                      {wonStage && (
                        <button disabled={busy} onClick={() => moveTo(wonStage.id)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">Marcar ganado</button>
                      )}
                      {lostStage && (
                        <button disabled={busy} onClick={() => setLostOpen(true)} className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">Marcar perdido</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Edición — reutiliza DealFormModal */}
      {editing && deal && (
        <DealFormModal
          mode="edit"
          deal={deal as unknown as FormDeal}
          stages={stages}
          onClose={() => setEditing(false)}
          onSuccess={() => { setEditing(false); load(); onChanged?.() }}
        />
      )}
    </Portal>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-slate-400">{label}</dt>
      <dd className="text-slate-800 dark:text-slate-200">{children}</dd>
    </div>
  )
}
