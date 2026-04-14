'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { ClientFormModal } from '@/components/ari/ClientFormModal'
import type { Client } from '@/components/ari/ClientFormModal'
import { SkeletonRows } from '@/components/ui/SkeletonRows'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ClientsResponse {
  data: Client[]
  total: number
}

interface User { id: string; name: string }

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

// ─── Modal de desactivar ──────────────────────────────────────────────────────

function DeactivateModal({
  client,
  onConfirm,
  onCancel,
  loading,
}: {
  client: Client
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
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
              Su historial de interacciones, deals y cotizaciones se conservará.
            </p>
          </div>
          <div className="flex gap-2 border-t border-slate-100 px-6 py-4">
            <button
              onClick={onCancel}
              className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-60"
            >
              {loading ? 'Desactivando…' : 'Desactivar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const router = useRouter()
  const user   = useAuthStore((s) => s.user)

  // OPERATIVE puede ver, crear y editar, pero no desactivar
  const canDeactivate = user?.role !== 'OPERATIVE'
  const canEdit       = true // todos los roles pueden editar

  // Lista
  const [clients, setClients]       = useState<Client[]>([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Filtros
  const [search, setSearch]         = useState('')
  const [liveSearch, setLiveSearch] = useState('')
  const [sourceFilter, setSource]   = useState('')
  const [vendorFilter, setVendor]   = useState('')
  const searchTimer                 = useRef<ReturnType<typeof setTimeout>>()

  // Vendedores para el filtro
  const [users, setUsers] = useState<User[]>([])

  // Modales
  const [modal, setModal]                     = useState<'closed' | 'create' | 'edit'>('closed')
  const [editingClient, setEditingClient]     = useState<Client | null>(null)
  const [deactivating, setDeactivating]       = useState<Client | null>(null)
  const [deactivateLoading, setDeactivateLoad] = useState(false)

  // ── Debounce 300 ms ──────────────────────────────────────────────────────
  function handleSearchInput(value: string) {
    setLiveSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(value), 300)
  }

  // ── Fetch usuarios (para filtro) ────────────────────────────────────────
  useEffect(() => {
    apiClient.get<{ data: User[] }>('/v1/users')
      .then((res) => setUsers(res.data))
      .catch(() => {})
  }, [])

  // ── Fetch clientes ───────────────────────────────────────────────────────
  function fetchClients() {
    setLoading(true)
    setFetchError(null)
    const qs = new URLSearchParams()
    if (search)       qs.set('search', search)
    if (sourceFilter) qs.set('source', sourceFilter)
    if (vendorFilter) qs.set('assignedTo', vendorFilter)
    const query = qs.toString()
    apiClient.get<ClientsResponse>(`/v1/ari/clients${query ? `?${query}` : ''}`)
      .then((res) => { setClients(res.data); setTotal(res.total) })
      .catch((err: unknown) => {
        const e = err as { message?: string }
        setFetchError(e.message ?? 'Error al cargar clientes')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchClients() }, [search, sourceFilter, vendorFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modales ──────────────────────────────────────────────────────────────
  function openCreate() { setEditingClient(null); setModal('create') }

  function openEdit(c: Client, ev: React.MouseEvent) {
    ev.stopPropagation()
    setEditingClient(c)
    setModal('edit')
  }

  function handleModalSuccess(saved: Client) {
    setModal('closed')
    setEditingClient(null)
    setClients((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
      return [saved, ...prev]
    })
    if (modal === 'create') setTotal((n) => n + 1)
  }

  async function confirmDeactivate() {
    if (!deactivating) return
    setDeactivateLoad(true)
    try {
      await apiClient.delete(`/v1/ari/clients/${deactivating.id}`)
      setClients((prev) => prev.map((c) =>
        c.id === deactivating.id ? { ...c, isActive: false } : c,
      ))
      setDeactivating(null)
    } catch (err: unknown) {
      const e = err as { message?: string }
      alert(e.message ?? 'Error al desactivar el cliente')
    } finally {
      setDeactivateLoad(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const colCount = 8

  return (
    <div className="p-6">

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Clientes</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {loading ? 'Cargando…' : `${total} ${total === 1 ? 'cliente' : 'clientes'}`}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <span className="text-base leading-none">+</span>
          Nuevo cliente
        </button>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre, email o teléfono…"
          value={liveSearch}
          onChange={(e) => handleSearchInput(e.target.value)}
          className="w-72 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <select
          value={sourceFilter}
          onChange={(e) => setSource(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Todos los orígenes</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
          <option value="manual">Manual</option>
          <option value="referido">Referido</option>
        </select>
        <select
          value={vendorFilter}
          onChange={(e) => setVendor(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Todos los vendedores</option>
          <option value="me">Mis clientes</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>

      {/* ── Tabla (desktop) ─────────────────────────────────────────────── */}
      <div className="mt-4 hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">WhatsApp</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Origen</th>
                <th className="px-4 py-3">Vendedor</th>
                <th className="px-4 py-3 text-center">Deals</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <SkeletonRows rows={6} cols={colCount} />
              ) : fetchError ? (
                <tr>
                  <td colSpan={colCount} className="py-16 text-center">
                    <p className="text-sm text-red-500">{fetchError}</p>
                    <button onClick={fetchClients} className="mt-3 text-sm text-blue-600 hover:underline">
                      Reintentar
                    </button>
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="py-16 text-center text-sm text-slate-400">
                    No se encontraron clientes
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/ari/clients/${c.id}`)}
                    className={['cursor-pointer transition-colors hover:bg-slate-50', !c.isActive ? 'opacity-50' : ''].join(' ')}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{c.name}</p>
                      {c.email && <p className="text-xs text-slate-400">{c.email}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {c.whatsappId ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {c.company ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {c.source ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLORS[c.source] ?? 'bg-slate-100 text-slate-600'}`}>
                          {SOURCE_LABELS[c.source] ?? c.source}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {c.assignedUser?.name ?? <span className="text-slate-300">Sin asignar</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(c.activeDealsCount ?? 0) > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                          {c.activeDealsCount}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {canEdit && (
                          <button
                            onClick={(ev) => openEdit(c, ev)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Editar
                          </button>
                        )}
                        {canDeactivate && c.isActive && (
                          <button
                            onClick={(ev) => { ev.stopPropagation(); setDeactivating(c) }}
                            className="text-xs text-amber-600 hover:underline"
                          >
                            Desactivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
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
              <div className="mb-2 h-4 w-40 rounded bg-slate-200" />
              <div className="h-3 w-28 rounded bg-slate-100" />
            </div>
          ))
        ) : fetchError ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center text-sm text-red-500">
            {fetchError}
            <button onClick={fetchClients} className="mt-2 block text-blue-600 hover:underline">Reintentar</button>
          </div>
        ) : clients.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No se encontraron clientes</p>
        ) : (
          clients.map((c) => (
            <div
              key={c.id}
              onClick={() => router.push(`/ari/clients/${c.id}`)}
              className={['cursor-pointer rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50', !c.isActive ? 'opacity-50' : ''].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{c.name}</p>
                  {c.company && <p className="mt-0.5 text-xs text-slate-400">{c.company}</p>}
                  {c.email   && <p className="mt-0.5 text-xs text-slate-400">{c.email}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {c.source && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLORS[c.source] ?? 'bg-slate-100 text-slate-600'}`}>
                      {SOURCE_LABELS[c.source] ?? c.source}
                    </span>
                  )}
                  {c.isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />Inactivo
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {c.whatsappId      && <span>📱 {c.whatsappId}</span>}
                {c.city            && <span>{c.city}</span>}
                {c.assignedUser?.name && <span>Vendedor: {c.assignedUser.name}</span>}
                {(c.activeDealsCount ?? 0) > 0 && (
                  <span className="font-medium text-blue-600">{c.activeDealsCount} deal{(c.activeDealsCount ?? 0) > 1 ? 's' : ''} activo{(c.activeDealsCount ?? 0) > 1 ? 's' : ''}</span>
                )}
              </div>

              {c.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex gap-3 border-t border-slate-100 pt-3">
                {canEdit && (
                  <button
                    onClick={(ev) => openEdit(c, ev)}
                    className="text-xs font-medium text-blue-600"
                  >
                    Editar
                  </button>
                )}
                {canDeactivate && c.isActive && (
                  <button
                    onClick={(ev) => { ev.stopPropagation(); setDeactivating(c) }}
                    className="text-xs font-medium text-amber-600"
                  >
                    Desactivar
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Modal crear / editar ─────────────────────────────────────────── */}
      {modal !== 'closed' && (
        <ClientFormModal
          mode={modal}
          client={editingClient ?? undefined}
          onClose={() => { setModal('closed'); setEditingClient(null) }}
          onSuccess={handleModalSuccess}
        />
      )}

      {/* ── Modal desactivar ─────────────────────────────────────────────── */}
      {deactivating && (
        <DeactivateModal
          client={deactivating}
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivating(null)}
          loading={deactivateLoading}
        />
      )}
    </div>
  )
}
