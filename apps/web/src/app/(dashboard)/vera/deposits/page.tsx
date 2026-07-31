'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { EmptyState } from '@/components/ui/EmptyState'

interface GroupRow { id: string | null; name: string; total: number; count: number }
interface Item {
  rentalId: string; deposit: number; quantity: number; rentedAt: string; dueAt: string | null
  clientName: string; productName: string; productSku: string; branchName: string
}
interface DepositsResponse {
  totalHeld: number; count: number; rentalIncome: number
  byClient: GroupRow[]; byProduct: GroupRow[]; items: Item[]
}

const money = (n: number) => `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

type Tab = 'client' | 'product' | 'detail'

export default function DepositsPage() {
  const [data, setData] = useState<DepositsResponse | null>(null)
  const [tab, setTab]   = useState<Tab>('client')

  useEffect(() => {
    apiClient.get<DepositsResponse>('/v1/vera/rental-deposits')
      .then(setData).catch(() => setData({ totalHeld: 0, count: 0, rentalIncome: 0, byClient: [], byProduct: [], items: [] }))
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Depósitos e ingresos de alquiler</h1>
      <p className="mt-0.5 text-sm text-slate-500">Los depósitos son dinero del cliente que debes devolver — no son ingreso. Se muestran separados de lo que sí es tuyo.</p>

      {/* Dos figuras SEPARADAS: ingreso real vs retención */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-900/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Ingresos por alquiler (tuyo)</p>
          <p className="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-200">{data ? money(data.rentalIncome) : '…'}</p>
          <p className="mt-1 text-xs text-emerald-700/70 dark:text-emerald-300/70">Precio de alquiler + depósitos retenidos. Aparece en Reportes bajo &ldquo;Alquileres&rdquo;.</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Depósitos en retención (a devolver)</p>
          <p className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-200">{data ? money(data.totalHeld) : '…'}</p>
          <p className="mt-1 text-xs text-amber-700/70 dark:text-amber-300/70">{data ? `${data.count} alquiler(es) activo(s)` : '…'} · dinero en caja que NO es ingreso.</p>
        </div>
      </div>

      {/* Desglose de la retención */}
      <div className="mt-6 flex gap-2">
        {([['client', 'Por cliente'], ['product', 'Por producto'], ['detail', 'Detalle']] as const).map(([v, label]) => (
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
            <EmptyState bordered={false} title="No hay depósitos en retención" description="Cuando registres alquileres con depósito, aquí verás cuánto guardas y debes devolver, por cliente y por producto." />
          ) : tab === 'detail' ? (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
                <th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3 text-right">Cant.</th><th className="px-4 py-3">Desde</th><th className="px-4 py-3">Retorno</th><th className="px-4 py-3 text-right">Depósito</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {data.items.map((r) => (
                  <tr key={r.rentalId}>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{r.clientName}</td>
                    <td className="px-4 py-3"><span className="text-slate-800 dark:text-slate-100">{r.productName}</span> <span className="font-mono text-xs text-slate-400">{r.productSku}</span></td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{r.quantity}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(r.rentedAt)}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(r.dueAt)}</td>
                    <td className="px-4 py-3 text-right font-medium text-amber-700 dark:text-amber-300">{money(r.deposit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
                <th className="px-4 py-3">{tab === 'client' ? 'Cliente' : 'Producto'}</th><th className="px-4 py-3 text-right">Alquileres</th><th className="px-4 py-3 text-right">Retención</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {(tab === 'client' ? data.byClient : data.byProduct).map((g) => (
                  <tr key={g.id ?? g.name}>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{g.name}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{g.count}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-700 dark:text-amber-300">{money(g.total)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold dark:bg-slate-900/40">
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">Total</td>
                  <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{data.count}</td>
                  <td className="px-4 py-3 text-right text-amber-800 dark:text-amber-200">{money(data.totalHeld)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
