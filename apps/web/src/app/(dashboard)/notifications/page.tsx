'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { SkeletonList } from '@/components/ui/SkeletonRows'
import { getCache, setCache } from '@/lib/page-cache'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Notification {
  id: string
  title: string
  message: string
  type: string
  module: string | null
  isRead: boolean
  createdAt: string
  link?: string | null
}

// ─── Auxiliares ───────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60_000)
  if (min < 1) return 'Ahora mismo'
  if (min < 60) return `Hace ${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `Hace ${hr} h`
  return `Hace ${Math.floor(hr / 24)} d`
}

function ModuleIcon({ module: mod }: { module: string | null }) {
  const MAP: Record<string, { l: string; bg: string }> = {
    KIRA:   { l: 'K', bg: 'bg-blue-500' },
    ARI:    { l: 'A', bg: 'bg-emerald-500' },
    NIRA:   { l: 'N', bg: 'bg-purple-500' },
    AGENDA: { l: 'G', bg: 'bg-orange-500' },
    VERA:   { l: 'V', bg: 'bg-rose-500' },
  }
  const { l, bg } = MAP[mod ?? ''] ?? { l: '·', bg: 'bg-slate-400' }
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${bg}`}>
      <span className="text-sm font-bold text-white">{l}</span>
    </div>
  )
}

const PAGE_SIZE = 25

// ─── Página ───────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter()

  const [all, setAll]               = useState<Notification[]>(() => getCache<Notification[]>('notifications') ?? [])
  const [loading, setLoading]       = useState(!getCache<Notification[]>('notifications'))
  const [markingAll, setMarkingAll] = useState(false)
  const [filter, setFilter]         = useState<'all' | 'unread' | 'read'>('all')
  const [page, setPage]             = useState(1)

  function load(silent = false) {
    if (!silent) setLoading(true)
    apiClient.get<{ data: Notification[] }>('/v1/notifications?limit=100')
      .then((r) => { setAll(r.data); setCache('notifications', r.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(!!getCache<Notification[]>('notifications')) }, [])

  const filtered = all.filter((n) => {
    if (filter === 'unread') return !n.isRead
    if (filter === 'read')   return  n.isRead
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const unreadCount = all.filter((n) => !n.isRead).length

  async function markAllRead() {
    setMarkingAll(true)
    await apiClient.put('/v1/notifications/read-all', {}).catch(() => {})
    setAll((prev) => prev.map((n) => ({ ...n, isRead: true })))
    setMarkingAll(false)
  }

  async function handleClick(n: Notification) {
    if (!n.isRead) {
      await apiClient.put(`/v1/notifications/${n.id}/read`, {}).catch(() => {})
      setAll((prev) => prev.map((x) => x.id === n.id ? { ...x, isRead: true } : x))
    }
    if (n.link) router.push(n.link)
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl p-6">

      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Notificaciones</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {unreadCount > 0
              ? `${unreadCount} sin leer`
              : loading ? 'Cargando…' : 'Todo al día'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={markingAll}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            {markingAll ? 'Marcando…' : 'Marcar todas como leidas'}
          </button>
        )}
      </div>

      {/* Filtros tipo tab */}
      <div className="mt-5 flex gap-1 rounded-lg bg-slate-100 p-1">
        {([
          { key: 'all',    label: 'Todas' },
          { key: 'unread', label: 'Sin leer' },
          { key: 'read',   label: 'Leidas' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setFilter(key); setPage(1) }}
            className={[
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              filter === key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <ul className="divide-y divide-slate-100"><SkeletonList rows={6} /></ul>
        ) : paginated.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">
            {filter === 'unread' ? 'No tienes notificaciones sin leer' : 'Sin notificaciones'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {paginated.map((n) => (
              <li
                key={n.id}
                onClick={() => handleClick(n)}
                className={[
                  'flex gap-4 px-5 py-4 transition-colors',
                  !n.isRead
                    ? 'bg-blue-50/30 hover:bg-blue-50/60'
                    : 'hover:bg-slate-50',
                  n.link ? 'cursor-pointer' : '',
                ].join(' ')}
              >
                <ModuleIcon module={n.module} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className={[
                      'text-sm leading-snug',
                      !n.isRead ? 'font-semibold text-slate-900' : 'font-medium text-slate-700',
                    ].join(' ')}>
                      {n.title}
                    </p>
                    <span className="shrink-0 text-xs text-slate-400">{relativeTime(n.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500 line-clamp-2">{n.message}</p>
                  {n.link && (
                    <span className="mt-1.5 inline-flex items-center gap-0.5 text-xs text-blue-600">
                      Ver recurso →
                    </span>
                  )}
                </div>

                {/* Dot de no leida */}
                {!n.isRead && (
                  <div className="mt-2 flex shrink-0 items-start">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
