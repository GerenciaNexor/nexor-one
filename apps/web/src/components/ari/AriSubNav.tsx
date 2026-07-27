'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// HU-150 — etiquetas visibles en lenguaje del dueño de negocio. Las rutas (href) NO se tocan:
// solo cambia el texto que ve el usuario (la ruta sigue siendo /ari/pipeline, /ari/history…).
const TABS = [
  { href: '/ari/clients',      label: 'Clientes'          },
  { href: '/ari/pipeline',     label: 'Negocios en curso' },
  { href: '/ari/history',      label: 'Ventas realizadas' },
  { href: '/ari/quotes',       label: 'Cotizaciones'      },
  { href: '/ari/reports',      label: 'Reportes'          },
] as const

export function AriSubNav() {
  const pathname = usePathname()
  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 dark:border-slate-700 dark:bg-slate-800">
      <nav className="flex">
        {TABS.map((t) => (
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
