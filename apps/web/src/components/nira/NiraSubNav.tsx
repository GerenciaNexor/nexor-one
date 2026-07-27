'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// HU-150 — etiquetas visibles en lenguaje del dueño de negocio. Las rutas (href) NO se tocan:
// solo cambia el texto que ve el usuario (la ruta sigue siendo /nira/compare, /nira/ranking…).
const TABS = [
  { href: '/nira/suppliers',       label: 'Proveedores' },
  { href: '/nira/purchase-orders', label: 'Órdenes de compra' },
  { href: '/nira/history',         label: 'Compras realizadas' },
  { href: '/nira/compare',         label: 'Comparar precios' },
  { href: '/nira/ranking',         label: 'Mejores proveedores' },
  { href: '/nira/reports',         label: 'Reportes' },
] as const

export function NiraSubNav() {
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
