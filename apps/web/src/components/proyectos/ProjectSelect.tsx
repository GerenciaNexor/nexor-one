'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'

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

  return (
    <div>
      {label && <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</label>}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={sel} disabled={opts === null}>
        <option value="">Sin proyecto</option>
        {visible.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.type === 'limite' ? 'límite' : 'objetivo'}</option>)}
      </select>
    </div>
  )
}
