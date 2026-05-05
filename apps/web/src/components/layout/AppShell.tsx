'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { logoutRequest } from '@/lib/auth-api'
import { apiClient } from '@/lib/api-client'
import { SentryUserContext } from '@/components/layout/SentryUserContext'
import { FloatingChat } from '@/components/chat/FloatingChat'
import { useChatStore } from '@/store/chat'
import { useTheme } from '@/hooks/useTheme'

// ─── Normalización de links de notificaciones (compatibilidad con links legacy) ─

function resolveNotifLink(link: string): string {
  if (link.startsWith('/bulk-upload/logs/')) {
    return link.replace('/bulk-upload/logs/', '/settings/bulk-upload/')
  }
  if (link.startsWith('/admin/bulk-upload/logs/')) {
    return link.replace('/admin/bulk-upload/logs/', '/admin/bulk-uploads/')
  }
  return link
}

// ─── Configuracion de modulos ─────────────────────────────────────────────────

const MODULES = [
  { key: 'ARI',    label: 'Ventas',     href: '/ari' },
  { key: 'NIRA',   label: 'Compras',    href: '/nira' },
  { key: 'KIRA',   label: 'Inventario', href: '/kira' },
  { key: 'AGENDA', label: 'Agenda',     href: '/agenda' },
  { key: 'VERA',   label: 'Finanzas',   href: '/vera' },
] as const

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

