'use client'

import { useState, useEffect } from 'react'
import { Portal } from '@/components/ui/Portal'
import { apiClient } from '@/lib/api-client'

export interface ServiceType {
  id:              string
  name:            string
  description:     string | null
  durationMinutes: number
  price:           number | null
  color:           string | null
  isActive:        boolean
  branchId:        string | null
  branch:          { id: string; name: string } | null
  professionals:   Array<{ id: string; name: string; module: string }>
  appointmentCount: number
}

interface Branch { id: string; name: string }
interface User   { id: string; name: string; role: string; module: string; isActive: boolean }

interface Props {
  mode:     'create' | 'edit'
  service?: ServiceType
  branches: Branch[]
  onClose:  () => void
  onSuccess:(s: ServiceType) => void
}

export function ServiceFormModal({ mode, service, branches, onClose, onSuccess }: Props) {
  const [name,            setName]            = useState(service?.name ?? '')
  const [description,     setDescription]     = useState(service?.description ?? '')
  const [durationMinutes, setDurationMinutes] = useState(service?.durationMinutes ?? 30)
  const [price,           setPrice]           = useState(service?.price != null ? String(service.price) : '')
  const [color,           setColor]           = useState(service?.color ?? '')
  const [branchId,        setBranchId]        = useState(service?.branchId ?? '')
  const [isActive,        setIsActive]        = useState(service?.isActive ?? true)
  const [professionalIds, setProfessionalIds] = useState<string[]>(
    service?.professionals.map((p) => p.id) ?? [],
  )

  const [users,      setUsers]      = useState<User[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Load users for professional assignment (only TENANT_ADMIN can do this anyway)
  useEffect(() => {
    apiClient.get<{ data: User[] }>('/v1/users?limit=100')
      .then((res) => {
        const agendaUsers = (res.data ?? []).filter(
          (u) => u.isActive && u.module === 'AGENDA',
        )
        setUsers(agendaUsers)
      })
      .catch(() => {})
  }, [])

  function toggleProfessional(id: string) {
    setProfessionalIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const body: Record<string, unknown> = {
      name:            name.trim(),
      durationMinutes: Number(durationMinutes),
      professionalIds,
    }
    if (description.trim()) body.description = description.trim()
    if (price !== '')       body.price       = Number(price)
    if (color)              body.color       = color
    if (branchId)           body.branchId    = branchId
    if (mode === 'edit')    body.isActive    = isActive

    try {
      const saved = mode === 'create'
        ? await apiClient.post<ServiceType>('/v1/agenda/services', body)
        : await apiClient.put<ServiceType>(`/v1/agenda/services/${service!.id}`, body)
      onSuccess(saved)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e.message ?? 'Error al guardar el servicio')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white'

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-800 dark:ring-slate-700">

          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-700">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {mode === 'create' ? 'Nuevo servicio' : 'Editar servicio'}
            </h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition-colors dark:hover:bg-slate-700"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="13" y2="13" /><line x1="13" y1="1" x2="1" y2="13" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-4">

              {/* Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Nombre *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Ej. Corte de cabello"
                  className={inputCls}
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Descripción</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Descripción breve del servicio…"
                  maxLength={500}
                  className={inputCls + ' resize-none'}
                />
              </div>

              {/* Duration + Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Duración (min) *
                  </label>
                  <input
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    required
                    min={5}
                    max={480}
                    step={5}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Precio (opcional)
                  </label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    min={0}
                    step={0.01}
                    placeholder="0.00"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Branch + Color */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Sucursal (vacío = global)
                  </label>
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
                    <option value="">Todas las sucursales</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Color en calendario
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={color || '#3b82f6'}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-9 w-14 cursor-pointer rounded-lg border border-slate-200 p-1 dark:border-slate-700"
                    />
                    {color && (
                      <button
                        type="button"
                        onClick={() => setColor('')}
                        className="text-xs text-slate-400 hover:text-slate-600"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Active toggle (edit only) */}
              {mode === 'edit' && (
                <div className="flex items-center justify-between rounded-lg border border-slate-100 p-3 dark:border-slate-700">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Servicio activo</span>
                  <button
                    type="button"
                    onClick={() => setIsActive(!isActive)}
                    className={[
                      'relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors',
                      isActive ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-600',
                    ].join(' ')}
                  >
                    <span className={[
                      'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                      isActive ? 'translate-x-4' : 'translate-x-0.5',
                    ].join(' ')} />
                  </button>
                </div>
              )}

              {/* Professionals */}
              {users.length > 0 && (
                <div>
                  <label className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Profesionales asignados (vacío = sin restricción)
                  </label>
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-100 p-2 dark:border-slate-700">
                    {users.map((u) => (
                      <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <input
                          type="checkbox"
                          checked={professionalIds.includes(u.id)}
                          onChange={() => toggleProfessional(u.id)}
                          className="accent-blue-600"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">{u.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>

            {/* Footer */}
            <div className="flex gap-3 border-t border-slate-100 px-6 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {submitting ? 'Guardando…' : mode === 'create' ? 'Crear servicio' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  )
}
