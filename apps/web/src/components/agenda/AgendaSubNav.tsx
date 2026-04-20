'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

const SETTINGS_ROLES = ['TENANT_ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER']

export function AgendaSubNav() {
  const pathname = usePathname()
  const role     = useAuthStore((s) => s.user?.role)

  const tabs = [
    { href: '/agenda/calendar',      label: 'Calendario'    },
    { href: '/agenda/appointments',  label: 'Citas'         },
    ...(role && SETTINGS_ROLES.includes(role)
      ? [{ href: '/agenda/settings', label: 'Configuración' }]
      : []),
  ]

  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 dark:border-slate-700 dark:bg-slate-800">
      <nav className="flex">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={[
              'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              pathname.startsWith(t.href)
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
            ].join(' ')}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
