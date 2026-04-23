'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient }    from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Category {
  id:        string
  name:      string
  type:      'income' | 'expense' | 'both'
  color:     string | null
  isDefault: boolean
  isActive:  boolean
}

interface CostCenter {
  id:          string
  name:        string
  description: string | null
  isActive:    boolean
}

interface Budget {
  id:       string
  year:     number
  month:    number
  amount:   number
  currency: string
  branchId: string | null
  branch:   { id: string; name: string } | null
}

interface Branch { id: string; name: string }

type Tab = 'categories' | 'cost-centers' | 'budget'

// ── Helpers ────────────────────────────────────────────────────────────────────

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1)
    .toLocaleDateString('es', { month: 'long', year: 'numeric' })
}

const TYPE_LABELS: Record<string, string> = {
  income:  'Ingreso',
  expense: 'Egreso',
  both:    'Ambos',
}

const TYPE_BADGE: Record<string, string> = {
  income:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  expense: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  both:    'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
}

const ALLOWED_ROLES = ['TENANT_ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER']

const inputCls =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ' +
  'focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ' +
  'dark:border-slate-700 dark:bg-slate-900 dark:text-white'

// ── Modal shell ────────────────────────────────────────────────────────────────

function ModalShell({
  title, onClose, children,
}: {
  title:    string
  onClose:  () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-lg leading-none text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Toggle switch ──────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={[
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        value ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-600',
      ].join(' ')}
    >
      <span className={[
        'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
        value ? 'translate-x-6' : 'translate-x-1',
      ].join(' ')} />
    </button>
  )
}

// ── Category Modal ─────────────────────────────────────────────────────────────

