'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HelpTip } from '@/components/ui/HelpTip'

// HU-150 — etiquetas visibles en lenguaje del dueño de negocio. Las rutas (href) NO se tocan:
// solo cambia el texto que ve el usuario (la ruta sigue siendo /nira/compare, /nira/ranking…).
// HU-151 — `help`: ayuda contextual breve por subsección (lenguaje llano, orientada a valor).
const TABS = [
  { href: '/nira/suppliers',       label: 'Proveedores',        help: 'Tu lista de proveedores con sus datos, condiciones de pago y calificación.' },
  { href: '/nira/purchase-orders', label: 'Órdenes de compra',  help: 'Crea y gestiona tus pedidos a proveedores, desde el borrador hasta la recepción.' },
  { href: '/nira/history',         label: 'Compras realizadas', help: 'Las compras ya realizadas o en proceso, para revisar tu historial de pedidos.' },
  { href: '/nira/compare',         label: 'Comparar precios',   help: 'Compara el precio del mismo producto entre proveedores y elige el más conveniente.' },
  { href: '/nira/ranking',         label: 'Mejores proveedores',help: 'Tus proveedores ordenados por desempeño: precio, cumplimiento de entrega y calidad.' },
  { href: '/nira/reports',         label: 'Reportes',           help: 'Cuánto gastaste en compras, con el detalle por proveedor y por categoría de producto.' },
] as const

export function NiraSubNav() {
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
