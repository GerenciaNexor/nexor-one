'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { SearchableSelect } from '@/components/ui/SearchableSelect'

interface Opt { id: string; name: string; type: 'objetivo' | 'limite'; status: string }

/**
 * HU-199 — Selector reutilizable de proyecto para asignar transacciones (compra/venta/gasto/alquiler).
 * Opcional ("Sin proyecto"). Se oculta solo si el tenant no tiene el módulo Proyectos activo o el
 * usuario no puede listarlos (403) → la asignación simplemente no aparece, sin romper el formulario.
 */
export function ProjectSelect({ value, onChange, className, label = 'Proyecto (opcional)' }: {
  value: string
  onChange: (v: string) => void
  className?: string
  label?: string | null
}) {
  const [opts, setOpts] = useState<Opt[] | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    apiClient.get<{ data: Opt[] }>('/v1/proyectos')
      .then((r) => setOpts(r.data))
      .catch(() => setHidden(true)) // módulo no activo / sin permiso → no mostrar el selector
  }, [])

  if (hidden) return null
  // Solo proyectos gestionables (no terminados/cancelados) como destino de nuevas asignaciones.
  const visible = (opts ?? []).filter((o) => o.status === 'activo' || o.status === 'en_curso')

  const sel = className ?? 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

  // HU-210 — buscador por nombre (los proyectos pueden ser muchos). "Sin proyecto" siempre disponible.
  const selectOptions = [
    { value: '', label: 'Sin proyecto' },
    ...visible.map((o) => ({ value: o.id, label: o.name, hint: o.type === 'limite' ? 'límite' : 'objetivo' })),
  ]

  return (
    <div>
      {label && <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</label>}
      <SearchableSelect value={value} onChange={onChange} options={selectOptions} className={sel} disabled={opts === null} placeholder="Sin proyecto" />
    </div>
  )
}
