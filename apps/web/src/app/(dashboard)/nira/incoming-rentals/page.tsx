'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { fmtCalendarDate } from '@/lib/format-date'
import { IncomingRentalFormModal } from '@/components/nira/IncomingRentalFormModal'
import { ReturnIncomingRentalModal, type IncomingRental } from '@/components/nira/ReturnIncomingRentalModal'
import { EmptyState } from '@/components/ui/EmptyState'

type Filter = 'active' | 'returned' | 'all'
const money = (n: number) => `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`

// Hoy + n días como YYYY-MM-DD (para "próximos a vencer").
function todayPlus(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export default function IncomingRentalsPage() {
  const [rows, setRows]     = useState<IncomingRental[] | null>(null)
  const [filter, setFilter] = useState<Filter>('active')
  const [search, setSearch] = useState('')
  const [dueSoon, setDueSoon] = useState(false)
  const [modal, setModal]   = useState(false)
  const [returning, setReturning] = useState<IncomingRental | null>(null)

  function load() {
    const p = new URLSearchParams()
    if (filter !== 'all') p.set('status', filter)
    if (search.trim()) p.set('search', search.trim())
    if (dueSoon) p.set('dueBefore', todayPlus(7))
    const qs = p.toString()
    apiClient.get<{ data: IncomingRental[] }>(`/v1/nira/incoming-rentals${qs ? `?${qs}` : ''}`)
      .then((r) => setRows(r.data)).catch(() => setRows([]))
  }
  // Recarga al cambiar filtros. `search` se aplica con debounce ligero.
  useEffect(() => { setRows(null); const t = setTimeout(load, 250); return () => clearTimeout(t) }, [filter, search, dueSoon]) // eslint-disable-line react-hooks/exhaustive-deps

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
            Todo lo que tienes prestado de terceros, sin importar el proyecto.{' '}
            <span className="text-slate-400">No entra a tu inventario; el costo va a tus finanzas.</span>
          </p>
        </div>
        <button onClick={() => setModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
          <span className="text-base leading-none">+</span> Nuevo alquiler entrante
        </button>
      </div>

      {/* Filtros: estado + búsqueda (tercero/producto/proyecto) + próximos a vencer */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
          {tab('active', 'Activos')}
          {tab('returned', 'Devueltos')}
          {tab('all', 'Todos')}
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por tercero, producto o proyecto…"
          className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <input type="checkbox" checked={dueSoon} onChange={(e) => setDueSoon(e.target.checked)} className="h-3.5 w-3.5 rounded accent-blue-600" />
          Próximos a vencer (7 días)
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          {rows === null ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState bordered={false}
              title="Nada prestado por aquí"
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
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.map((r) => {
                  const overdue = r.status === 'active' && new Date(r.returnDate) < new Date(todayPlus(0))
                  return (
                    <tr key={r.id}>
                      <td className={`px-4 py-3 ${overdue ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                        {fmtCalendarDate(r.returnDate)}{overdue && <span className="ml-1 text-[11px]">vencido</span>}
                      </td>
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
                      <td className="px-4 py-3 text-right text-slate-500">
                        {r.deposit > 0 ? money(r.deposit) : '—'}
                        {r.status === 'returned' && r.deposit > 0 && (
                          <span className="block text-[11px]">
                            {r.depositLost > 0
                              ? <span className="text-red-500">perdiste {money(r.depositLost)}</span>
                              : <span className="text-emerald-600">recuperado</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.status === 'active'
                          ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">Activo</span>
                          : <span title={r.returnedByName ? `Por ${r.returnedByName}` : undefined} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">Devuelto{r.returnedAt ? ` · ${fmtCalendarDate(r.returnedAt)}` : ''}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.status === 'active' && (
                          <button onClick={() => setReturning(r)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
                            Devolver
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && <IncomingRentalFormModal onClose={() => setModal(false)} onSuccess={() => { setModal(false); load() }} />}
      {returning && <ReturnIncomingRentalModal rental={returning} onClose={() => setReturning(null)} onSuccess={() => { setReturning(null); load() }} />}
    </div>
  )
}
