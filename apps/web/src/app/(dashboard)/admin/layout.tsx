'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const TABS = [
  { href: '/admin/branches', label: 'Sucursales' },
  { href: '/admin/users',    label: 'Usuarios'   },
] as const

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return (
    <>
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-6 py-3">
          <span className="text-sm font-semibold text-slate-900">Administracion</span>
          <nav className="flex">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={[
                  'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                  pathname.startsWith(t.href)
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
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
