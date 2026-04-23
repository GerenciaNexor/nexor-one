'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'

interface Category   { id: string; name: string; type: 'income' | 'expense' | 'both' }
interface CostCenter { id: string; name: string }
interface Branch     { id: string; name: string }

export interface TxItem {
  id:                string
  isManual:          boolean
  type:              'income' | 'expense'
  amount:            number
  currency:          string
  description:       string
  externalReference: string | null
  referenceType:     string | null
  referenceId:       string | null
  date:              string
  branchId:          string | null
  categoryId:        string | null
  costCenterId:      string | null
  branch:            { id: string; name: string } | null
  txCategory:        { id: string; name: string; type: string; color: string | null } | null
  costCenter:        { id: string; name: string } | null
}

interface Props {
  tx?:       TxItem
  branches:  Branch[]
  onClose:   () => void
  onSuccess: (tx: TxItem) => void
}

export function TransactionFormModal({ tx, branches, onClose, onSuccess }: Props) {
  const isEdit = !!tx

  const [type,         setType]         = useState<'income' | 'expense'>(tx?.type ?? 'income')
  const [amount,       setAmount]       = useState(tx ? String(tx.amount) : '')
  const [date,         setDate]         = useState(tx ? tx.date.slice(0, 10) : new Date().toISOString().slice(0, 10))
  const [description,  setDescription]  = useState(tx?.description ?? '')
  const [branchId,     setBranchId]     = useState(tx?.branchId ?? '')
  const [categoryId,   setCategoryId]   = useState(tx?.categoryId ?? '')
  const [costCenterId, setCostCenterId] = useState(tx?.costCenterId ?? '')
  const [extRef,       setExtRef]       = useState(tx?.externalReference ?? '')
  const [categories,   setCategories]   = useState<Category[]>([])
  const [costCenters,  setCostCenters]  = useState<CostCenter[]>([])
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  useEffect(() => {
    Promise.allSettled([
      apiClient.get<{ data: Category[]   }>('/v1/vera/categories'),
      apiClient.get<{ data: CostCenter[] }>('/v1/vera/cost-centers'),
    ]).then(([cats, ccs]) => {
      if (cats.status === 'fulfilled') setCategories(cats.value.data ?? [])
      if (ccs.status  === 'fulfilled') setCostCenters(ccs.value.data ?? [])
    })
  }, [])

  const filteredCats = categories.filter((c) => c.type === type || c.type === 'both')

  function handleTypeChange(t: 'income' | 'expense') {
    setType(t)
    setCategoryId('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        type,
        amount:            parseFloat(amount),
        date,
        description,
        branchId:          branchId     || undefined,
        categoryId:        categoryId   || undefined,
        costCenterId:      costCenterId || undefined,
        externalReference: extRef       || undefined,
      }
      const result = isEdit
        ? await apiClient.put<TxItem>(`/v1/vera/transactions/${tx!.id}`, payload)
        : await apiClient.post<TxItem>('/v1/vera/transactions', payload)
      onSuccess(result)
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
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-800">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {isEdit ? 'Editar transacción' : 'Nueva transacción'}
          </h2>
          <button
            onClick={onClose}
            className="text-lg leading-none text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6">
          <div className="space-y-4">

            {/* Type toggle */}
            <div className="grid grid-cols-2 gap-2">
              {(['income', 'expense'] as const).map((t) => (
                <button
                  key={t} type="button"
                  onClick={() => handleTypeChange(t)}
                  disabled={isEdit}
                  className={[
                    'rounded-lg border-2 py-2 text-sm font-medium transition-colors',
                    type === t
                      ? t === 'income'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400',
                    isEdit ? 'cursor-not-allowed opacity-60' : '',
                  ].join(' ')}
                >
                  {t === 'income' ? 'Ingreso' : 'Egreso'}
                </button>
              ))}
            </div>

            {/* Amount + Date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Monto *
                </label>
                <input
                  type="number" min="0.01" step="0.01" required
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Fecha *
                </label>
                <input
                  type="date" required
                  value={date} onChange={(e) => setDate(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Descripción *
              </label>
              <input
                type="text" maxLength={500} required
                value={description} onChange={(e) => setDescription(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Category + Cost center */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Categoría
                </label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
                  <option value="">Sin categoría</option>
                  {filteredCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Centro de costo
                </label>
                <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} className={inputCls}>
                  <option value="">Sin asignar</option>
                  {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {/* Branch */}
            {branches.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Sucursal
                </label>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
                  <option value="">Sin asignar</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}

            {/* External reference */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Referencia externa
              </label>
              <input
                type="text" maxLength={255}
                value={extRef} onChange={(e) => setExtRef(e.target.value)}
                placeholder="Factura, recibo, nro. documento…"
                className={inputCls}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {/* Footer */}
          <div className="mt-6 flex justify-end gap-2">
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
              {saving ? 'Guardando…' : isEdit ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
