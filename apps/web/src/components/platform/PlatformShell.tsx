'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

const NAV: { href: string; label: string; exact?: boolean }[] = [
  { href: '/platform',               label: 'Inicio',        exact: true },
  { href: '/platform/clients',       label: 'Clientes' },
  { href: '/platform/subscriptions', label: 'Suscripciones' },
  { href: '/platform/integrations',  label: 'Integraciones' },
  { href: '/platform/supervision',   label: 'Supervisión' },
  { href: '/platform/audit',         label: 'Auditoría' },
]

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const router        = useRouter()
  const pathname      = usePathname()
  const platformAdmin = useAuthStore((s) => s.platformAdmin)
  const clearAuth     = useAuthStore((s) => s.clearAuth)

  function isActive(href: string, exact?: boolean): boolean {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  function handleLogout(): void {
    clearAuth()
    router.replace('/platform-login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-200">
      {/* ── Sidebar de PLATAFORMA (tema violeta, distinto del panel de cliente) ── */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-white/10 bg-[#0c0f1d] lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5">
          <img src="/logos/icon-dark.png" alt="NEXOR" className="h-8 w-auto object-contain" />
          <div className="leading-tight">
            <span className="font-wordmark text-lg font-semibold tracking-tight text-slate-100 [word-spacing:-0.2em]">nexor one</span>
            <span className="block text-[10px] font-semibold uppercase tracking-widest text-violet-400">Plataforma</span>
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
                  ? 'bg-violet-500/15 font-semibold text-violet-300'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
              ].join(' ')}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <p className="truncate text-xs font-medium text-slate-300">{platformAdmin?.name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{platformAdmin?.email}</p>
        </div>
      </aside>

      {/* ── Área principal ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-white/10 bg-[#0c0f1d] px-4 sm:px-6">
          <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-300">
            Consola de plataforma · NEXOR
          </span>
          {/* Nav móvil compacta */}
          <nav className="ml-auto flex gap-1 overflow-x-auto lg:hidden">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href}
                className={['whitespace-nowrap rounded px-2 py-1 text-xs', isActive(n.href, n.exact) ? 'bg-violet-500/15 text-violet-300' : 'text-slate-400'].join(' ')}>
                {n.label}
              </Link>
            ))}
          </nav>
          <button
            onClick={handleLogout}
            className="ml-auto rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 lg:ml-0"
          >
            Cerrar sesión
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
