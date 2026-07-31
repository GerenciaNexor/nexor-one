'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { RentalFormModal } from '@/components/kira/RentalFormModal'
import { ReturnRentalModal } from '@/components/kira/ReturnRentalModal'
import { EmptyState } from '@/components/ui/EmptyState'

interface Rental {
  id:          string
  quantity:    number
  status:      'active' | 'returned'
  chargeType:  'fixed' | 'daily'
  fixedAmount: number | null
  dailyRate:   number | null
  deposit:     number
  rentedAt:    string
  dueAt:       string | null
  returnedAt:  string | null
  product: { sku: string; name: string; unit: string }
  branch:  { name: string }
  client:  { name: string } | null
}

const money = (n: number | null) => n == null ? '—' : `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

export default function RentalsPage() {
  const [rentals, setRentals] = useState<Rental[] | null>(null)
  const [status, setStatus]   = useState<'active' | 'returned' | ''>('active')
  const [modal, setModal]     = useState(false)
  const [returnId, setReturnId] = useState<string | null>(null)

  function load() {
    const q = status ? `?status=${status}` : ''
    apiClient.get<{ data: Rental[] }>(`/v1/kira/rentals${q}`)
      .then((r) => setRentals(r.data)).catch(() => setRentals([]))
  }
  useEffect(() => { load() }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const price = (r: Rental) => r.chargeType === 'fixed'
    ? `${money(r.fixedAmount)} fijo`
    : `${money(r.dailyRate)}/día`

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Alquileres</h1>
          <p className="mt-0.5 text-sm text-slate-500">Productos alquilados a clientes. El alquiler baja el disponible, no el total.</p>
        </div>
        <button onClick={() => setModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
          <span className="text-base leading-none">+</span> Nuevo alquiler
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        {([['active', 'Activos'], ['returned', 'Devueltos'], ['', 'Todos']] as const).map(([v, label]) => (
          <button key={label} onClick={() => setStatus(v)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${status === v ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 hidden overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 text-right">Cant.</th>
                <th className="px-4 py-3">Cobro</th>
                <th className="px-4 py-3 text-right">Depósito</th>
                <th className="px-4 py-3">Retorno</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {rentals === null ? (
                Array.from({ length: 5 }).map((_, i) => <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-5 animate-pulse rounded bg-slate-100 dark:bg-slate-700" /></td></tr>)
              ) : rentals.length === 0 ? (
                <tr><td colSpan={8} className="p-0">
                  <EmptyState bordered={false}
                    title={status === 'active' ? 'No hay alquileres activos' : 'Sin alquileres'}
                    description="Registra un alquiler para controlar qué producto está prestado, a quién y hasta cuándo. Solo aplica a productos marcados como alquilables."
                    action={{ label: 'Nuevo alquiler', onClick: () => setModal(true) }}
                  />
                </td></tr>
              ) : (
                rentals.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{r.product.name}</p>
                      <p className="font-mono text-xs text-slate-400">{r.product.sku} · {r.branch.name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.client?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{r.quantity} {r.product.unit}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{price(r)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{money(r.deposit)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtDate(r.dueAt)}</td>
                    <td className="px-4 py-3 text-center">
                      {r.status === 'active'
                        ? <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">Alquilado</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-emerald-600">✓ Devuelto</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === 'active' && (
                        <button onClick={() => setReturnId(r.id)}
                          className="whitespace-nowrap rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
                          Devolver
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Móvil */}
      <div className="mt-4 space-y-3 sm:hidden">
        {rentals === null ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)
        ) : rentals.length === 0 ? (
          <div className="rounded-xl border border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800">
            <EmptyState bordered={false} title="Sin alquileres" description="Registra un alquiler para controlar qué está prestado y a quién." action={{ label: 'Nuevo alquiler', onClick: () => setModal(true) }} />
          </div>
        ) : (
          rentals.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900 dark:text-slate-100">{r.product.name}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{r.client?.name ?? '—'} · {r.quantity} {r.product.unit}</p>
                </div>
                {r.status === 'active'
                  ? <span className="shrink-0 rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">Alquilado</span>
                  : <span className="shrink-0 text-xs text-emerald-600">✓ Devuelto</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>{price(r)}</span>
                <span>Depósito {money(r.deposit)}</span>
                <span>Retorno {fmtDate(r.dueAt)}</span>
              </div>
              {r.status === 'active' && (
                <button onClick={() => setReturnId(r.id)}
                  className="mt-3 w-full rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
                  Devolver
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {modal && <RentalFormModal onClose={() => setModal(false)} onSuccess={() => { setModal(false); load() }} />}
      {returnId && <ReturnRentalModal rentalId={returnId} onClose={() => setReturnId(null)} onSuccess={() => { setReturnId(null); load() }} />}
    </div>
  )
}
