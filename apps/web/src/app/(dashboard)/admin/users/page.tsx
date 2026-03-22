'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { SkeletonRows } from '@/components/ui/SkeletonRows'
import { getCache, setCache } from '@/lib/page-cache'
import { Portal } from '@/components/ui/Portal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type UserRole   = 'TENANT_ADMIN' | 'BRANCH_ADMIN' | 'AREA_MANAGER' | 'OPERATIVE'
type ModuleName = 'ARI' | 'NIRA' | 'KIRA' | 'AGENDA' | 'VERA'

interface Branch { id: string; name: string }

interface User {
  id:          string
  email:       string
  name:        string
  role:        UserRole
  module:      ModuleName | null
  isActive:    boolean
  lastLoginAt: string | null
  createdAt:   string
  branch:      { id: string; name: string } | null
}

const ROLE_LABELS: Record<UserRole, string> = {
  TENANT_ADMIN: 'Admin Empresa',
  BRANCH_ADMIN: 'Admin Sucursal',
  AREA_MANAGER: 'Jefe de Area',
  OPERATIVE:    'Operativo',
}

const MODULE_LABELS: Record<ModuleName, string> = {
  ARI:    'Ventas',
  NIRA:   'Compras',
  KIRA:   'Inventario',
  AGENDA: 'Agenda',
  VERA:   'Finanzas',
}

// ─── Modal usuario ─────────────────────────────────────────────────────────────

interface UserModalProps {
  user:      User | null   // null → crear
  branches:  Branch[]
  onClose:   () => void
  onSuccess: (u: User) => void
}

function UserModal({ user, branches, onClose, onSuccess }: UserModalProps) {
  const isEdit = user !== null
  const [form, setForm] = useState({
    name:     user?.name             ?? '',
    email:    user?.email            ?? '',
    password: '',
    role:     (user?.role            ?? 'OPERATIVE') as UserRole,
    module:   (user?.module          ?? '') as ModuleName | '',
    branchId: user?.branch?.id       ?? '',
    isActive: user?.isActive         ?? true,
  })
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  const needsModule = form.role === 'AREA_MANAGER' || form.role === 'OPERATIVE'
  const needsBranch = form.role !== 'TENANT_ADMIN'

  function set<K extends keyof typeof form>(k: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('El nombre es requerido'); return }
    if (!isEdit && !form.email.trim()) { setError('El email es requerido'); return }
    if (!isEdit && form.password.length < 8) { setError('La contrasena debe tener al menos 8 caracteres'); return }
    if (needsModule && !form.module) { setError('Selecciona un modulo para este rol'); return }
    setError(''); setSaving(true)

    try {
      const body: Record<string, unknown> = {
        name:     form.name.trim(),
        role:     form.role,
        module:   needsModule ? form.module || undefined : null,
        branchId: needsBranch && form.branchId ? form.branchId : null,
      }
      if (!isEdit) {
        body['email']    = form.email.trim()
        body['password'] = form.password
      } else {
        body['isActive'] = form.isActive
        if (form.password) body['password'] = form.password
      }

      const saved = isEdit
        ? await apiClient.put<User>(`/v1/users/${user.id}`, body)
        : await apiClient.post<User>('/v1/users', body)
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
            {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <form id="user-form" onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Nombre *</label>
            <input
              value={form.name} onChange={set('name')} required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Ana García"
            />
          </div>

          {!isEdit && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Email *</label>
              <input
                type="email" value={form.email} onChange={set('email')} required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="ana@empresa.com"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              {isEdit ? 'Nueva contrasena (opcional)' : 'Contrasena *'}
            </label>
            <input
              type="password" value={form.password} onChange={set('password')}
              required={!isEdit} minLength={8}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder={isEdit ? 'Dejar en blanco para no cambiar' : 'Mínimo 8 caracteres'}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Rol *</label>
            <select
              value={form.role} onChange={set('role')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {needsModule && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Modulo *</label>
              <select
                value={form.module} onChange={set('module')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Seleccionar modulo…</option>
                {(Object.entries(MODULE_LABELS) as [ModuleName, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          )}

          {needsBranch && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Sucursal</label>
              <select
                value={form.branchId} onChange={set('branchId')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Sin asignar</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          {isEdit && (
            <div className="flex items-center gap-2">
              <input
                id="isActive"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <label htmlFor="isActive" className="text-sm text-slate-700">Usuario activo</label>
            </div>
          )}
        </form>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit" form="user-form" disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}

// ─── Badge de rol ─────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: UserRole }) {
  const colors: Record<UserRole, string> = {
    TENANT_ADMIN: 'bg-purple-100 text-purple-700',
    BRANCH_ADMIN: 'bg-blue-100 text-blue-700',
    AREA_MANAGER: 'bg-amber-100 text-amber-700',
    OPERATIVE:    'bg-slate-100 text-slate-600',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const { user: me } = useAuthStore()
  const [users, setUsers]       = useState<User[]>(() => getCache<User[]>('admin-users') ?? [])
  const [branches, setBranches] = useState<Branch[]>(() => getCache<Branch[]>('branches') ?? [])
  const [loading, setLoading]   = useState(!getCache<User[]>('admin-users'))
  const [search, setSearch]     = useState('')
  const [modal, setModal]       = useState<{ open: boolean; user: User | null }>({ open: false, user: null })

  function load(silent = false) {
    if (!silent) setLoading(true)
    Promise.all([
      apiClient.get<{ data: User[] }>('/v1/users?limit=100'),
      apiClient.get<{ data: Branch[] }>('/v1/branches'),
    ])
      .then(([u, b]) => {
        setUsers(u.data); setBranches(b.data)
        setCache('admin-users', u.data); setCache('branches', b.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(!!getCache<User[]>('admin-users')) }, [])

  function handleSuccess(saved: User) {
    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = saved; return next
      }
      return [saved, ...prev]
    })
    setModal({ open: false, user: null })
  }

  const filtered = users.filter((u) =>
    !search ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="mx-auto max-w-5xl p-6">

      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Usuarios</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {loading ? 'Cargando…' : `${users.length} usuario${users.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o email…"
            className="w-64 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={() => setModal({ open: true, user: null })}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Nuevo usuario
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
              <th className="px-5 py-3 text-left font-medium">Usuario</th>
              <th className="px-5 py-3 text-left font-medium">Rol</th>
              <th className="px-5 py-3 text-left font-medium">Sucursal</th>
              <th className="px-5 py-3 text-left font-medium">Estado</th>
              <th className="px-5 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <SkeletonRows rows={6} cols={5} px="px-5" />
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="py-16 text-center text-sm text-slate-400">
                {search ? 'Sin resultados' : 'No hay usuarios'}
              </td></tr>
            ) : (
              filtered.map((u) => {
                const isSelf = u.id === me?.id
                return (
                  <tr key={u.id} className={u.isActive ? '' : 'opacity-50'}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{u.name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{u.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      <RoleBadge role={u.role} />
                      {u.module && (
                        <span className="ml-1.5 text-xs text-slate-400">
                          {MODULE_LABELS[u.module]}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {u.branch?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={[
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
                      ].join(' ')}>
                        {u.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {isSelf ? (
                        <span className="text-xs text-slate-400">Tu cuenta</span>
                      ) : (
                        <button
                          onClick={() => setModal({ open: true, user: u })}
                          className="rounded-md px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal.open && (
        <UserModal
          user={modal.user}
          branches={branches}
          onClose={() => setModal({ open: false, user: null })}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}
