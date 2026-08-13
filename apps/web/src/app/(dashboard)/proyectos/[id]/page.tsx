'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { ProjectFormModal, type Project } from '@/components/proyectos/ProjectFormModal'
import { money, StatusBadge, TypeBadge, ProgressBar } from '@/components/proyectos/util'

interface AssignedTx {
  id: string; type: 'income' | 'expense'; amount: number; description: string
  date: string; referenceType: string | null; category: string | null
  assignmentStatus: 'assigned' | 'pending' | 'over_limit' | null
}
interface PendingApproval { id: string; amount: number; dueAt: string; createdAt: string }
interface ProjectDetail extends Project {
  transactions: AssignedTx[]
  pendingApprovals: PendingApproval[]
  overLimit: boolean
}

const fmtDate = (iso: string): string =>
  iso ? new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso)) : '—'

export default function ProyectoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const isManager = user?.role !== 'OPERATIVE'
  const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'BRANCH_ADMIN'

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

  // HU-199 — quitar la asignación de una transacción (no la borra, solo la desvincula).
  async function unassign(txId: string) {
    if (!confirm('¿Quitar esta transacción del proyecto? El monto dejará de contar en el avance.')) return
    try {
      await apiClient.patch(`/v1/proyectos/transacciones/${txId}`, { projectId: null })
      load()
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo quitar la asignación.')
    }
  }

  // HU-200 — resolver un sobregasto EN ESPERA (solo admins del tenant).
  const [busy, setBusy] = useState(false)
  async function resolve(approvalId: string, action: 'approve' | 'reject' | 'increase_tope') {
    let newTope: number | undefined
    if (action === 'increase_tope') {
      const cur = project?.progress.target ?? 0
      const input = prompt(`Nuevo tope (mayor a ${cur}):`, String(cur))
      if (input == null) return
      newTope = Number(input)
      if (!(newTope > cur)) { setErr('El nuevo tope debe ser mayor al actual.'); return }
    } else if (action === 'reject') {
      if (!confirm('¿Rechazar la asignación? El gasto queda registrado en VERA, pero fuera de este proyecto.')) return
    }
    setBusy(true); setErr(null)
    try {
      await apiClient.post(`/v1/proyectos/aprobaciones/${approvalId}/resolver`, { action, newTope })
      load()
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo resolver el sobregasto.')
    } finally { setBusy(false) }
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

      {/* HU-200 — indicador SOBRE-LÍMITE */}
      {project.overLimit && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <span className="font-semibold">SOBRE-LÍMITE:</span> este proyecto superó su tope. El exceso quedó asignado con trazabilidad (el gasto ya estaba en VERA; no se borra).
        </div>
      )}

      {/* HU-200 — sobregastos EN ESPERA de aprobación */}
      {project.pendingApprovals.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/15">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">En espera de aprobación ({project.pendingApprovals.length})</span>
          </div>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300/80">
            Superan el tope. El gasto ya está en VERA; su asignación al proyecto está EN ESPERA. {isAdmin ? 'Como admin, puedes resolver:' : 'Un administrador debe resolver.'}
          </p>
          <div className="mt-3 space-y-2">
            {project.pendingApprovals.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2 dark:bg-slate-800/60">
                <div className="text-sm text-slate-800 dark:text-slate-200">
                  {money(a.amount)} <span className="text-xs text-slate-400">· vence {fmtDate(a.dueAt)}</span>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button disabled={busy} onClick={() => resolve(a.id, 'approve')} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Aprobar (exceso)</button>
                    <button disabled={busy} onClick={() => resolve(a.id, 'increase_tope')} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Aumentar tope</button>
                    <button disabled={busy} onClick={() => resolve(a.id, 'reject')} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300">Rechazar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Transacciones asignadas (HU-199) */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Transacciones asignadas</h2>
          <span className="text-xs text-slate-400">{project.transactions.length} · suma {money(pr.current)}</span>
        </div>
        {project.transactions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Aún no hay transacciones asignadas. Asigna compras, ventas, gastos o alquileres a este proyecto
            desde su formulario de registro (campo «Proyecto») para que su monto cuente en el {isLimit ? 'consumo' : 'avance'}.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-700">
            {project.transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-800 dark:text-slate-200">
                    {t.description}
                    {t.assignmentStatus === 'pending' && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">en espera</span>}
                    {t.assignmentStatus === 'over_limit' && <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">sobre-límite</span>}
                  </p>
                  <p className="text-xs text-slate-400">{fmtDate(t.date)}{t.category ? ` · ${t.category}` : ''}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`text-sm font-medium ${t.assignmentStatus === 'pending' ? 'text-amber-500' : t.type === 'income' ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-200'}`}>
                    {t.type === 'income' ? '+' : '−'}{money(t.amount)}
                  </span>
                  {isManager && (
                    <button onClick={() => unassign(t.id)} className="text-xs text-slate-400 hover:text-red-600" title="Quitar del proyecto">Quitar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {edit && <ProjectFormModal project={project} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load() }} />}
    </div>
  )
}
