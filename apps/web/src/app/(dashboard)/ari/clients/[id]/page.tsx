'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { ClientFormModal } from '@/components/ari/ClientFormModal'
import type { Client } from '@/components/ari/ClientFormModal'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Interaction {
  id: string
  type: string       // whatsapp | email | call | note | meeting
  direction: string  // inbound | outbound
  content: string
  createdAt: string
  userId: string | null
  user?: { name: string } | null
  dealId: string | null
}

interface DealSummary {
  id: string
  title: string
  value: number | null
  stageName: string
  stageColor: string | null
  createdAt: string
}

interface QuoteSummary {
  id: string
  quoteNumber: string
  status: string
  total: number
  createdAt: string
}

interface ClientDetail extends Client {
  assignedUser: { id: string; name: string } | null
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email:    'Email',
  manual:   'Manual',
  referido: 'Referido',
}

const SOURCE_COLORS: Record<string, string> = {
  whatsapp: 'bg-emerald-100 text-emerald-700',
  email:    'bg-blue-100 text-blue-700',
  manual:   'bg-slate-100 text-slate-600',
  referido: 'bg-violet-100 text-violet-700',
}

const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft:    'Borrador',
  sent:     'Enviada',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired:  'Vencida',
}

const QUOTE_STATUS_COLORS: Record<string, string> = {
  draft:    'bg-slate-100 text-slate-600',
  sent:     'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-500',
  expired:  'bg-amber-100 text-amber-700',
}

// ─── Auxiliares ───────────────────────────────────────────────────────────────

function InteractionIcon({ type }: { type: string }) {
  if (type === 'whatsapp') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2" strokeLinecap="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
  )
  if (type === 'email') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  )
  if (type === 'call') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.99 12 19.79 19.79 0 0 1 1.93 3.5 2 2 0 0 1 3.91 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  )
  if (type === 'meeting') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
  // note (default)
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  )
}

const INTERACTION_TYPE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email:    'Email',
  call:     'Llamada',
  note:     'Nota',
  meeting:  'Reunión',
}

// ─── Modal de confirmación ────────────────────────────────────────────────────

