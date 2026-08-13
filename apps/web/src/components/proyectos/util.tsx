'use client'

import type { Project, ProjectStatus } from './ProjectFormModal'

export const money = (n: number): string =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

export const STATUS_META: Record<ProjectStatus, { label: string; cls: string }> = {
  activo:    { label: 'Activo',    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  en_curso:  { label: 'En curso',  cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  terminado: { label: 'Terminado', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  cancelado: { label: 'Cancelado', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.activo
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}>{m.label}</span>
}

export function TypeBadge({ type }: { type: Project['type'] }) {
  const isObj = type === 'objetivo'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${isObj ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300'}`}>
      {isObj ? 'Objetivo' : 'Límite'}
    </span>
  )
}

/** Barra de avance (objetivo) / consumo (límite), con color según el estado del progreso. */
export function ProgressBar({ project }: { project: Project }) {
  const { pct, exceeded, alertReached, reached } = project.progress
  const isLimit = project.type === 'limite'
  const width = Math.min(Math.max(pct, 0), 100)
  const color = isLimit
    ? (exceeded ? 'bg-red-500' : alertReached ? 'bg-amber-500' : 'bg-teal-500')
    : (reached ? 'bg-emerald-500' : 'bg-blue-500')
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${width}%` }} />
    </div>
  )
}