function CategoryModal({
  cat, onClose, onSaved,
}: {
  cat?:    Category
  onClose: () => void
  onSaved: (c: Category) => void
}) {
  const isEdit = !!cat

  const [name,     setName]     = useState(cat?.name   ?? '')
  const [type,     setType]     = useState<'income' | 'expense' | 'both'>(cat?.type ?? 'income')
  const [color,    setColor]    = useState(cat?.color  ?? '#6366f1')
  const [isActive, setIsActive] = useState(cat?.isActive ?? true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      let result: Category
      if (isEdit) {
        const body: Record<string, unknown> = { name, color }
        if (!cat!.isDefault) body.isActive = isActive
        result = await apiClient.put<Category>(`/v1/vera/categories/${cat!.id}`, body)
      } else {
        result = await apiClient.post<Category>('/v1/vera/categories', { name, type, color })
      }
      onSaved(result)
      onClose()
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={isEdit ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 p-6">

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Nombre *</label>
          <input
            type="text" maxLength={100} required
            value={name} onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Type: solo en creación */}
        {!isEdit ? (
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-400">Tipo *</label>
            <div className="flex gap-2">
              {(['income', 'expense', 'both'] as const).map((t) => (
                <button
                  key={t} type="button"
                  onClick={() => setType(t)}
                  className={[
                    'flex-1 rounded-lg border-2 py-1.5 text-xs font-medium transition-colors',
                    type === t
                      ? TYPE_BADGE[t]
                      : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400',
                  ].join(' ')}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Tipo</label>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${TYPE_BADGE[cat!.type]}`}>
              {TYPE_LABELS[cat!.type]} (no editable)
            </span>
          </div>
        )}

        <div>
          <label className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-400">Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color" value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-16 cursor-pointer rounded-lg border border-slate-200 p-0.5 dark:border-slate-700"
            />
            <span className="font-mono text-sm text-slate-500 dark:text-slate-400">{color}</span>
          </div>
        </div>

        {isEdit && !cat!.isDefault && (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-700">
            <span className="text-sm text-slate-700 dark:text-slate-300">Activa</span>
            <Toggle value={isActive} onChange={setIsActive} />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button" onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancelar
          </button>
          <button
            type="submit" disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── CostCenter Modal ───────────────────────────────────────────────────────────

function CostCenterModal({
  cc, onClose, onSaved,
}: {
  cc?:     CostCenter
  onClose: () => void
  onSaved: (c: CostCenter) => void
}) {
  const isEdit = !!cc

  const [name,        setName]        = useState(cc?.name        ?? '')
  const [description, setDescription] = useState(cc?.description ?? '')
  const [isActive,    setIsActive]    = useState(cc?.isActive    ?? true)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      let result: CostCenter
      if (isEdit) {
        result = await apiClient.put<CostCenter>(`/v1/vera/cost-centers/${cc!.id}`, {
          name,
          description: description || null,
          isActive,
        })
      } else {
        result = await apiClient.post<CostCenter>('/v1/vera/cost-centers', {
          name,
          description: description || undefined,
        })
      }
      onSaved(result)
      onClose()
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Editar centro de costo' : 'Nuevo centro de costo'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Nombre *</label>
          <input
            type="text" maxLength={100} required
            value={name} onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Descripción
          </label>
          <textarea
            maxLength={500} rows={2}
            value={description} onChange={(e) => setDescription(e.target.value)}
            className={inputCls + ' resize-none'}
          />
        </div>

        {isEdit && (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-700">
            <span className="text-sm text-slate-700 dark:text-slate-300">Activo</span>
            <Toggle value={isActive} onChange={setIsActive} />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button" onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancelar
          </button>
          <button
            type="submit" disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Budget Modal ───────────────────────────────────────────────────────────────

function BudgetModal({
  budget, branches, onClose, onSaved,
}: {
  budget?:   Budget
  branches:  Branch[]
  onClose:   () => void
  onSaved:   (b: Budget) => void
}) {
  const isEdit        = !!budget
  const currentMonth  = new Date().toISOString().slice(0, 7)
  const initMonth     = budget
    ? `${budget.year}-${String(budget.month).padStart(2, '0')}`
    : currentMonth

  const [monthStr,  setMonthStr]  = useState(initMonth)
  const [amount,    setAmount]    = useState(budget ? String(budget.amount) : '')
  const [branchId,  setBranchId]  = useState(budget?.branchId ?? '')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const [y, m] = monthStr.split('-').map(Number)
      let result: Budget
      if (isEdit) {
        result = await apiClient.put<Budget>(`/v1/vera/budgets/${budget!.id}`, {
          amount: parseFloat(amount),
        })
      } else {
        result = await apiClient.post<Budget>('/v1/vera/budgets', {
          year:     y,
          month:    m,
          amount:   parseFloat(amount),
          branchId: branchId || null,
        })
      }
      onSaved(result)
      onClose()
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Editar presupuesto' : 'Configurar presupuesto'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Mes *</label>
          <input
            type="month"
            value={monthStr}
            onChange={(e) => setMonthStr(e.target.value)}
            min={isEdit ? undefined : currentMonth}
            disabled={isEdit}
            required
            className={inputCls + (isEdit ? ' cursor-not-allowed opacity-60' : '')}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Monto límite de egresos *
          </label>
          <input
            type="number" min="1" step="0.01" required
            value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={inputCls}
          />
        </div>

        {!isEdit && branches.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Sucursal
            </label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
              <option value="">Toda la empresa</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button" onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancelar
          </button>
          <button
            type="submit" disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Categories Section ─────────────────────────────────────────────────────────

function CategoriesSection() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState<'create' | Category | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    apiClient.get<{ data: Category[] }>('/v1/vera/categories')
      .then((res) => setCategories(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function handleSaved(cat: Category) {
    setCategories((prev) => {
      const idx = prev.findIndex((c) => c.id === cat.id)
      if (idx >= 0) return prev.map((c) => c.id === cat.id ? cat : c)
      return [...prev, cat]
    })
  }

  async function toggleActive(cat: Category) {
    try {
      const updated = await apiClient.put<Category>(
        `/v1/vera/categories/${cat.id}`,
        { isActive: !cat.isActive },
      )
      handleSaved(updated)
    } catch { /* silent */ }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Categorías</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Clasifica ingresos y egresos para los reportes
          </p>
        </div>
        <button
          onClick={() => setModal('create')}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          + Nueva
        </button>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {categories.map((cat) => (
            <div key={cat.id} className={[
              'flex items-center justify-between px-5 py-3',
              !cat.isActive ? 'opacity-50' : '',
            ].join(' ')}>
              <div className="flex items-center gap-3">
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: cat.color ?? '#94a3b8' }}
                />
                <div>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    {cat.name}
                  </span>
                  {cat.isDefault && (
                    <span className="ml-2 text-[10px] text-slate-400">predeterminada</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE[cat.type]}`}>
                  {TYPE_LABELS[cat.type]}
                </span>
                <button
                  onClick={() => setModal(cat)}
                  className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  title="Editar"
                >
                  ✎
                </button>
                {!cat.isDefault && (
                  <button
                    onClick={() => toggleActive(cat)}
                    className={[
                      'rounded px-2 py-0.5 text-xs transition-colors',
                      cat.isActive
                        ? 'text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30'
                        : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/30',
                    ].join(' ')}
                  >
                    {cat.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal === 'create' && (
        <CategoryModal onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
      {modal && modal !== 'create' && (
        <CategoryModal
          cat={modal as Category}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

// ── CostCenters Section ────────────────────────────────────────────────────────

function CostCentersSection() {
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState<'create' | CostCenter | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    apiClient.get<{ data: CostCenter[] }>('/v1/vera/cost-centers')
      .then((res) => setCostCenters(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function handleSaved(cc: CostCenter) {
    setCostCenters((prev) => {
      const idx = prev.findIndex((c) => c.id === cc.id)
      if (idx >= 0) return prev.map((c) => c.id === cc.id ? cc : c)
      return [...prev, cc]
    })
  }

  async function toggleActive(cc: CostCenter) {
    try {
      const updated = await apiClient.put<CostCenter>(
        `/v1/vera/cost-centers/${cc.id}`,
        { isActive: !cc.isActive },
      )
      handleSaved(updated)
    } catch { /* silent */ }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Centros de costo</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Agrupa transacciones por área o proyecto
          </p>
        </div>
        <button
          onClick={() => setModal('create')}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          + Nuevo
        </button>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : costCenters.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Sin centros de costo configurados</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {costCenters.map((cc) => (
            <div key={cc.id} className={[
              'flex items-center justify-between px-5 py-3',
              !cc.isActive ? 'opacity-50' : '',
            ].join(' ')}>
              <div>
                <span className="text-sm font-medium text-slate-900 dark:text-white">{cc.name}</span>
                {cc.description && (
                  <p className="max-w-sm truncate text-xs text-slate-400">{cc.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!cc.isActive && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                    Inactivo
                  </span>
                )}
                <button
                  onClick={() => setModal(cc)}
                  className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  title="Editar"
                >
                  ✎
                </button>
                <button
                  onClick={() => toggleActive(cc)}
                  className={[
                    'rounded px-2 py-0.5 text-xs transition-colors',
                    cc.isActive
                      ? 'text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30'
                      : 'text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/30',
                  ].join(' ')}
                >
                  {cc.isActive ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal === 'create' && (
        <CostCenterModal onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
      {modal && modal !== 'create' && (
        <CostCenterModal
          cc={modal as CostCenter}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

// ── Budget Section ─────────────────────────────────────────────────────────────

function BudgetSection() {
  const [budgets,   setBudgets]   = useState<Budget[]>([])
  const [branches,  setBranches]  = useState<Branch[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState<'create' | Budget | null>(null)
  const [deleteId,  setDeleteId]  = useState<string | null>(null)
  const [deleting,  setDeleting]  = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.allSettled([
      apiClient.get<{ data: Budget[] }>('/v1/vera/budgets'),
      apiClient.get<{ data: Branch[] }>('/v1/branches'),
    ]).then(([bdg, br]) => {
      if (bdg.status === 'fulfilled') setBudgets(bdg.value.data ?? [])
      if (br.status  === 'fulfilled') setBranches(br.value.data ?? [])
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function handleSaved(b: Budget) {
    setBudgets((prev) => {
      const idx = prev.findIndex((x) => x.id === b.id)
      if (idx >= 0) return prev.map((x) => x.id === b.id ? b : x)
      return [b, ...prev]
    })
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await apiClient.delete(`/v1/vera/budgets/${deleteId}`)
      setBudgets((prev) => prev.filter((b) => b.id !== deleteId))
      setDeleteId(null)
    } catch { /* silent */ }
    finally { setDeleting(false) }
  }

  const now = new Date()
  const isCurrentMonth = (b: Budget) =>
    b.year === now.getFullYear() && b.month === (now.getMonth() + 1)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Presupuestos mensuales</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Límite de egresos — alertas automáticas al 80% y al 100%
            </p>
          </div>
          <button
            onClick={() => setModal('create')}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            + Configurar
          </button>
        </div>

        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : budgets.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Sin presupuestos configurados.
            <br />
            <span className="text-xs">
              Las alertas se activan cuando configures un presupuesto mensual.
            </span>
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {budgets.map((b) => (
              <div
                key={b.id}
                className={[
                  'flex items-center justify-between px-5 py-3',
                  isCurrentMonth(b) ? 'bg-blue-50/50 dark:bg-blue-900/10' : '',
                ].join(' ')}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium capitalize text-slate-900 dark:text-white">
                      {monthLabel(b.year, b.month)}
                    </span>
                    {isCurrentMonth(b) && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        Mes actual
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {b.branch?.name ?? 'Toda la empresa'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                    {new Intl.NumberFormat('es-CO', {
                      style: 'currency', currency: b.currency ?? 'COP',
                      minimumFractionDigits: 0, maximumFractionDigits: 0,
                    }).format(Number(b.amount))}
                  </span>
                  <button
                    onClick={() => setModal(b)}
                    className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    title="Editar monto"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => setDeleteId(b.id)}
                    className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                    title="Eliminar"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal === 'create' && (
        <BudgetModal branches={branches} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
      {modal && modal !== 'create' && (
        <BudgetModal
          budget={modal as Budget}
          branches={branches}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteId(null)} />
          <div className="relative w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Eliminar presupuesto
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              El presupuesto será eliminado. Las transacciones y alertas previas no se verán afectadas.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete} disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main View ──────────────────────────────────────────────────────────────────

export function SettingsView() {
  const user      = useAuthStore((s) => s.user)
  const router    = useRouter()
  const canAccess = !!user?.role && ALLOWED_ROLES.includes(user.role)

  const [tab, setTab] = useState<Tab>('categories')

  useEffect(() => {
    if (user && !canAccess) router.replace('/vera')
  }, [user, canAccess, router])

  if (!user || !canAccess) return null

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Configuración VERA</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Categorías, centros de costo y presupuesto mensual
        </p>
      </div>

      {/* Internal tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="-mb-px flex gap-1">
          {([
            { key: 'categories',   label: 'Categorías'       },
            { key: 'cost-centers', label: 'Centros de costo' },
            { key: 'budget',       label: 'Presupuesto'      },
          ] as { key: Tab; label: string }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                'border-b-2 px-5 py-3 text-sm font-medium transition-colors',
                tab === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'categories'   && <CategoriesSection  />}
      {tab === 'cost-centers' && <CostCentersSection />}
      {tab === 'budget'       && <BudgetSection      />}
    </div>
  )
}
