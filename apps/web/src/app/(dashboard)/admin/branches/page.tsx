'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { SkeletonRows } from '@/components/ui/SkeletonRows'
import { getCache, setCache } from '@/lib/page-cache'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Branch {
  id:        string
  name:      string
  city:      string | null
  address:   string | null
  phone:     string | null
  isActive:  boolean
  createdAt: string
}

// ─── Modal crear / editar sucursal ────────────────────────────────────────────

interface BranchModalProps {
  branch:    Branch | null   // null → crear
  onClose:   () => void
  onSuccess: (b: Branch) => void
}

function BranchModal({ branch, onClose, onSuccess }: BranchModalProps) {
  const isEdit = branch !== null
  const [form, setForm] = useState({
    name:    branch?.name    ?? '',
    city:    branch?.city    ?? '',
    address: branch?.address ?? '',
    phone:   branch?.phone   ?? '',
  })
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)

  function field(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('El nombre es requerido'); return }
    setError(''); setSaving(true)
    try {
      const body = {
        name:    form.name.trim(),
        city:    form.city.trim()    || undefined,
        address: form.address.trim() || undefined,
        phone:   form.phone.trim()   || undefined,
      }
      const saved = isEdit
        ? await apiClient.put<Branch>(`/v1/branches/${branch.id}`, body)
        : await apiClient.post<Branch>('/v1/branches', body)
      onSuccess(saved)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e.message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {isEdit ? 'Editar sucursal' : 'Nueva sucursal'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <form id="branch-form" onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Nombre *</label>
            <input
              value={form.name} onChange={field('name')} required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              placeholder="Sede Principal"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Ciudad</label>
            <input
              value={form.city} onChange={field('city')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              placeholder="Bogotá"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Direccion</label>
            <input
              value={form.address} onChange={field('address')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              placeholder="Calle 123 #45-67"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Telefono</label>
            <input
              value={form.phone} onChange={field('phone')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              placeholder="+57 300 000 0000"
            />
          </div>
        </form>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit" form="branch-form" disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear sucursal'}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AdminBranchesPage() {
  const [branches, setBranches] = useState<Branch[]>(() => getCache<Branch[]>('branches') ?? [])
  const [loading, setLoading]   = useState(!getCache<Branch[]>('branches'))
  const [modal, setModal]       = useState<{ open: boolean; branch: Branch | null }>({ open: false, branch: null })
  const [toggling, setToggling] = useState<string | null>(null)

  function load(silent = false) {
    if (!silent) setLoading(true)
    apiClient.get<{ data: Branch[] }>('/v1/branches')
      .then((r) => { setBranches(r.data); setCache('branches', r.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(!!getCache<Branch[]>('branches')) }, [])

  function handleSuccess(saved: Branch) {
    setBranches((prev) => {
      const idx = prev.findIndex((b) => b.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = saved; return next
      }
      return [saved, ...prev]
    })
    setModal({ open: false, branch: null })
  }

  async function toggleActive(b: Branch) {
    setToggling(b.id)
    try {
      const updated = await apiClient.put<Branch>(`/v1/branches/${b.id}`, { isActive: !b.isActive })
      setBranches((prev) => prev.map((x) => x.id === updated.id ? updated : x))
    } catch {
      // ignore
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">

      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sucursales</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {loading ? 'Cargando…' : `${branches.length} sucursal${branches.length !== 1 ? 'es' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setModal({ open: true, branch: null })}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Nueva sucursal
        </button>
      </div>

      {/* Cards (mobile) */}
      <div className="mt-5 sm:hidden overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {loading ? (
          <div className="p-4 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-3.5 w-2/3 rounded bg-slate-200" />
                <div className="h-3 w-1/2 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : branches.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No hay sucursales</p>
        ) : (
          branches.map((b) => (
            <div key={b.id} className={`px-4 py-4 ${b.isActive ? '' : 'opacity-50'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{b.name}</p>
                  {b.address && <p className="mt-0.5 text-xs text-slate-400 truncate">{b.address}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    {b.city && <span>{b.city}</span>}
                    {b.phone && <span>{b.phone}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={[
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                    b.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
                  ].join(' ')}>
                    {b.isActive ? 'Activa' : 'Inactiva'}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setModal({ open: true, branch: b })}
                      className="rounded-md px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleActive(b)}
                      disabled={toggling === b.id}
                      className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {toggling === b.id ? '…' : b.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tabla (desktop) */}
      <div className="mt-5 hidden sm:block overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
              <th className="px-5 py-3 text-left font-medium">Nombre</th>
              <th className="px-5 py-3 text-left font-medium">Ciudad</th>
              <th className="px-5 py-3 text-left font-medium">Telefono</th>
              <th className="px-5 py-3 text-left font-medium">Estado</th>
              <th className="px-5 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <SkeletonRows rows={4} cols={5} px="px-5" />
            ) : branches.length === 0 ? (
              <tr><td colSpan={5} className="py-16 text-center text-sm text-slate-400">No hay sucursales</td></tr>
            ) : (
              branches.map((b) => (
                <tr key={b.id} className={b.isActive ? '' : 'opacity-50'}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900">{b.name}</p>
                    {b.address && (
                      <p className="mt-0.5 text-xs text-slate-400">{b.address}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{b.city ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{b.phone ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={[
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      b.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
                    ].join(' ')}>
                      {b.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setModal({ open: true, branch: b })}
                        className="rounded-md px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleActive(b)}
                        disabled={toggling === b.id}
                        className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {toggling === b.id ? '…' : b.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal.open && (
        <BranchModal
          branch={modal.branch}
          onClose={() => setModal({ open: false, branch: null })}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}
