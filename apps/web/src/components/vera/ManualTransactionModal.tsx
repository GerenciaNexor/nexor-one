'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'

interface Category { id: string; name: string; type: 'income' | 'expense' | 'both' }
interface Branch   { id: string; name: string }

interface Props {
  branches:  Branch[]
  onClose:   () => void
  onSuccess: () => void
}

export function ManualTransactionModal({ branches, onClose, onSuccess }: Props) {
  const [type,        setType]        = useState<'income' | 'expense'>('income')
  const [amount,      setAmount]      = useState('')
  const [date,        setDate]        = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [branchId,    setBranchId]    = useState('')
  const [categoryId,  setCategoryId]  = useState('')
  const [categories,  setCategories]  = useState<Category[]>([])
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => {
    apiClient.get<{ data: Category[] }>('/v1/vera/categories')
      .then((res) => setCategories(res.data ?? []))
      .catch(() => {})
  }, [])

  const filteredCats = categories.filter((c) => c.type === type || c.type === 'both')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await apiClient.post('/v1/vera/transactions', {
        type,
        amount:     parseFloat(amount),
        date,
        description,
        branchId:   branchId   || undefined,
        categoryId: categoryId || undefined,
      })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ' +
    'focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ' +
    'dark:border-slate-700 dark:bg-slate-900 dark:text-white'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-800">

        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Nueva transacción</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-2">
            {(['income', 'expense'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); setCategoryId('') }}
                className={[
                  'rounded-lg border-2 py-2 text-sm font-medium transition-colors',
                  type === t
                    ? t === 'income'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400',
                ].join(' ')}
              >
                {t === 'income' ? 'Ingreso' : 'Egreso'}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Monto *</label>
            <input
              type="number" min="0.01" step="0.01"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              required placeholder="0"
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Fecha *</label>
            <input
              type="date"
              value={date} onChange={(e) => setDate(e.target.value)}
              required className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Descripción *</label>
            <input
              type="text" maxLength={500}
              value={description} onChange={(e) => setDescription(e.target.value)}
              required className={inputCls}
            />
          </div>

          {filteredCats.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Categoría</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
                <option value="">Sin categoría</option>
                {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {branches.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Sucursal</label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
                <option value="">Sin asignar</option>
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
      </div>
    </div>
  )
}
