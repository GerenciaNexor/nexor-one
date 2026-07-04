'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useTheme } from '@/hooks/useTheme'

const NAV: { href: string; label: string; exact?: boolean }[] = [
  { href: '/platform',               label: 'Inicio',        exact: true },
  { href: '/platform/clients',       label: 'Clientes' },
  { href: '/platform/subscriptions', label: 'Suscripciones' },
  { href: '/platform/integrations',  label: 'Integraciones' },
  { href: '/platform/supervision',   label: 'Supervisión' },
  { href: '/platform/audit',         label: 'Auditoría' },
]

// ─── Iconos de tema (mismos que el panel de cliente) ──────────────────────────

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

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const router               = useRouter()
  const pathname             = usePathname()
  const platformAdmin        = useAuthStore((s) => s.platformAdmin)
  const clearAuth            = useAuthStore((s) => s.clearAuth)
  const { theme, toggle: toggleTheme } = useTheme()

  function isActive(href: string, exact?: boolean): boolean {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  function handleLogout(): void {
    clearAuth()
    router.replace('/platform-login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-700 dark:bg-slate-950 dark:text-slate-200">
      {/* ── Sidebar de PLATAFORMA (identidad violeta, claro/oscuro) ── */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex dark:border-white/10 dark:bg-[#0c0f1d]">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5 dark:border-white/10">
          <img src="/logos/icon-light.png" alt="NEXOR" className="h-8 w-auto object-contain dark:hidden" />
          <img src="/logos/icon-dark.png" alt="" aria-hidden="true" className="hidden h-8 w-auto object-contain dark:block" />
          <div className="leading-tight">
            <span className="font-wordmark text-lg font-semibold tracking-tight text-slate-900 [word-spacing:-0.2em] dark:text-slate-100">nexor one</span>
            <span className="block text-[10px] font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">Plataforma</span>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={[
                'block rounded-lg px-3 py-2 text-sm transition-colors',
                isActive(n.href, n.exact)
                  ? 'bg-violet-50 font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100',
              ].join(' ')}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-slate-200 px-5 py-4 dark:border-white/10">
          <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">{platformAdmin?.name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{platformAdmin?.email}</p>
        </div>
      </aside>

      {/* ── Área principal ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 dark:border-white/10 dark:bg-[#0c0f1d]">
          <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-300">
            Consola de plataforma · NEXOR
          </span>
          {/* Nav móvil compacta */}
          <nav className="ml-auto flex gap-1 overflow-x-auto lg:hidden">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href}
                className={['whitespace-nowrap rounded px-2 py-1 text-xs', isActive(n.href, n.exact)
                  ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                  : 'text-slate-500 dark:text-slate-400'].join(' ')}>
                {n.label}
              </Link>
            ))}
          </nav>

          {/* Toggle de tema claro / oscuro (mismo mecanismo que el panel de cliente) */}
          <button
            onClick={toggleTheme}
            className="ml-auto rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 lg:ml-0 dark:text-slate-400 dark:hover:bg-white/10"
            aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
            title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
          >
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          </button>

          <button
            onClick={handleLogout}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            Cerrar sesión
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
