'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

// Administración del TENANT (para TENANT_ADMIN). La supervisión de plataforma (SUPER_ADMIN)
// vive en /platform (HU-137/HU-140), fuera del panel de cliente.
const TENANT_TABS = [
  { href: '/admin/branches',      label: 'Sucursales'     },
  { href: '/admin/users',         label: 'Usuarios'       },
  { href: '/admin/modules',       label: 'Módulos'        },
] as const

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const tabs     = TENANT_TABS

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-6 py-3">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Administracion</span>
          <nav className="flex">
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={[
                  'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                  pathname.startsWith(t.href)
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                ].join(' ')}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      {children}
    </>
  )
}