// ─── Iconos SVG ───────────────────────────────────────────────────────────────

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
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
    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${bg}`}>
      <span className="text-xs font-bold text-white">{l}</span>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, refreshToken, clearAuth } = useAuthStore()

  const chatUnread = useChatStore((s) => s.unreadCount)
  const { theme, toggle: toggleTheme } = useTheme()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  // Feature flags: que modulos mostrar en la sidebar.
  // Se refresca en cada cambio de ruta para reflejar cambios en /admin/modules.
  useEffect(() => {
    apiClient.get<Record<string, boolean>>('/v1/tenants/feature-flags')
      .then(setFlags)
      .catch(() => {})
  }, [pathname])

  // Polling del conteo de notificaciones no leidas cada 30s.
  // Se pausa cuando la pestaña no es visible (Page Visibility API).
  useEffect(() => {
    let mounted = true
    async function fetchCount() {
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        const data = await apiClient.get<{ count: number }>('/v1/notifications/unread-count')
        if (mounted) setUnreadCount(data.count)
      } catch {
        // El endpoint puede no estar disponible — ignorar silenciosamente
      }
    }
    fetchCount()
    const interval = setInterval(fetchCount, 30_000)
    function onVisibility() {
      if (!document.hidden) fetchCount()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      mounted = false
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Cerrar notificaciones al hacer click fuera
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    if (notifOpen) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [notifOpen])

  // Cerrar sidebar movil al cambiar de ruta
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  async function handleBellClick() {
    const opening = !notifOpen
    setNotifOpen(opening)
    if (opening) {
      setNotifLoading(true)
      try {
        const data = await apiClient.get<{ data: Notification[] }>('/v1/notifications?isRead=false&limit=10')
        setNotifications(data.data)
      } catch {
        // ignore
      } finally {
        setNotifLoading(false)
      }
    }
  }

  async function handleNotifClick(n: Notification) {
    // Marcar como leida y quitarla del panel
    await apiClient.put(`/v1/notifications/${n.id}/read`, {}).catch(() => {})
    setNotifications((prev) => prev.filter((x) => x.id !== n.id))
    setUnreadCount((c) => Math.max(0, c - 1))
    if (n.link) {
      setNotifOpen(false)
      router.push(resolveNotifLink(n.link))
    }
  }

  async function handleMarkAllRead() {
    await apiClient.put('/v1/notifications/read-all', {}).catch(() => {})
    setNotifications([])
    setUnreadCount(0)
  }

  async function handleLogout() {
    if (refreshToken) await logoutRequest(refreshToken)
    clearAuth()
    router.replace('/login')
  }

  const activeModules = MODULES.filter((m) => flags[m.key])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
      <SentryUserContext />

      {/* Overlay movil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-slate-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={[
          'fixed z-30 flex h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-white',
          'dark:border-slate-700 dark:bg-slate-800',
          'transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-slate-200 px-5 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600">
              <span className="text-sm font-black text-white">N</span>
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">NEXOR</span>
          </div>
        </div>

        {/* Navegacion */}
        <nav className="flex-1 overflow-y-auto py-4">
          <div className="space-y-0.5 px-3">
            <Link
              href="/dashboard"
              className={[
                'flex items-center rounded-lg px-3 py-2 text-sm transition-colors',
                pathname === '/dashboard'
                  ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100',
              ].join(' ')}
            >
              Inicio
            </Link>

            <Link
              href="/chat"
              className={[
                'flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
                pathname === '/chat'
                  ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100',
              ].join(' ')}
            >
              <span>Chat IA</span>
              {chatUnread > 0 && (
                <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold leading-none text-white">
                  {chatUnread > 9 ? '9+' : chatUnread}
                </span>
              )}
            </Link>

            {activeModules.length > 0 && (
              <div className="my-2 border-t border-slate-100 dark:border-slate-700" />
            )}

            {activeModules.map((m) => (
              <Link
                key={m.key}
                href={m.href}
                className={[
                  'flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
                  pathname.startsWith(m.href)
                    ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100',
                ].join(' ')}
              >
                <span>{m.label}</span>
                <span className={[
                  'text-[10px] font-bold tracking-wide',
                  pathname.startsWith(m.href)
                    ? 'text-blue-400 dark:text-blue-500'
                    : 'text-slate-300 dark:text-slate-600',
                ].join(' ')}>
                  {m.key}
                </span>
              </Link>
            ))}

            {(user?.role === 'BRANCH_ADMIN' || user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN') && (
              <>
                <div className="my-2 border-t border-slate-100 dark:border-slate-700" />
                <Link
                  href="/settings/integrations"
                  className={[
                    'flex items-center rounded-lg px-3 py-2 text-sm transition-colors',
                    pathname.startsWith('/settings/integrations')
                      ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100',
                  ].join(' ')}
                >
                  Integraciones
                </Link>
                {(user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN') && (
                  <Link
                    href="/settings/bulk-upload"
                    className={[
                      'flex items-center rounded-lg px-3 py-2 text-sm transition-colors',
                      pathname.startsWith('/settings/bulk-upload')
                        ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100',
                    ].join(' ')}
                  >
                    Carga masiva
                  </Link>
                )}
              </>
            )}

            {user?.role === 'TENANT_ADMIN' && (
              <>
                <div className="my-2 border-t border-slate-100 dark:border-slate-700" />
                <Link
                  href="/admin/branches"
                  className={[
                    'flex items-center rounded-lg px-3 py-2 text-sm transition-colors',
                    pathname.startsWith('/admin')
                      ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100',
                  ].join(' ')}
                >
                  Administracion
                </Link>
              </>
            )}

            {user?.role === 'SUPER_ADMIN' && (
              <>
                <div className="my-2 border-t border-slate-100 dark:border-slate-700" />
                <Link
                  href="/admin/bulk-uploads"
                  className={[
                    'flex items-center rounded-lg px-3 py-2 text-sm transition-colors',
                    pathname.startsWith('/admin')
                      ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100',
                  ].join(' ')}
                >
                  Supervisión
                </Link>
              </>
            )}
          </div>
        </nav>

        {/* Nombre del usuario en el pie de la sidebar */}
        <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">{user?.name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{user?.role}</p>
        </div>
      </aside>

      {/* ── Area principal ───────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Header */}
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 dark:border-slate-700 dark:bg-slate-800">

          {/* Boton hamburguesa (solo movil) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Abrir menu de navegacion"
          >
            <MenuIcon />
          </button>

          {/* Empresa */}
          <span className="hidden truncate text-sm font-semibold text-slate-900 sm:block dark:text-slate-100">
            {user?.tenant.name}
          </span>

          <div className="flex-1" />

          {/* Toggle de tema claro / oscuro */}
          <button
            onClick={toggleTheme}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
            title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
          >
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          </button>

          {/* Campana de notificaciones */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={handleBellClick}
              className="relative rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
              aria-label={`Notificaciones${unreadCount > 0 ? `, ${unreadCount} sin leer` : ''}`}
            >
              <BellIcon />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold leading-none text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Panel de notificaciones */}
            {notifOpen && (
              <div className="absolute right-0 top-11 z-50 w-[90vw] rounded-xl border border-slate-200 bg-white shadow-xl sm:w-80 dark:border-slate-700 dark:bg-slate-800">

                {/* Cabecera */}
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Notificaciones
                    {unreadCount > 0 && (
                      <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-600">
                        {unreadCount}
                      </span>
                    )}
                  </span>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllRead} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                      Marcar todas
                    </button>
                  )}
                </div>

                {/* Lista */}
                <div className="max-h-80 overflow-y-auto">
                  {notifLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
                    </div>
                  ) : notifications.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                      Sin notificaciones sin leer
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-50">
                      {notifications.map((n) => (
                        <li
                          key={n.id}
                          onClick={() => handleNotifClick(n)}
                          className="flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
                        >
                          <ModuleIcon module={n.module} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{n.title}</p>
                            <p className="mt-0.5 text-xs text-slate-500 line-clamp-2 dark:text-slate-400">{n.message}</p>
                            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{relativeTime(n.createdAt)}</p>
                          </div>
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Pie: Ver todas */}
                <div className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-700">
                  <Link
                    href="/notifications"
                    onClick={() => setNotifOpen(false)}
                    className="block text-center text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Ver todas las notificaciones →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            Cerrar sesion
          </button>
        </header>

        {/* Contenido de la pagina */}
        <main className="flex-1 overflow-y-auto dark:bg-slate-900">
          {children}
        </main>
      </div>

      {/* Chat flotante — visible en todas las pantallas del dashboard */}
      <FloatingChat />
    </div>
  )
}
