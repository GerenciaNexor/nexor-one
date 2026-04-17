'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { QuoteFormModal, type Quote, type QuoteItem } from '@/components/ari/QuoteFormModal'
import { SkeletonRows } from '@/components/ui/SkeletonRows'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface QuotesResponse {
  data:  Quote[]
  total: number
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft:    'Borrador',
  sent:     'Enviada',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired:  'Vencida',
}

const STATUS_COLORS: Record<string, string> = {
  draft:    'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  sent:     'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  accepted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  expired:  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}

const ALLOWED_TRANSITIONS: Record<string, { status: string; label: string; color: string }[]> = {
  draft: [
    { status: 'sent',     label: 'Marcar enviada',  color: 'text-blue-600'    },
    { status: 'rejected', label: 'Rechazar',         color: 'text-red-500'     },
  ],
  sent: [
    { status: 'accepted', label: 'Aceptar',          color: 'text-emerald-600' },
    { status: 'rejected', label: 'Rechazar',          color: 'text-red-500'     },
  ],
}

function fmtCOP(n: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(n)
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function daysUntil(iso: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(iso).getTime() - today.getTime()) / 86_400_000)
}

// ─── ConfirmStatusModal ───────────────────────────────────────────────────────

function ConfirmStatusModal({
  quote,
  nextStatus,
  onConfirm,
  onCancel,
  loading,
}: {
  quote:      Quote
  nextStatus: string
  onConfirm:  () => void
  onCancel:   () => void
  loading:    boolean
}) {
  const isAccept = nextStatus === 'accepted'
  const isReject = nextStatus === 'rejected'

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <div className="px-6 pt-6 pb-4">
            <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${isAccept ? 'bg-emerald-50' : isReject ? 'bg-red-50' : 'bg-blue-50'}`}>
              {isAccept ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : isReject ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              )}
            </div>
            <h3 className="text-center text-base font-semibold text-slate-900 dark:text-slate-100">
              {STATUS_LABELS[nextStatus]} cotización
            </h3>
            <p className="mt-2 text-center text-sm text-slate-500">
              <span className="font-medium text-slate-700 dark:text-slate-300">{quote.quoteNumber}</span>
              {' '}pasará a estado{' '}
              <span className={`font-medium ${isAccept ? 'text-emerald-600' : isReject ? 'text-red-600' : 'text-blue-600'}`}>
                {STATUS_LABELS[nextStatus]?.toLowerCase()}
              </span>.
              {isAccept && ' Se registrará un ingreso en VERA automáticamente.'}
            </p>
          </div>
          <div className="flex gap-2 border-t border-slate-100 px-6 py-4 dark:border-slate-700">
            <button
              onClick={onCancel}
              className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-600 dark:text-slate-300"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 rounded-lg py-2 text-sm font-medium text-white transition-colors disabled:opacity-60 ${isAccept ? 'bg-emerald-600 hover:bg-emerald-700' : isReject ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {loading ? 'Guardando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ─── QuoteDetailModal ─────────────────────────────────────────────────────────

function QuoteDetailModal({
  quoteId,
  onClose,
  onStatusChange,
}: {
  quoteId:        string
  onClose:        () => void
  onStatusChange: (q: Quote) => void
}) {
  const [quote, setQuote]         = useState<Quote | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [confirming, setConf]     = useState<string | null>(null)
  const [statusLoading, setLoad]  = useState(false)

  const fetchDetail = useCallback(() => {
    setLoading(true)
    setError(null)
    apiClient.get<Quote>(`/v1/ari/quotes/${quoteId}`)
      .then(setQuote)
      .catch((e: { message?: string }) => setError(e.message ?? 'Error al cargar la cotización'))
      .finally(() => setLoading(false))
  }, [quoteId])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  async function confirmStatusChange() {
    if (!confirming || !quote) return
    setLoad(true)
    try {
      const updated = await apiClient.put<Quote>(
        `/v1/ari/quotes/${quote.id}/status`,
        { status: confirming },
      )
      setQuote((prev) => prev ? { ...prev, status: updated.status, updatedAt: updated.updatedAt } : prev)
      onStatusChange(updated)
      setConf(null)
    } catch (e: unknown) {
      alert((e as { message?: string }).message ?? 'Error al actualizar el estado')
    } finally {
      setLoad(false)
    }
  }

  const transitions = quote ? (ALLOWED_TRANSITIONS[quote.status] ?? []) : []
  const isExpired   = quote?.status === 'expired'
  const isTerminal  = ['accepted', 'rejected', 'expired'].includes(quote?.status ?? '')

  // Timeline de estados — derivada de fechas disponibles
  function buildTimeline(q: Quote): { label: string; date: string; active: boolean }[] {
    const tl: { label: string; date: string; active: boolean }[] = [
      { label: 'Creada', date: fmtDateTime(q.createdAt), active: true },
    ]
    if (q.status !== 'draft') {
      tl.push({ label: STATUS_LABELS[q.status] ?? q.status, date: fmtDateTime(q.updatedAt), active: true })
    }
    return tl
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 pt-10 backdrop-blur-sm sm:items-center sm:pt-4">
        <div className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 px-6 py-5">
            <div>
              {loading ? (
                <div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              ) : quote ? (
                <>
                  <div className="flex items-center gap-2">
                    <h2 className="font-mono text-base font-semibold text-slate-900 dark:text-slate-100">
                      {quote.quoteNumber}
                    </h2>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[quote.status] ?? ''}`}>
                      {STATUS_LABELS[quote.status] ?? quote.status}
                    </span>
                    {isExpired && (
                      <span className="text-xs font-medium text-amber-600">· Vencida</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {quote.client.name}
                    {quote.client.company && ` · ${quote.client.company}`}
                  </p>
                </>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors dark:hover:bg-slate-800"
              aria-label="Cerrar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto px-6 pb-6">
            {loading ? (
              <div className="space-y-3 py-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : error ? (
              <div className="py-10 text-center">
                <p className="text-sm text-red-500">{error}</p>
                <button onClick={fetchDetail} className="mt-3 text-sm text-blue-600 hover:underline">Reintentar</button>
              </div>
            ) : quote ? (
              <div className="space-y-5">

                {/* ── Metadata ── */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
                  {[
                    ['Cliente',        quote.client.name + (quote.client.company ? ` · ${quote.client.company}` : '')],
                    ['Deal',           quote.deal?.title ?? '—'],
                    ['Válida hasta',   fmtDate(quote.validUntil)],
                    ['Creado por',     quote.creator.name],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{value}</p>
                    </div>
                  ))}
                  {quote.notes && (
                    <div className="col-span-2">
                      <p className="text-xs text-slate-400">Notas</p>
                      <p className="text-slate-600 dark:text-slate-300">{quote.notes}</p>
                    </div>
                  )}
                </div>

                {/* ── Líneas de ítems ── */}
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Ítems</h3>
                  <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                          <th className="px-3 py-2">Descripción</th>
                          <th className="px-3 py-2 text-right">Cant.</th>
                          <th className="px-3 py-2 text-right">Precio unit.</th>
                          <th className="px-3 py-2 text-right">Dto.</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {(quote.items ?? []).map((item: QuoteItem) => (
                          <tr key={item.id} className="bg-white dark:bg-slate-900">
                            <td className="px-3 py-2">
                              <p className="text-slate-800 dark:text-slate-200">{item.description}</p>
                              {item.product && (
                                <p className="text-xs text-slate-400">{item.product.sku} · {item.product.unit}</p>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                              {item.quantity}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                              {fmtCOP(item.unitPrice)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-400">
                              {item.discountPct > 0 ? `${item.discountPct}%` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-slate-800 dark:text-slate-200">
                              {fmtCOP(item.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── Totales ── */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between text-slate-500">
                      <dt>Subtotal</dt><dd>{fmtCOP(quote.subtotal)}</dd>
                    </div>
                    {quote.discount > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <dt>Descuento</dt><dd className="text-amber-600">−{fmtCOP(quote.discount)}</dd>
                      </div>
                    )}
                    {quote.tax > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <dt>Impuesto</dt><dd>{fmtCOP(quote.tax)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900 dark:border-slate-600 dark:text-slate-100">
                      <dt>Total</dt><dd>{fmtCOP(quote.total)}</dd>
                    </div>
                  </dl>
                </div>

                {/* ── Historial de estado ── */}
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Historial</h3>
                  <ol className="relative ml-2 border-l border-slate-200 dark:border-slate-700">
                    {buildTimeline(quote).map((step, i) => (
                      <li key={i} className="mb-3 ml-4">
                        <span className="absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full border border-white bg-blue-500 dark:border-slate-900" />
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{step.label}</p>
                        <p className="text-xs text-slate-400">{step.date}</p>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* ── Acciones ── */}
                {!isTerminal && transitions.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
                    {transitions.map((t) => (
                      <button
                        key={t.status}
                        onClick={() => setConf(t.status)}
                        className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                          t.status === 'accepted'
                            ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20'
                            : t.status === 'rejected'
                            ? 'border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20'
                            : 'border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}

              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Confirmación de estado (z-index mayor que el detail modal) */}
      {confirming && quote && (
        <ConfirmStatusModal
          quote={quote}
          nextStatus={confirming}
          onConfirm={confirmStatusChange}
          onCancel={() => setConf(null)}
          loading={statusLoading}
        />
      )}
    </Portal>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function QuotesPage() {
  useAuthStore((s) => s.user)

  const [quotes, setQuotes]         = useState<Quote[]>([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId]     = useState<string | null>(null)

  const [confirming, setConfirming]    = useState<{ quote: Quote; nextStatus: string } | null>(null)
  const [statusLoading, setStatusLoad] = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  function fetchQuotes() {
    setLoading(true)
    setFetchError(null)
    const qs = new URLSearchParams()
    if (statusFilter) qs.set('status', statusFilter)
    const query = qs.toString()
    apiClient.get<QuotesResponse>(`/v1/ari/quotes${query ? `?${query}` : ''}`)
      .then((res) => { setQuotes(res.data); setTotal(res.total) })
      .catch((err: unknown) => {
        const e = err as { message?: string }
        setFetchError(e.message ?? 'Error al cargar cotizaciones')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchQuotes() }, [statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cambio de estado desde la lista ──────────────────────────────────────

  async function confirmStatusChange() {
    if (!confirming) return
    setStatusLoad(true)
    try {
      const updated = await apiClient.put<Quote>(
        `/v1/ari/quotes/${confirming.quote.id}/status`,
        { status: confirming.nextStatus },
      )
      setQuotes((prev) => prev.map((q) => q.id === updated.id ? { ...q, status: updated.status } : q))
      setConfirming(null)
    } catch (err: unknown) {
      const e = err as { message?: string }
      alert(e.message ?? 'Error al actualizar el estado')
    } finally {
      setStatusLoad(false)
    }
  }

  // Actualiza la cotización en la lista cuando el modal de detalle cambia el estado
  function handleDetailStatusChange(updated: Quote) {
    setQuotes((prev) => prev.map((q) => q.id === updated.id ? { ...q, status: updated.status } : q))
  }

  // ── Helpers de urgencia ───────────────────────────────────────────────────

  function getExpiryState(q: Quote): 'soon' | 'expired-date' | null {
    if (!q.validUntil || ['accepted', 'rejected'].includes(q.status)) return null
    const diff = daysUntil(q.validUntil)
    if (q.status === 'expired' || diff < 0) return 'expired-date'
    if (diff <= 3) return 'soon'
    return null
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const colCount = 8

  return (
    <div className="p-6">

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Cotizaciones</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {loading ? 'Cargando…' : `${total} ${total === 1 ? 'cotización' : 'cotizaciones'}`}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <span className="text-base leading-none">+</span>
          Nueva cotización
        </button>
      </div>

      {/* ── Filtro de estado ──────────────────────────────────────────────── */}
      <div className="mt-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="sent">Enviada</option>
          <option value="accepted">Aceptada</option>
          <option value="rejected">Rechazada</option>
          <option value="expired">Vencida</option>
        </select>
      </div>

      {/* ── Tabla (desktop) ─────────────────────────────────────────────── */}
      <div className="mt-4 hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block dark:border-slate-700 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Deal</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-center">Ítems</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Válida hasta</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <SkeletonRows rows={6} cols={colCount} />
              ) : fetchError ? (
                <tr>
                  <td colSpan={colCount} className="py-16 text-center">
                    <p className="text-sm text-red-500">{fetchError}</p>
                    <button onClick={fetchQuotes} className="mt-3 text-sm text-blue-600 hover:underline">
                      Reintentar
                    </button>
                  </td>
                </tr>
              ) : quotes.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="py-16 text-center text-sm text-slate-400">
                    No se encontraron cotizaciones
                  </td>
                </tr>
              ) : (
                quotes.map((q) => {
                  const transitions  = ALLOWED_TRANSITIONS[q.status] ?? []
                  const expiryState  = getExpiryState(q)
                  const isExpiredRow = q.status === 'expired'
                  const isRejected   = q.status === 'rejected'
                  const isDimmed     = isExpiredRow || isRejected

                  return (
                    <tr
                      key={q.id}
                      onClick={() => setDetailId(q.id)}
                      className={[
                        'cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50',
                        isDimmed ? 'opacity-60' : '',
                        isExpiredRow ? 'bg-amber-50/30 dark:bg-amber-900/5' : '',
                      ].join(' ')}
                    >
                      <td className="px-4 py-3">
                        <p className={`font-mono text-xs font-semibold ${isDimmed ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>
                          {q.quoteNumber}
                        </p>
                        <p className="text-xs text-slate-400">{fmtDate(q.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className={`font-medium ${isDimmed ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}>
                          {q.client.name}
                        </p>
                        {q.client.company && (
                          <p className="text-xs text-slate-400">{q.client.company}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {q.deal?.title ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[q.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {STATUS_LABELS[q.status] ?? q.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate-500">
                        {q.itemCount}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${isDimmed ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}>
                        {fmtCOP(q.total)}
                      </td>
                      <td className="px-4 py-3">
                        {q.validUntil ? (
                          <span className={
                            expiryState === 'soon'         ? 'font-medium text-amber-600' :
                            expiryState === 'expired-date' ? 'font-medium text-red-500 line-through' :
                            'text-xs text-slate-500 dark:text-slate-400'
                          }>
                            {fmtDate(q.validUntil)}
                            {expiryState === 'soon' && ' ⚠'}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-3">
                          {transitions.map((t) => (
                            <button
                              key={t.status}
                              onClick={() => setConfirming({ quote: q, nextStatus: t.status })}
                              className={`text-xs font-medium hover:underline ${t.color}`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Tarjetas (mobile) ────────────────────────────────────────────── */}
      <div className="mt-4 space-y-3 sm:hidden">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 h-4 w-36 rounded bg-slate-200" />
              <div className="h-3 w-24 rounded bg-slate-100" />
            </div>
          ))
        ) : fetchError ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center text-sm text-red-500">
            {fetchError}
            <button onClick={fetchQuotes} className="mt-2 block text-blue-600 hover:underline">Reintentar</button>
          </div>
        ) : quotes.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No se encontraron cotizaciones</p>
        ) : (
          quotes.map((q) => {
            const transitions  = ALLOWED_TRANSITIONS[q.status] ?? []
            const expiryState  = getExpiryState(q)
            const isExpiredRow = q.status === 'expired'
            const isRejected   = q.status === 'rejected'
            const isDimmed     = isExpiredRow || isRejected

            return (
              <div
                key={q.id}
                onClick={() => setDetailId(q.id)}
                className={[
                  'cursor-pointer rounded-xl border bg-white p-4 dark:bg-slate-900',
                  isExpiredRow
                    ? 'border-amber-200 bg-amber-50/40 dark:border-amber-800/40 dark:bg-amber-900/5'
                    : 'border-slate-200 dark:border-slate-700',
                  isDimmed ? 'opacity-60' : '',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className={`font-mono text-xs font-semibold ${isDimmed ? 'text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                      {q.quoteNumber}
                    </p>
                    <p className={`mt-0.5 font-medium ${isDimmed ? 'text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                      {q.client.name}
                    </p>
                    {q.client.company && <p className="text-xs text-slate-400">{q.client.company}</p>}
                  </div>
                  <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[q.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {STATUS_LABELS[q.status] ?? q.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className={`font-semibold ${isDimmed ? 'text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                    {fmtCOP(q.total)}
                  </span>
                  {q.validUntil && (
                    <span className={
                      expiryState === 'soon'         ? 'font-medium text-amber-600' :
                      expiryState === 'expired-date' ? 'font-medium text-red-500 line-through' :
                      ''
                    }>
                      Válida: {fmtDate(q.validUntil)}
                      {expiryState === 'soon' && ' ⚠'}
                    </span>
                  )}
                  <span>{q.itemCount} {q.itemCount === 1 ? 'ítem' : 'ítems'}</span>
                </div>
                {transitions.length > 0 && (
                  <div
                    className="mt-3 flex gap-3 border-t border-slate-100 pt-3 dark:border-slate-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {transitions.map((t) => (
                      <button
                        key={t.status}
                        onClick={() => setConfirming({ quote: q, nextStatus: t.status })}
                        className={`text-xs font-medium hover:underline ${t.color}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ── Modal crear cotización ────────────────────────────────────────── */}
      {showCreate && (
        <QuoteFormModal
          onClose={() => setShowCreate(false)}
          onSuccess={(quote) => {
            setShowCreate(false)
            setQuotes((prev) => [quote, ...prev])
            setTotal((n) => n + 1)
          }}
        />
      )}

      {/* ── Modal detalle de cotización ───────────────────────────────────── */}
      {detailId && (
        <QuoteDetailModal
          quoteId={detailId}
          onClose={() => setDetailId(null)}
          onStatusChange={(updated) => {
            handleDetailStatusChange(updated)
          }}
        />
      )}

      {/* ── Modal confirmar cambio de estado (desde lista) ────────────────── */}
      {confirming && (
        <ConfirmStatusModal
          quote={confirming.quote}
          nextStatus={confirming.nextStatus}
          onConfirm={confirmStatusChange}
          onCancel={() => setConfirming(null)}
          loading={statusLoading}
        />
      )}
    </div>
  )
}
