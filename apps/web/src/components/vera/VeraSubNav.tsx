'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { HelpTip } from '@/components/ui/HelpTip'

const MANAGER_ROLES = ['TENANT_ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER']

export function VeraSubNav() {
  const pathname = usePathname()
  const role     = useAuthStore((s) => s.user?.role)

  // HU-151 — `help`: ayuda contextual breve por subsección (lenguaje llano, orientada a valor).
  const tabs = [
    { href: '/vera',              label: 'Inicio',        help: 'Un resumen de tus finanzas: ingresos, egresos y saldo del periodo.' },
    { href: '/vera/transactions', label: 'Transacciones', help: 'Registra y consulta tus ingresos y egresos, cada uno con su categoría.' },
    { href: '/vera/reports',      label: 'Reportes',      help: 'Cómo se mueve tu dinero: totales por categoría y su evolución en el tiempo.' },
    { href: '/vera/deposits',     label: 'Depósitos',     help: 'Los depósitos de alquiler que guardas y debes devolver — dinero que NO es tuyo, separado de tus ingresos.' },
    { href: '/vera/incoming-deposits', label: 'Depósitos afuera', help: 'El dinero PROPIO que dejaste en depósito al rentar de terceros — recuperable, separado de tus gastos. Y cuánto llevas gastado en esos alquileres.' },
    ...(role && MANAGER_ROLES.includes(role)
      ? [{ href: '/vera/settings', label: 'Configuración', help: 'Define tus categorías, centros de costo y presupuestos mensuales.' }]
      : []),
  ]

  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 dark:border-slate-700 dark:bg-slate-800">
      <nav className="flex">
        {tabs.map((t) => {
          const active = t.href === '/vera' ? pathname === '/vera' : pathname.startsWith(t.href)
          return (
            <span key={t.href} className="inline-flex items-center">
              <Link
                href={t.href}
                className={[
                  'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
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
