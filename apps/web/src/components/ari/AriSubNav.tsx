'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HelpTip } from '@/components/ui/HelpTip'

// HU-150 — etiquetas visibles en lenguaje del dueño de negocio. Las rutas (href) NO se tocan:
// solo cambia el texto que ve el usuario (la ruta sigue siendo /ari/pipeline, /ari/history…).
// HU-151 — `help`: ayuda contextual breve por subsección (lenguaje llano, orientada a valor).
const TABS = [
  { href: '/ari/clients',  label: 'Clientes',          help: 'Tu directorio de clientes: guarda sus datos, revisa su historial y quién los atiende.' },
  { href: '/ari/pipeline', label: 'Negocios en curso', help: 'Tus oportunidades de venta por etapa. Mueve cada negocio a medida que avanza hasta cerrarlo.' },
  { href: '/ari/history',  label: 'Ventas realizadas', help: 'Las ventas que ya cerraste (ganadas o perdidas), para consultar qué pasó con cada una.' },
  { href: '/ari/quick-sales', label: 'Ventas rápidas', help: 'Registra y consulta ventas pequeñas que ya ocurrieron, sin el pipeline. No se mezclan con los negocios ganados.' },
  { href: '/ari/quotes',   label: 'Cotizaciones',      help: 'Crea y envía cotizaciones a tus clientes y haz seguimiento de si las aceptan.' },
  { href: '/ari/reports',  label: 'Reportes',          help: 'Cómo van tus ventas: cuánto vendiste, tu tasa de conversión y el desempeño por vendedor.' },
] as const

export function AriSubNav() {
  const pathname = usePathname()
  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 sm:px-6 dark:border-slate-700 dark:bg-slate-800">
      <nav className="flex overflow-x-auto no-scrollbar">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href)
          return (
            <span key={t.href} className="inline-flex shrink-0 items-center">
              <Link
                href={t.href}
                className={[
                  'whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                  active
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
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
