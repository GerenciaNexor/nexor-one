'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HelpTip } from '@/components/ui/HelpTip'

// HU-151 — `help`: ayuda contextual breve por subsección (lenguaje llano, orientada a valor).
const TABS = [
  { href: '/kira/products',  label: 'Catálogo',    help: 'Tu lista de productos: nombre, precio, categoría y datos de cada uno.' },
  { href: '/kira/stock',     label: 'Stock',       help: 'Cuántas unidades tienes de cada producto por sucursal, con alertas cuando baja del mínimo.' },
  { href: '/kira/movements', label: 'Movimientos', help: 'El registro de entradas, salidas y ajustes de inventario: qué se movió, cuándo y por qué.' },
] as const

export function KiraSubNav() {
  const pathname = usePathname()
  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6">
      <nav className="flex">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href)
          return (
            <span key={t.href} className="inline-flex items-center">
              <Link
                href={t.href}
                className={[
                  'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                  active
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                {t.label}
              </Link>
              {active && <HelpTip text={t.help} className="-ml-1.5 mr-1" />}
            </span>
          )
        })}
      </nav>
    </div>
  )
}
