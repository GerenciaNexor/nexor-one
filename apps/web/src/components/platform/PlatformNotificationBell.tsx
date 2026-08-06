'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'

interface PlatformNotif {
  id: string
  type: string
  title: string
  message: string
  tenantId: string | null
  link: string | null
  createdAt: string
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

/**
 * Campanita de la consola SUPER_ADMIN — bandeja compartida del equipo NEXOR.
 * Consume /v1/admin/notifications* (bajo superAdminHook). Avisa de canales caídos / tokens por vencer.
 */
export function PlatformNotificationBell() {
  const router = useRouter()
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<PlatformNotif[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const refreshCount = useCallback(() => {
    apiClient.get<{ data: { count: number } }>('/v1/admin/notifications/unread-count')
      .then((r) => setUnread(r.data.count)).catch(() => {})
  }, [])

  useEffect(() => {
    refreshCount()
    const id = setInterval(() => { if (!document.hidden) refreshCount() }, 30_000)
    return () => clearInterval(id)
  }, [refreshCount])

  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) {
      setLoading(true)
      apiClient.get<{ data: PlatformNotif[] }>('/v1/admin/notifications?isRead=false&limit=10')
        .then((r) => setItems(r.data)).catch(() => setItems([])).finally(() => setLoading(false))
    }
  }

  function onItem(n: PlatformNotif) {
    apiClient.put(`/v1/admin/notifications/${n.id}/read`, {}).catch(() => {})
    setOpen(false)
    refreshCount()
    if (n.link) router.push(n.link)
  }

  function markAll() {
    apiClient.put('/v1/admin/notifications/read-all', {}).then(() => { setItems([]); setUnread(0) }).catch(() => {})
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} aria-label={`Notificaciones${unread > 0 ? `, ${unread} sin leer` : ''}`}
        className="relative rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[90vw] rounded-xl border border-slate-200 bg-white shadow-xl sm:w-96 dark:border-white/10 dark:bg-[#12162a]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Alertas de canales{unread > 0 && <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-600">{unread}</span>}</span>
            {unread > 0 && <button onClick={markAll} className="text-xs text-violet-600 hover:underline dark:text-violet-400">Marcar todas</button>}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-violet-600" /></div>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Sin alertas sin leer</p>
            ) : (
              <ul className="divide-y divide-slate-50 dark:divide-white/5">
                {items.map((n) => (
                  <li key={n.id} onClick={() => onItem(n)} className="flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-500/15">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{n.message}</p>
                      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{relativeTime(n.createdAt)}</p>
                    </div>
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
