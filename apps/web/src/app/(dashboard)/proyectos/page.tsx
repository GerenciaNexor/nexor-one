'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { ProjectFormModal, type Project } from '@/components/proyectos/ProjectFormModal'
import { money, StatusBadge, TypeBadge, ProgressBar } from '@/components/proyectos/util'

const STATUS_FILTERS = [
  { value: '',          label: 'Todos' },
  { value: 'activo',    label: 'Activos' },
  { value: 'en_curso',  label: 'En curso' },
  { value: 'terminado', label: 'Terminados' },
  { value: 'cancelado', label: 'Cancelados' },
]

export default function ProyectosPage() {
  const user = useAuthStore((s) => s.user)
  const isManager = user?.role !== 'OPERATIVE'

  const [projects, setProjects] = useState<Project[] | null>(null)
  const [status, setStatus]     = useState('')
  const [err, setErr]           = useState<string | null>(null)
  const [modal, setModal]       = useState(false)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const qs = status ? `?status=${status}` : ''
      const res = await apiClient.get<{ data: Project[]; total: number }>(`/v1/proyectos${qs}`)
      setProjects(res.data)
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudieron cargar los proyectos.')
      setProjects([])
    }
  }, [status])

  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Proyectos</h1>
          <p className="mt-0.5 text-sm text-slate-500">Metas (objetivo) y presupuestos (límite) por línea de negocio, con su avance y estado.</p>
        </div>
        {isManager && (
          <button onClick={() => setModal(true)} className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            + Nuevo proyecto
          </button>
        )}
      </div>

      {/* Filtro por estado */}
      <div className="mt-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button key={f.value} onClick={() => setStatus(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${status === f.value ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {err && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{err}</p>}

      {projects === null ? (
        <div className="mt-6 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}</div>
      ) : projects.length === 0 && !err ? (
        <div className="mt-10 rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <p className="text-sm text-slate-500">Aún no hay proyectos.</p>
          {isManager && <button onClick={() => setModal(true)} className="mt-3 text-sm font-medium text-blue-600 hover:underline">Crear el primero</button>}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/proyectos/${p.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-900 dark:text-slate-100">{p.name}</span>
                    <TypeBadge type={p.type} />
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {p.type === 'limite' ? 'Consumo' : 'Avance'}: {money(p.progress.current)} de {money(p.progress.target)} ({p.progress.pct}%)
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-slate-400">
                  {p.type === 'limite'
                    ? (p.progress.exceeded ? <span className="font-medium text-red-600">Excedido</span>
                        : p.progress.alertReached ? <span className="font-medium text-amber-600">En aviso</span>
                        : <span>Cupo: {money(p.progress.remaining)}</span>)
                    : (p.progress.reached ? <span className="font-medium text-emerald-600">Meta lograda</span>
                        : <span>Falta: {money(p.progress.remaining)}</span>)}
                </div>
              </div>
              <div className="mt-3"><ProgressBar project={p} /></div>
            </Link>
          ))}
        </div>
      )}

      {modal && <ProjectFormModal onClose={() => setModal(false)} onSaved={() => { setModal(false); load() }} />}
    </div>
  )
}
