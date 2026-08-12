'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { ProjectFormModal, type Project } from '@/components/proyectos/ProjectFormModal'
import { money, StatusBadge, TypeBadge, ProgressBar } from '@/components/proyectos/util'

interface ProjectDetail extends Project { transactions: unknown[] }

const fmtDate = (iso: string): string =>
  iso ? new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso)) : '—'

export default function ProyectoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const isManager = user?.role !== 'OPERATIVE'

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [err, setErr]     = useState<string | null>(null)
  const [edit, setEdit]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const res = await apiClient.get<{ success: boolean; data: ProjectDetail }>(`/v1/proyectos/${id}`)
      setProject(res.data)
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo cargar el proyecto.')
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function remove() {
    if (!confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')) return
    setDeleting(true)
    try {
      await apiClient.delete(`/v1/proyectos/${id}`)
      router.push('/proyectos')
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo eliminar.')
      setDeleting(false)
    }
  }

  if (err) return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/proyectos" className="text-sm text-blue-600 hover:underline">← Proyectos</Link>
      <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{err}</p>
    </div>
  )
  if (!project) return <div className="mx-auto max-w-3xl p-6"><div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></div>

  const pr = project.progress
  const isLimit = project.type === 'limite'

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/proyectos" className="text-sm text-blue-600 hover:underline">← Proyectos</Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{project.name}</h1>
            <TypeBadge type={project.type} />
            <StatusBadge status={project.status} />
          </div>
          {project.description && <p className="mt-1 max-w-prose text-sm text-slate-500">{project.description}</p>}
        </div>
        {isManager && (
          <div className="flex shrink-0 gap-2">
            <button onClick={() => setEdit(true)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Editar</button>
            <button onClick={remove} disabled={deleting} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400">Eliminar</button>
          </div>
        )}
      </div>

      {/* Avance / consumo */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-slate-500">{isLimit ? 'Consumo' : 'Avance'}</p>
            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{money(pr.current)}</p>
            <p className="text-xs text-slate-400">de {money(pr.target)} · {isLimit ? 'límite' : 'meta'}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{pr.pct}%</p>
            <p className="text-xs text-slate-400">
              {isLimit
                ? (pr.exceeded ? <span className="font-medium text-red-600">Límite excedido</span>
                    : pr.alertReached ? <span className="font-medium text-amber-600">Umbral de aviso alcanzado</span>
                    : `Cupo restante: ${money(pr.remaining)}`)
                : (pr.reached ? <span className="font-medium text-emerald-600">Meta lograda</span> : `Falta: ${money(pr.remaining)}`)}
            </p>
          </div>
        </div>
        <div className="mt-3"><ProgressBar project={project} /></div>
        {isLimit && pr.alertAt != null && (
          <p className="mt-2 text-xs text-slate-400">Umbral de aviso configurado en {money(pr.alertAt)}{project.alertPct != null ? ` (${project.alertPct}%)` : ''}.</p>
        )}
      </div>

      {/* Datos */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { l: 'Tipo',   v: isLimit ? 'Límite' : 'Objetivo' },
          { l: isLimit ? 'Límite' : 'Meta', v: money(pr.target) },
          { l: 'Inicio', v: fmtDate(project.startDate) },
          { l: 'Fin',    v: fmtDate(project.endDate) },
        ].map((d) => (
          <div key={d.l} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{d.l}</p>
            <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100">{d.v}</p>
          </div>
        ))}
      </div>

      {/* Transacciones asignadas — se conectan en HU-199 */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Transacciones asignadas</h2>
        {project.transactions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Todavía no hay transacciones asignadas a este proyecto. La asignación de transacciones (que alimenta el avance/consumo) se habilita próximamente.</p>
        ) : (
          <p className="mt-2 text-sm text-slate-500">{project.transactions.length} transacción(es).</p>
        )}
      </div>

      {edit && <ProjectFormModal project={project} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load() }} />}
    </div>
  )
}
