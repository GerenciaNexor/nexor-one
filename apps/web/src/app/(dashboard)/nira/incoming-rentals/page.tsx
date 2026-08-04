'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { fmtCalendarDate } from '@/lib/format-date'
import { IncomingRentalFormModal } from '@/components/nira/IncomingRentalFormModal'
import { EmptyState } from '@/components/ui/EmptyState'

interface IncomingRental {
  id: string
  status: 'active' | 'returned'
  description: string
  quantity: number
  project: string
  returnDate: string
  rentalCost: number
  deposit: number
  thirdParty: string | null
  thirdPartyContact: string | null
  isExistingSupplier: boolean
  branchName: string | null
}

type Filter = 'active' | 'returned' | 'all'
const money = (n: number) => `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`

export default function IncomingRentalsPage() {
  const [rows, setRows]     = useState<IncomingRental[] | null>(null)
  const [filter, setFilter] = useState<Filter>('active')
  const [modal, setModal]   = useState(false)

  function load() {
    const qs = filter === 'all' ? '' : `?status=${filter}`
    apiClient.get<{ data: IncomingRental[] }>(`/v1/nira/incoming-rentals${qs}`)
      .then((r) => setRows(r.data)).catch(() => setRows([]))
  }
  useEffect(() => { setRows(null); load() }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  const tab = (f: Filter, label: string) => (
    <button onClick={() => setFilter(f)}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'}`}>
      {label}
    </button>
  )

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Alquileres entrantes</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Productos que rentas de un tercero para un proyecto.{' '}
            <span className="text-slate-400">No entran a tu inventario; el costo va a tus finanzas.</span>
          </p>
        </div>
        <button onClick={() => setModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
          <span className="text-base leading-none">+</span> Nuevo alquiler entrante
        </button>
      </div>

      <div className="mt-4 inline-flex gap-1 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
        {tab('active', 'Activos')}
        {tab('returned', 'Devueltos')}
        {tab('all', 'Todos')}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          {rows === null ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState bordered={false}
              title="Sin alquileres entrantes"
              description="Registra un producto que rentes de un tercero (un proveedor o alguien suelto) para un proyecto. Queda aquí para devolverlo después."
              action={{ label: 'Nuevo alquiler entrante', onClick: () => setModal(true) }} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
                  <th className="px-4 py-3">Devolución</th>
                  <th className="px-4 py-3">Tercero</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Proyecto</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                  <th className="px-4 py-3 text-right">Depósito</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-slate-500">{fmtCalendarDate(r.returnDate)}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                      {r.thirdParty ?? '—'}
                      {!r.isExistingSupplier && <span className="ml-1 text-xs text-slate-400">(suelto)</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-800 dark:text-slate-100">{r.description}</span>{' '}
                      <span className="text-slate-400">×{r.quantity}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.project}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-100">−{money(r.rentalCost)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{r.deposit > 0 ? money(r.deposit) : '—'}</td>
                    <td className="px-4 py-3">
                      {r.status === 'active'
                        ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">Activo</span>
                        : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">Devuelto</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && <IncomingRentalFormModal onClose={() => setModal(false)} onSuccess={() => { setModal(false); load() }} />}
    </div>
  )
}