function DeactivateModal({
  client, onConfirm, onCancel, loading,
}: { client: ClientDetail; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60">
          <div className="px-6 pt-6 pb-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3 className="text-center text-base font-semibold text-slate-900">Desactivar cliente</h3>
            <p className="mt-2 text-center text-sm text-slate-500">
              <span className="font-medium text-slate-700">{client.name}</span> quedará inactivo.
              Su historial, deals y cotizaciones se conservarán.
            </p>
          </div>
          <div className="flex gap-2 border-t border-slate-100 px-6 py-4">
            <button onClick={onCancel} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button onClick={onConfirm} disabled={loading} className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-60">
              {loading ? 'Desactivando…' : 'Desactivar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ─── Página de detalle ────────────────────────────────────────────────────────

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const { id }  = params
  const router  = useRouter()
  const user    = useAuthStore((s) => s.user)
  const canDeactivate = user?.role !== 'OPERATIVE'

  const [client,       setClient]       = useState<ClientDetail | null>(null)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [deals,        setDeals]        = useState<DealSummary[]>([])
  const [quotes,       setQuotes]       = useState<QuoteSummary[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [showEdit,     setShowEdit]     = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [deactivateLoad, setDeactivateLoad] = useState(false)

  // Interacciones
  const [typeFilter,    setTypeFilter]    = useState('')
  const [showAddInt,    setShowAddInt]    = useState(false)
  const [intForm,       setIntForm]       = useState({ type: 'note', direction: 'outbound', content: '', dealId: '' })
  const [intSubmitting, setIntSubmitting] = useState(false)
  const [intError,      setIntError]      = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      apiClient.get<ClientDetail>(`/v1/ari/clients/${id}`),
      apiClient.get<{ data: Interaction[] }>(`/v1/ari/clients/${id}/interactions`).catch(() => ({ data: [] })),
      apiClient.get<{ data: DealSummary[] }>(`/v1/ari/deals?clientId=${id}`).catch(() => ({ data: [] })),
      apiClient.get<{ data: QuoteSummary[] }>(`/v1/ari/quotes?clientId=${id}`).catch(() => ({ data: [] })),
    ])
      .then(([c, ints, ds, qs]) => {
        setClient(c)
        setInteractions(ints.data)
        setDeals(ds.data)
        setQuotes(qs.data)
      })
      .catch((e: unknown) => {
        const err = e as { message?: string }
        setError(err.message ?? 'Error al cargar el cliente')
      })
      .finally(() => setLoading(false))
  }, [id])

  async function handleAddInteraction(ev: React.FormEvent) {
    ev.preventDefault()
    if (!intForm.content.trim()) { setIntError('El contenido es requerido'); return }
    setIntSubmitting(true)
    setIntError(null)
    try {
      const created = await apiClient.post<Interaction>(
        `/v1/ari/clients/${id}/interactions`,
        {
          type:      intForm.type,
          direction: intForm.direction,
          content:   intForm.content.trim(),
          dealId:    intForm.dealId || undefined,
        },
      )
      setInteractions((prev) => [created, ...prev])
      setIntForm({ type: 'note', direction: 'outbound', content: '', dealId: '' })
      setShowAddInt(false)
    } catch (e: unknown) {
      const err = e as { message?: string }
      setIntError(err.message ?? 'Error al registrar la interacción')
    } finally {
      setIntSubmitting(false)
    }
  }

  async function confirmDeactivate() {
    if (!client) return
    setDeactivateLoad(true)
    try {
      await apiClient.delete(`/v1/ari/clients/${id}`)
      setClient((prev) => prev ? { ...prev, isActive: false } : prev)
      setDeactivating(false)
    } catch (e: unknown) {
      const err = e as { message?: string }
      alert(err.message ?? 'Error al desactivar')
    } finally {
      setDeactivateLoad(false)
    }
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 rounded bg-slate-200" />
          <div className="h-4 w-32 rounded bg-slate-100" />
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <div className="h-48 rounded-xl bg-slate-100" />
              <div className="h-64 rounded-xl bg-slate-100" />
            </div>
            <div className="space-y-4">
              <div className="h-48 rounded-xl bg-slate-100" />
              <div className="h-48 rounded-xl bg-slate-100" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-500">{error ?? 'Cliente no encontrado'}</p>
        <button onClick={() => router.back()} className="mt-3 text-sm text-blue-600 hover:underline">
          Volver
        </button>
      </div>
    )
  }

  const activeDeals = deals.filter((d) => d.stageName && !['Ganado', 'Perdido'].includes(d.stageName))

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6">

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">{client.name}</h1>
              {client.company && (
                <span className="text-sm text-slate-400">{client.company}</span>
              )}
              {!client.isActive && (
                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  Inactivo
                </span>
              )}
            </div>
            {client.source && (
              <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLORS[client.source] ?? 'bg-slate-100 text-slate-600'}`}>
                {SOURCE_LABELS[client.source] ?? client.source}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowEdit(true)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Editar
          </button>
          {canDeactivate && client.isActive && (
            <button
              onClick={() => setDeactivating(true)}
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
            >
              Desactivar
            </button>
          )}
        </div>
      </div>

      {/* ── Contenido ───────────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">

        {/* ── Columna principal ─────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">

          {/* Información de contacto */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-700">Información</h2>
            </div>
            <div className="grid gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-2">
              {[
                { label: 'Email',      value: client.email },
                { label: 'Teléfono',   value: client.phone },
                { label: 'WhatsApp',   value: client.whatsappId },
                { label: 'NIT/Cédula', value: client.taxId },
                { label: 'Dirección',  value: client.address },
                { label: 'Ciudad',     value: client.city },
                { label: 'Vendedor',   value: client.assignedUser?.name ?? null },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">
                    {value ?? <span className="font-normal text-slate-300">—</span>}
                  </p>
                </div>
              ))}
              {client.tags.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400">Etiquetas</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {client.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {client.notes && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-400">Notas internas</p>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{client.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Historial de interacciones */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-700">
                Historial de interacciones
                {interactions.length > 0 && (
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                    {interactions.length}
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                {/* Filtro por tipo */}
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 outline-none focus:border-blue-400"
                >
                  <option value="">Todos los tipos</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="call">Llamada</option>
                  <option value="note">Nota</option>
                  <option value="meeting">Reunión</option>
                </select>
                <button
                  onClick={() => { setShowAddInt((v) => !v); setIntError(null) }}
                  className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  + Registrar
                </button>
              </div>
            </div>

            {/* Formulario inline para nueva interacción */}
            {showAddInt && (
              <form onSubmit={handleAddInteraction} className="border-b border-slate-100 bg-slate-50 px-5 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Tipo</label>
                    <select
                      value={intForm.type}
                      onChange={(e) => setIntForm((p) => ({ ...p, type: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500"
                    >
                      <option value="note">Nota</option>
                      <option value="call">Llamada</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                      <option value="meeting">Reunión</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Dirección</label>
                    <select
                      value={intForm.direction}
                      onChange={(e) => setIntForm((p) => ({ ...p, direction: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500"
                    >
                      <option value="outbound">→ Saliente</option>
                      <option value="inbound">← Entrante</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Contenido *</label>
                  <textarea
                    rows={3}
                    value={intForm.content}
                    onChange={(e) => setIntForm((p) => ({ ...p, content: e.target.value }))}
                    placeholder="Describe el contacto con el cliente…"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
                  />
                </div>
                {deals.length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Deal relacionado <span className="font-normal text-slate-400">(opcional)</span></label>
                    <select
                      value={intForm.dealId}
                      onChange={(e) => setIntForm((p) => ({ ...p, dealId: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500"
                    >
                      <option value="">Sin deal asociado</option>
                      {deals.map((d) => (
                        <option key={d.id} value={d.id}>{d.title}</option>
                      ))}
                    </select>
                  </div>
                )}
                {intError && (
                  <p className="text-xs text-red-500">{intError}</p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowAddInt(false); setIntError(null) }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={intSubmitting}
                    className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
                  >
                    {intSubmitting ? 'Guardando…' : 'Guardar interacción'}
                  </button>
                </div>
              </form>
            )}

            {(() => {
              const filtered = typeFilter
                ? interactions.filter((i) => i.type === typeFilter)
                : interactions
              return filtered.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-400">
                  {typeFilter ? 'Sin interacciones de este tipo' : 'Sin interacciones registradas'}
                </p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {filtered.map((int) => {
                    const isAgent = int.userId === null
                    return (
                      <div key={int.id} className="flex gap-3 px-5 py-3.5">
                        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isAgent ? 'bg-violet-50' : 'bg-slate-50'}`}>
                          {isAgent ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
                            </svg>
                          ) : (
                            <InteractionIcon type={int.type} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-slate-600">
                              {INTERACTION_TYPE_LABELS[int.type] ?? int.type}
                            </span>
                            <span className="text-xs text-slate-400">
                              {int.direction === 'inbound' ? '← Entrada' : '→ Salida'}
                            </span>
                            {isAgent ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
                                Agente IA
                              </span>
                            ) : int.user?.name ? (
                              <span className="text-xs text-slate-400">· {int.user.name}</span>
                            ) : null}
                            <span className="ml-auto text-xs text-slate-400">
                              {new Date(int.createdAt).toLocaleDateString('es-CO', {
                                day: '2-digit', month: 'short', year: 'numeric',
                              })}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-700 line-clamp-3">{int.content}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>

        {/* ── Columna lateral ───────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Deals activos */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Deals activos</h2>
              {activeDeals.length > 0 && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                  {activeDeals.length}
                </span>
              )}
            </div>
            {activeDeals.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-slate-400">Sin deals activos</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {activeDeals.slice(0, 5).map((d) => (
                  <div key={d.id} className="px-5 py-3">
                    <p className="text-sm font-medium text-slate-900 truncate">{d.title}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-600">
                        {d.stageName}
                      </span>
                      {d.value != null && (
                        <span className="text-xs text-slate-500">
                          ${d.value.toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cotizaciones recientes */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-700">Cotizaciones</h2>
            </div>
            {quotes.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-slate-400">Sin cotizaciones</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {quotes.slice(0, 5).map((q) => (
                  <div key={q.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-700">{q.quoteNumber}</span>
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${QUOTE_STATUS_COLORS[q.status] ?? 'bg-slate-100 text-slate-500'}`}>
                        {QUOTE_STATUS_LABELS[q.status] ?? q.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-900">
                        ${q.total.toLocaleString('es-CO', { minimumFractionDigits: 0 })}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(q.createdAt).toLocaleDateString('es-CO', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resumen rápido */}
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Resumen</h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Deals activos</span>
                <span className="font-semibold text-slate-900">{activeDeals.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Cotizaciones</span>
                <span className="font-semibold text-slate-900">{quotes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Interacciones</span>
                <span className="font-semibold text-slate-900">{interactions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Cliente desde</span>
                <span className="font-semibold text-slate-900">
                  {new Date(client.createdAt).toLocaleDateString('es-CO', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal editar ─────────────────────────────────────────────────── */}
      {showEdit && (
        <ClientFormModal
          mode="edit"
          client={client}
          onClose={() => setShowEdit(false)}
          onSuccess={(saved) => {
            setClient((prev) => prev ? { ...prev, ...saved, assignedUser: prev.assignedUser } : prev)
            setShowEdit(false)
          }}
        />
      )}

      {/* ── Modal desactivar ─────────────────────────────────────────────── */}
      {deactivating && (
        <DeactivateModal
          client={client}
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivating(false)}
          loading={deactivateLoad}
        />
      )}
    </div>
  )
}
