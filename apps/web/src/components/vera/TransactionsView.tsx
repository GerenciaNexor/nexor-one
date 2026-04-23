'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { Portal } from '@/components/ui/Portal'
import { TransactionFormModal, type TxItem } from './TransactionFormModal'

interface Category   { id: string; name: string; type: 'income' | 'expense' | 'both' }
interface CostCenter { id: string; name: string }
interface Branch     { id: string; name: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(v: number, currency = 'COP') {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v)
}

const MODULE_LABELS: Record<string, string> = {
  appointment: 'Cita',
  deal:        'Deal',
  quotation:   'Cotización',
  purchase:    'Compra',
}

const MODULE_HREFS: Record<string, string> = {
  appointment: '/agenda/appointments',
}

// ── Delete Confirm Modal ───────────────────────────────────────────────────────

function DeleteConfirmModal({
  tx, onClose, onDeleted,
}: {
  tx:        TxItem
  onClose:   () => void
  onDeleted: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function confirm() {
    setLoading(true)
    try {
      await apiClient.delete(`/v1/vera/transactions/${tx.id}`)
      onDeleted()
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Error al eliminar')
      setLoading(false)
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <div className="space-y-4 px-6 py-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">Eliminar transacción</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Esta acción es{' '}
                <strong className="font-semibold text-red-600">irreversible</strong>.
                La transacción será eliminada permanentemente sin posibilidad de recuperación.
              </p>
            </div>
            <div className="truncate rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {tx.description}{' '}
              <span className={tx.type === 'income' ? 'text-emerald-600' : 'text-red-600'}>
                {tx.type === 'income' ? '+' : '−'}{fmt(Number(tx.amount), tx.currency)}
              </span>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <div className="flex gap-2 border-t border-slate-100 px-6 py-4 dark:border-slate-700">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              onClick={confirm} disabled={loading}
              className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Eliminando…' : 'Eliminar permanentemente'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ── Main View ──────────────────────────────────────────────────────────────────

const LIMIT         = 50
const ALLOWED_ROLES = ['TENANT_ADMIN', 'SUPER_ADMIN', 'AREA_MANAGER']

export function TransactionsView() {
  const user      = useAuthStore((s) => s.user)
  const canAccess = !!user?.role && ALLOWED_ROLES.includes(user.role)

  // ── Filter states ────────────────────────────────────────────────────────
  const [type,            setType]            = useState('')
  const [branchId,        setBranchId]        = useState('')
  const [categoryId,      setCategoryId]      = useState('')
  const [costCenterId,    setCostCenterId]    = useState('')
  const [dateFrom,        setDateFrom]        = useState('')
  const [dateTo,          setDateTo]          = useState('')
  const [isManual,        setIsManual]        = useState('')
  const [search,          setSearch]          = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const [page,            setPage]            = useState(1)

  // ── Data states ──────────────────────────────────────────────────────────
  const [txs,         setTxs]         = useState<TxItem[]>([])
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [branches,    setBranches]    = useState<Branch[]>([])
  const [categories,  setCategories]  = useState<Category[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])

  // ── Modal states ─────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false)
  const [editTx,     setEditTx]     = useState<TxItem | null>(null)
  const [deleteTx,   setDeleteTx]   = useState<TxItem | null>(null)

  // ── Load filter options once ─────────────────────────────────────────────
  useEffect(() => {
    Promise.allSettled([
      apiClient.get<{ data: Branch[]     }>('/v1/branches'),
      apiClient.get<{ data: Category[]   }>('/v1/vera/categories'),
      apiClient.get<{ data: CostCenter[] }>('/v1/vera/cost-centers'),
    ]).then(([br, cat, cc]) => {
      if (br.status  === 'fulfilled') setBranches(br.value.data ?? [])
      if (cat.status === 'fulfilled') setCategories(cat.value.data ?? [])
      if (cc.status  === 'fulfilled') setCostCenters(cc.value.data ?? [])
    })
  }, [])

  // ── Debounce search ──────────────────────────────────────────────────────
  const debounce = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => { setCommittedSearch(search); setPage(1) }, 400)
    return () => clearTimeout(debounce.current)
  }, [search])

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchTxs = useCallback(() => {
    setLoading(true)
    const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
    if (type)            qs.set('type',         type)
    if (branchId)        qs.set('branchId',     branchId)
    if (categoryId)      qs.set('categoryId',   categoryId)
    if (costCenterId)    qs.set('costCenterId', costCenterId)
    if (dateFrom)        qs.set('dateFrom',     dateFrom)
    if (dateTo)          qs.set('dateTo',       dateTo)
    if (isManual)        qs.set('isManual',     isManual)
    if (committedSearch) qs.set('search',       committedSearch)

    apiClient.get<{ data: TxItem[]; total: number }>(`/v1/vera/transactions?${qs}`)
      .then((res) => { setTxs(res.data ?? []); setTotal(res.total ?? 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [type, branchId, categoryId, costCenterId, dateFrom, dateTo, isManual, committedSearch, page])

  useEffect(() => { fetchTxs() }, [fetchTxs])

  // ── Filter helpers ───────────────────────────────────────────────────────
  function applyFilter(fn: () => void) { fn(); setPage(1) }

  function clearFilters() {
    setType(''); setBranchId(''); setCategoryId(''); setCostCenterId('')
    setDateFrom(''); setDateTo(''); setIsManual('')
    setSearch(''); setCommittedSearch(''); setPage(1)
  }

  const hasFilters = !!(type || branchId || categoryId || costCenterId || dateFrom || dateTo || isManual || search)
  const totalPages = Math.ceil(total / LIMIT)

  const selectCls =
    'rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none ' +
    'focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ' +
    'dark:border-slate-700 dark:bg-slate-900 dark:text-white'

  if (!canAccess) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        No tienes acceso a este módulo
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Transacciones</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {loading
              ? 'Cargando…'
              : `${total} transacción${total !== 1 ? 'es' : ''}${hasFilters ? ' (filtradas)' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <span className="text-base leading-none">+</span>
          Nueva transacción
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-end gap-3">

          <div className="min-w-52 flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Buscar
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Descripción o referencia…"
              className={selectCls + ' w-full'}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Tipo</label>
            <select value={type} onChange={(e) => applyFilter(() => setType(e.target.value))} className={selectCls}>
              <option value="">Todos</option>
              <option value="income">Ingreso</option>
              <option value="expense">Egreso</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Origen</label>
            <select value={isManual} onChange={(e) => applyFilter(() => setIsManual(e.target.value))} className={selectCls}>
              <option value="">Todos</option>
              <option value="true">Manual</option>
              <option value="false">Automático</option>
            </select>
          </div>

          {categories.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Categoría</label>
              <select value={categoryId} onChange={(e) => applyFilter(() => setCategoryId(e.target.value))} className={selectCls}>
                <option value="">Todas</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {costCenters.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Centro de costo</label>
              <select value={costCenterId} onChange={(e) => applyFilter(() => setCostCenterId(e.target.value))} className={selectCls}>
                <option value="">Todos</option>
                {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {branches.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Sucursal</label>
              <select value={branchId} onChange={(e) => applyFilter(() => setBranchId(e.target.value))} className={selectCls}>
                <option value="">Todas</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Date range */}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Desde</label>
            <input
              type="date" value={dateFrom}
              onChange={(e) => applyFilter(() => setDateFrom(e.target.value))}
              className={selectCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Hasta</label>
            <input
              type="date" value={dateTo}
              onChange={(e) => applyFilter(() => setDateTo(e.target.value))}
              className={selectCls}
            />
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-slate-400 transition-colors hover:text-slate-600"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Table (desktop) */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block dark:border-slate-700 dark:bg-slate-800">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : txs.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            {hasFilters ? 'Ninguna transacción coincide con los filtros.' : 'Sin transacciones registradas.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/50">
                  <th className="w-24 px-4 py-3">Fecha</th>
                  <th className="w-24 px-4 py-3">Tipo</th>
                  <th className="w-36 px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3">Descripción</th>
                  <th className="w-32 px-4 py-3">Categoría</th>
                  <th className="w-28 px-4 py-3">Sucursal</th>
                  <th className="w-28 px-4 py-3">Origen</th>
                  <th className="w-20 px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {txs.map((tx) => {
                  const modLabel = tx.referenceType ? (MODULE_LABELS[tx.referenceType] ?? tx.referenceType) : null
                  const href     = tx.referenceType ? (MODULE_HREFS[tx.referenceType] ?? null) : null

                  return (
                    <tr
                      key={tx.id}
                      className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30"
                    >
                      {/* Fecha */}
                      <td className="px-4 py-3 tabular-nums text-slate-500 dark:text-slate-400">
                        {new Date(tx.date).toLocaleDateString('es', {
                          day: '2-digit', month: 'short', year: '2-digit',
                        })}
                      </td>

                      {/* Tipo */}
                      <td className="px-4 py-3">
                        <span className={[
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                          tx.type === 'income'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                        ].join(' ')}>
                          {tx.type === 'income' ? 'Ingreso' : 'Egreso'}
                        </span>
                      </td>

                      {/* Monto */}
                      <td className={[
                        'px-4 py-3 text-right font-semibold tabular-nums',
                        tx.type === 'income'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400',
                      ].join(' ')}>
                        {tx.type === 'income' ? '+' : '−'}{fmt(Number(tx.amount), tx.currency)}
                      </td>

                      {/* Descripción + CC + ext. reference */}
                      <td className="px-4 py-3">
                        <p className="max-w-xs truncate font-medium text-slate-900 dark:text-white">
                          {tx.description}
                        </p>
                        {tx.costCenter && (
                          <p className="text-xs text-slate-400">{tx.costCenter.name}</p>
                        )}
                        {tx.externalReference && (
                          <p className="font-mono text-xs text-slate-400">{tx.externalReference}</p>
                        )}
                      </td>

                      {/* Categoría */}
                      <td className="px-4 py-3">
                        {tx.txCategory ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                            {tx.txCategory.color && (
                              <span
                                className="inline-block h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: tx.txCategory.color }}
                              />
                            )}
                            {tx.txCategory.name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>

                      {/* Sucursal */}
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {tx.branch?.name ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>

                      {/* Origen */}
                      <td className="px-4 py-3">
                        {tx.isManual ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                            ✎ Manual
                          </span>
                        ) : href ? (
                          <Link
                            href={href}
                            className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 hover:underline dark:bg-blue-900/30 dark:text-blue-300"
                          >
                            {modLabel} ↗
                          </Link>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                            {modLabel ?? '—'}
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3">
                        {tx.isManual && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditTx(tx)}
                              title="Editar"
                              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => setDeleteTx(tx)}
                              title="Eliminar"
                              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cards (mobile) */}
      <div className="space-y-3 sm:hidden">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))
        ) : txs.length === 0 ? (
          <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800">
            {hasFilters ? 'Ninguna transacción coincide con los filtros.' : 'Sin transacciones registradas.'}
          </div>
        ) : (
          txs.map((tx) => {
            const modLabel = tx.referenceType ? (MODULE_LABELS[tx.referenceType] ?? tx.referenceType) : null
            return (
              <div
                key={tx.id}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-white">{tx.description}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {new Date(tx.date).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })}
                      {tx.txCategory && ` · ${tx.txCategory.name}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={[
                      'font-semibold tabular-nums',
                      tx.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                    ].join(' ')}>
                      {tx.type === 'income' ? '+' : '−'}{fmt(Number(tx.amount), tx.currency)}
                    </span>
                    <span className={[
                      'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                      tx.type === 'income'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                    ].join(' ')}>
                      {tx.type === 'income' ? 'Ingreso' : 'Egreso'}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {tx.isManual ? '✎ Manual' : modLabel ?? '—'}
                    {tx.branch && ` · ${tx.branch.name}`}
                  </span>
                  {tx.isManual && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditTx(tx)}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        title="Editar"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => setDeleteTx(tx)}
                        className="text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Eliminar"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Página {page} de {totalPages} · {total} resultado{total !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* Create */}
      {showCreate && (
        <TransactionFormModal
          branches={branches}
          onClose={() => setShowCreate(false)}
          onSuccess={() => fetchTxs()}
        />
      )}

      {/* Edit */}
      {editTx && (
        <TransactionFormModal
          tx={editTx}
          branches={branches}
          onClose={() => setEditTx(null)}
          onSuccess={() => { fetchTxs(); setEditTx(null) }}
        />
      )}

      {/* Delete confirm */}
      {deleteTx && (
        <DeleteConfirmModal
          tx={deleteTx}
          onClose={() => setDeleteTx(null)}
          onDeleted={() => { fetchTxs(); setDeleteTx(null) }}
        />
      )}
    </div>
  )
}
