'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/kira/products',  label: 'Catálogo' },
  { href: '/kira/stock',     label: 'Stock' },
  { href: '/kira/movements', label: 'Movimientos' },
] as const

export function KiraSubNav() {
  const pathname = usePathname()
  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6">
      <nav className="flex">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={[
              'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
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
  )
}
