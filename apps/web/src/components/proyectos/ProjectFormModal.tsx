'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'

export type ProjectType   = 'objetivo' | 'limite'
export type ProjectStatus = 'activo' | 'en_curso' | 'terminado' | 'cancelado'

export interface Project {
  id:           string
  name:         string
  description:  string | null
  type:         ProjectType
  targetAmount: number | string
  alertAmount:  number | string | null
  alertPct:     number | null
  graceDays:    number | null
  startDate:    string
  endDate:      string
  status:       ProjectStatus
  createdBy:    string | null
  createdAt:    string
  updatedAt:    string
  progress: {
    current: number; target: number; pct: number; remaining: number
    reached: boolean; exceeded: boolean; alertAt: number | null; alertReached: boolean
  }
}

export const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'activo',     label: 'Activo' },
  { value: 'en_curso',   label: 'En curso' },
  { value: 'terminado',  label: 'Terminado' },
  { value: 'cancelado',  label: 'Cancelado' },
]

const asDate = (iso: string): string => (iso ? iso.slice(0, 10) : '')
const todayStr = (): string => new Date().toISOString().slice(0, 10)

export function ProjectFormModal({ project, onClose, onSaved }: {
  project?: Project | null
  onClose:  () => void
  onSaved:  () => void
}) {
  const isEdit = !!project
  const [name, setName]         = useState(project?.name ?? '')
  const [description, setDesc]  = useState(project?.description ?? '')
  const [type, setType]         = useState<ProjectType>(project?.type ?? 'objetivo')
  const [target, setTarget]     = useState(project ? String(project.progress.target) : '')
  const [startDate, setStart]   = useState(project ? asDate(project.startDate) : todayStr())
  const [endDate, setEnd]       = useState(project ? asDate(project.endDate) : '')
  const [status, setStatus]     = useState<ProjectStatus>(project?.status ?? 'activo')
  // Umbral de aviso (solo límite): modo monto o %.
  const initAlatMode: 'amount' | 'pct' = project?.alertPct != null ? 'pct' : 'amount'
  const [alertMode, setAlertMode] = useState<'amount' | 'pct'>(initAlatMode)
  const [alertValue, setAlertValue] = useState(
    project?.alertPct != null ? String(project.alertPct)
      : project?.progress.alertAt != null ? String(project.progress.alertAt) : '',
  )
  const [graceDays, setGraceDays] = useState(project?.graceDays != null ? String(project.graceDays) : '')

  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  async function submit() {
    setErr(null)
    if (!name.trim())      { setErr('El nombre es obligatorio.'); return }
    const targetNum = Number(target)
    if (!(targetNum > 0))  { setErr('La meta debe ser un número mayor a 0.'); return }
    if (!startDate || !endDate) { setErr('Indica las fechas de inicio y fin.'); return }
    if (endDate < startDate)    { setErr('La fecha de fin no puede ser anterior a la de inicio.'); return }

    const body: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
      type,
      targetAmount: targetNum,
      startDate,
      endDate,
      status,
      alertAmount: null,
      alertPct: null,
      graceDays: type === 'limite' && graceDays.trim() ? Math.max(1, Math.min(30, Math.round(Number(graceDays)))) : null,
    }
    if (type === 'limite' && alertValue.trim()) {
      const v = Number(alertValue)
      if (!(v > 0)) { setErr('El umbral de aviso debe ser mayor a 0.'); return }
      if (alertMode === 'pct') {
        if (v > 100) { setErr('El umbral % debe estar entre 1 y 100.'); return }
        body['alertPct'] = Math.round(v)
      } else {
        if (v > targetNum) { setErr('El umbral de aviso no puede superar el límite.'); return }
        body['alertAmount'] = v
      }
    }

    setSaving(true)
    try {
      if (isEdit) await apiClient.put(`/v1/proyectos/${project!.id}`, body)
      else        await apiClient.post('/v1/proyectos', body)
      onSaved()
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo guardar el proyecto.')
    } finally { setSaving(false) }
  }

  const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
  const lbl = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400'

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{isEdit ? 'Editar proyecto' : 'Nuevo proyecto'}</h3>
          <p className="mt-0.5 text-xs text-slate-500">Una línea de negocio con una meta cuantificada: un objetivo a superar o un límite a controlar.</p>

          <div className="mt-4 space-y-3">
            <div>
              <label className={lbl}>Nombre *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="Ej: Ventas de ferretería, Costos de la empresa…" />
            </div>

            {/* Tipo */}
            <div>
              <label className={lbl}>Tipo *</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setType('objetivo')}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${type === 'objetivo' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}>
                  <span className="block font-semibold">Objetivo</span>
                  <span className="block text-[11px] opacity-80">Meta mínima a alcanzar/superar</span>
                </button>
                <button type="button" onClick={() => setType('limite')}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${type === 'limite' ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}>
                  <span className="block font-semibold">Límite</span>
                  <span className="block text-[11px] opacity-80">Techo a no exceder (con aviso)</span>
                </button>
              </div>
            </div>

            <div>
              <label className={lbl}>{type === 'limite' ? 'Límite (monto) *' : 'Meta (monto) *'}</label>
              <input type="number" min="0" step="any" value={target} onChange={(e) => setTarget(e.target.value)} className={inp} placeholder="Ej: 50000000" />
            </div>

            {/* Umbral de aviso — solo límite */}
            {type === 'limite' && (
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <label className={lbl}>Umbral de aviso (opcional)</label>
                <div className="flex gap-2">
                  <select value={alertMode} onChange={(e) => setAlertMode(e.target.value as 'amount' | 'pct')} className={`${inp} w-28`}>
                    <option value="amount">Monto</option>
                    <option value="pct">%</option>
                  </select>
                  <input type="number" min="0" step="any" value={alertValue} onChange={(e) => setAlertValue(e.target.value)} className={inp}
                    placeholder={alertMode === 'pct' ? 'Ej: 90' : 'Ej: 18000000'} />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Avisar al acercarse al límite (p. ej. al llegar al 90% o a $18M).</p>
                <div className="mt-3">
                  <label className={lbl}>Plazo de aprobación del sobregasto (días)</label>
                  <input type="number" min="1" max="30" step="1" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} className={inp} placeholder="2 (por defecto)" />
                  <p className="mt-1 text-[11px] text-slate-400">Si al superar el tope nadie resuelve en este plazo, el exceso entra igual (sobre-límite) con trazabilidad.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Inicio *</label>
                <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className={inp} />
              </div>
              <div>
                <label className={lbl}>Fin *</label>
                <input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} className={inp} />
              </div>
            </div>

            <div>
              <label className={lbl}>Estado</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} className={inp}>
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            <div>
              <label className={lbl}>Descripción (opcional)</label>
              <textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={2} className={`${inp} resize-none`} placeholder="Detalle del proyecto…" />
            </div>

            {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
            <button onClick={submit} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear proyecto'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
