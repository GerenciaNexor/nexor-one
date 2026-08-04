'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { fmtCalendarDate } from '@/lib/format-date'
import { QuickRegisterModal } from '@/components/quick/QuickRegisterModal'
import { EmptyState } from '@/components/ui/EmptyState'

interface Register {
  id: string
  kind: 'purchase' | 'sale'
  amount: number
  description: string
  date: string
  branchName: string | null
  affectsInventory: boolean
  product: { sku: string; name: string; unit: string; quantity: number } | null
}

const money = (n: number) => `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
// `date` es un DATE (fecha de calendario): UTC para no correrla un día en zonas negativas.
const fmtDate = (iso: string) => fmtCalendarDate(iso)

export default function QuickRegistersPage() {
  const [rows, setRows]   = useState<Register[] | null>(null)
  const [kind, setKind]   = useState<'' | 'purchase' | 'sale'>('')
  const [modal, setModal] = useState<'purchase' | 'sale' | null>(null)

  function load() {
    const q = kind ? `?kind=${kind}` : ''
    apiClient.get<{ data: Register[] }>(`/v1/quick/registers${q}`)
      .then((r) => setRows(r.data)).catch(() => setRows([]))
  }
  useEffect(() => { load() }, [kind]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Registros rápidos</h1>
          <p className="mt-0.5 text-sm text-slate-500">Compras y ventas registradas de forma rápida (ya ocurridas, sin aprobación). También quedan en Finanzas (VERA) y, si afectan inventario, en KIRA.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('purchase')} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">+ Compra</button>
          <button onClick={() => setModal('sale')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">+ Venta</button>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {([['', 'Todos'], ['purchase', 'Compras'], ['sale', 'Ventas']] as const).map(([v, label]) => (
          <button key={label} onClick={() => setKind(v)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${kind === v ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          {rows === null ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState bordered={false} title="Sin registros rápidos" description="Registra una compra o venta pequeña que ya ocurrió; aparecerá aquí y en tus finanzas." action={{ label: 'Nueva compra', onClick: () => setModal('purchase') }} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Detalle</th>
                  <th className="px-4 py-3">Inventario</th>
                  <th className="px-4 py-3">Sucursal</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      {r.kind === 'sale'
                        ? <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Venta</span>
                        : <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Compra</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.product
                        ? <><span className="font-medium text-slate-800 dark:text-slate-100">{r.product.name}</span> <span className="text-slate-400">{r.product.quantity} {r.product.unit}</span></>
                        : <span className="text-slate-600 dark:text-slate-300">{r.description}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.affectsInventory
                        ? <span className="text-xs text-violet-600 dark:text-violet-400">Sí</span>
                        : <span className="text-xs text-slate-400">Servicio</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{r.branchName ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(r.date)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${r.kind === 'sale' ? 'text-emerald-600' : 'text-slate-800 dark:text-slate-100'}`}>
                      {r.kind === 'sale' ? '+' : '−'}{money(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && <QuickRegisterModal initialMode={modal} onClose={() => setModal(null)} onSuccess={() => { setModal(null); load() }} />}
    </div>
  )
}
