'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

const MANAGER_ROLES = ['TENANT_ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER']

export function VeraSubNav() {
  const pathname = usePathname()
  const role     = useAuthStore((s) => s.user?.role)

  const tabs = [
    { href: '/vera',              label: 'Inicio'        },
    { href: '/vera/transactions', label: 'Transacciones' },
    { href: '/vera/reports',      label: 'Reportes'      },
    ...(role && MANAGER_ROLES.includes(role)
      ? [{ href: '/vera/settings', label: 'Configuración' }]
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
              t.href === '/vera'
                ? pathname === '/vera'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                : pathname.startsWith(t.href)
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
