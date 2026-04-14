'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { QuoteFormModal, type Quote } from '@/components/ari/QuoteFormModal'
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
  draft:    'bg-slate-100 text-slate-600',
  sent:     'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  expired:  'bg-amber-100 text-amber-700',
}

const ALLOWED_TRANSITIONS: Record<string, { status: string; label: string; color: string }[]> = {
  draft: [
    { status: 'sent',     label: 'Marcar enviada',  color: 'text-blue-600'  },
    { status: 'rejected', label: 'Rechazar',         color: 'text-red-500'   },
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

// ─── Modal de confirmación de estado ─────────────────────────────────────────

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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
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

// ─── Página ───────────────────────────────────────────────────────────────────

export default function QuotesPage() {
  useAuthStore((s) => s.user)

  const [quotes, setQuotes]         = useState<Quote[]>([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState('')

  const [showCreate, setShowCreate] = useState(false)

  const [confirming, setConfirming]   = useState<{ quote: Quote; nextStatus: string } | null>(null)
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

  // ── Cambio de estado ──────────────────────────────────────────────────────

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
                  const transitions = ALLOWED_TRANSITIONS[q.status] ?? []
                  const isExpiringSoon =
                    q.status !== 'expired' &&
                    q.status !== 'accepted' &&
                    q.status !== 'rejected' &&
                    q.validUntil != null &&
                    (() => {
                      const today  = new Date(); today.setHours(0,0,0,0)
                      const until  = new Date(q.validUntil!)
                      const diff   = Math.ceil((until.getTime() - today.getTime()) / 86_400_000)
                      return diff >= 0 && diff <= 3
                    })()

                  return (
                    <tr
                      key={q.id}
                      className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {q.quoteNumber}
                        </p>
                        <p className="text-xs text-slate-400">{fmtDate(q.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{q.client.name}</p>
                        {q.client.company && (
                          <p className="text-xs text-slate-400">{q.client.company}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
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
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {fmtCOP(q.total)}
                      </td>
                      <td className="px-4 py-3">
                        {q.validUntil ? (
                          <span className={isExpiringSoon ? 'font-medium text-amber-600' : 'text-slate-500 dark:text-slate-400 text-xs'}>
                            {fmtDate(q.validUntil)}
                            {isExpiringSoon && ' ⚠'}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
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
            const transitions = ALLOWED_TRANSITIONS[q.status] ?? []
            return (
              <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">{q.quoteNumber}</p>
                    <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">{q.client.name}</p>
                    {q.client.company && <p className="text-xs text-slate-400">{q.client.company}</p>}
                  </div>
                  <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[q.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {STATUS_LABELS[q.status] ?? q.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{fmtCOP(q.total)}</span>
                  {q.validUntil && <span>Válida: {fmtDate(q.validUntil)}</span>}
                  <span>{q.itemCount} {q.itemCount === 1 ? 'ítem' : 'ítems'}</span>
                </div>
                {transitions.length > 0 && (
                  <div className="mt-3 flex gap-3 border-t border-slate-100 pt-3 dark:border-slate-700">
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

      {/* ── Modal confirmar cambio de estado ──────────────────────────────── */}
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
