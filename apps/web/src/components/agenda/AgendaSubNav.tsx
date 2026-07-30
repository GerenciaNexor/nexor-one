'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { HelpTip } from '@/components/ui/HelpTip'

const SETTINGS_ROLES = ['TENANT_ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER']

export function AgendaSubNav() {
  const pathname = usePathname()
  const role     = useAuthStore((s) => s.user?.role)

  // HU-151 — `help`: ayuda contextual breve por subsección (lenguaje llano, orientada a valor).
  const tabs = [
    { href: '/agenda/calendar',      label: 'Calendario',    help: 'Tus citas en vista de calendario para ver la disponibilidad de un vistazo.' },
    { href: '/agenda/appointments',  label: 'Citas',         help: 'El listado de citas agendadas, para crearlas, confirmarlas o reprogramarlas.' },
    { href: '/agenda/reminders',     label: 'Recordatorios', help: 'Tus recordatorios personales para no olvidar tareas: créalos, edítalos y márcalos como hechos.' },
    ...(role && SETTINGS_ROLES.includes(role)
      ? [{ href: '/agenda/settings', label: 'Configuración', help: 'Define tus servicios, tus horarios de atención y los días bloqueados.' }]
      : []),
  ]

  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 dark:border-slate-700 dark:bg-slate-800">
      <nav className="flex">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.href)
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
