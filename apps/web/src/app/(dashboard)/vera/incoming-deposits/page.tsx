'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { fmtCalendarDate } from '@/lib/format-date'
import { EmptyState } from '@/components/ui/EmptyState'

interface GroupRow { id: string | null; name: string; total: number; count: number }
interface Item {
  incomingRentalId: string; deposit: number; quantity: number; project: string
  description: string; returnDate: string; thirdParty: string; branchName: string | null
}
interface Response {
  totalOutstanding: number; count: number
  rentalCostExpense: number; depositLostExpense: number
  byProject: GroupRow[]; byThirdParty: GroupRow[]; items: Item[]
}

const money = (n: number) => `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
type Tab = 'project' | 'thirdParty' | 'detail'
const EMPTY: Response = { totalOutstanding: 0, count: 0, rentalCostExpense: 0, depositLostExpense: 0, byProject: [], byThirdParty: [], items: [] }

export default function IncomingDepositsPage() {
  const [data, setData] = useState<Response | null>(null)
  const [tab, setTab]   = useState<Tab>('project')

  useEffect(() => {
    apiClient.get<Response>('/v1/vera/incoming-rental-deposits').then(setData).catch(() => setData(EMPTY))
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Depósitos afuera y gasto de alquileres</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Al rentar de terceros dejas un depósito propio: es dinero tuyo que está afuera y esperas recuperar.{' '}
        <span className="text-slate-400">No es gasto todavía — se muestra separado de lo que sí gastaste.</span>
      </p>

      {/* Dos figuras SEPARADAS: gasto real vs retención por cobrar (recuperable) */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Gasto en alquileres (egreso)</p>
          <p className="mt-1 text-2xl font-bold text-red-800 dark:text-red-200">{data ? money(data.rentalCostExpense + data.depositLostExpense) : '…'}</p>
          <p className="mt-1 text-xs text-red-700/70 dark:text-red-300/70">
            {data ? `${money(data.rentalCostExpense)} de costo` : '…'}
            {data && data.depositLostExpense > 0 ? ` + ${money(data.depositLostExpense)} en depósitos perdidos` : ''}. Categoría &ldquo;Alquileres pagados&rdquo;.
          </p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-900/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Retención por cobrar (recuperable)</p>
          <p className="mt-1 text-2xl font-bold text-blue-800 dark:text-blue-200">{data ? money(data.totalOutstanding) : '…'}</p>
          <p className="mt-1 text-xs text-blue-700/70 dark:text-blue-300/70">{data ? `${data.count} alquiler(es) activo(s)` : '…'} · dinero PROPIO afuera, NO es gasto.</p>
        </div>
      </div>

      {/* Desglose de la retención */}
      <div className="mt-6 flex gap-2">
        {([['project', 'Por proyecto'], ['thirdParty', 'Por tercero'], ['detail', 'Detalle']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${tab === v ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          {data === null ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />)}</div>
          ) : data.count === 0 ? (
            <EmptyState bordered={false} title="No hay depósitos afuera" description="Cuando registres alquileres entrantes con depósito, aquí verás cuánto dinero propio tienes afuera (recuperable), por proyecto y por tercero." />
          ) : tab === 'detail' ? (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
                <th className="px-4 py-3">Tercero</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Proyecto</th><th className="px-4 py-3">Devolución</th><th className="px-4 py-3 text-right">Depósito</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {data.items.map((r) => (
                  <tr key={r.incomingRentalId}>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{r.thirdParty}</td>
                    <td className="px-4 py-3"><span className="text-slate-800 dark:text-slate-100">{r.description}</span> <span className="text-slate-400">×{r.quantity}</span></td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.project}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtCalendarDate(r.returnDate)}</td>
                    <td className="px-4 py-3 text-right font-medium text-blue-700 dark:text-blue-300">{money(r.deposit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
                <th className="px-4 py-3">{tab === 'project' ? 'Proyecto' : 'Tercero'}</th><th className="px-4 py-3 text-right">Alquileres</th><th className="px-4 py-3 text-right">Retención</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {(tab === 'project' ? data.byProject : data.byThirdParty).map((g) => (
                  <tr key={g.id ?? g.name}>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{g.name}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{g.count}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700 dark:text-blue-300">{money(g.total)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold dark:bg-slate-900/40">
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">Total</td>
                  <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{data.count}</td>
                  <td className="px-4 py-3 text-right text-blue-800 dark:text-blue-200">{money(data.totalOutstanding)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
