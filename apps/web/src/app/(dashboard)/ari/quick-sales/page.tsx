'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { fmtCalendarDate } from '@/lib/format-date'
import { QuickRegisterModal } from '@/components/quick/QuickRegisterModal'
import { InvoiceUploadModal } from '@/components/quick/InvoiceUploadModal'
import { InvoicesPanel } from '@/components/quick/InvoicesPanel'
import { EmptyState } from '@/components/ui/EmptyState'

interface Register {
  id: string
  kind: 'purchase' | 'sale'
  amount: number
  detail: string
  counterparty: string | null
  date: string
  branchName: string | null
  affectsInventory: boolean
  product: { sku: string; name: string; unit: string; quantity: number } | null
}

const money = (n: number) => `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`

export default function QuickSalesPage() {
  const [rows, setRows]   = useState<Register[] | null>(null)
  const [modal, setModal] = useState(false)
  const [invoice, setInvoice] = useState(false)

  function load() {
    apiClient.get<{ data: Register[] }>('/v1/quick/registers?kind=sale')
      .then((r) => setRows(r.data)).catch(() => setRows([]))
  }
  useEffect(() => { load() }, [])

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Ventas rápidas</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Ventas pequeñas que ya ocurrieron, sin el pipeline.{' '}
            <span className="text-slate-400">Distinto de &ldquo;Ventas realizadas&rdquo; (negocios ganados).</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setInvoice(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
            📷 Cargar factura
          </button>
          <button onClick={() => setModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700">
            <span className="text-base leading-none">+</span> Nueva venta rápida
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          {rows === null ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState bordered={false}
              title="Sin ventas rápidas"
              description="Registra una venta pequeña que ya ocurrió (mostrador, un servicio…). Quedará aquí y en tus finanzas, sin pasar por el pipeline."
              action={{ label: 'Nueva venta rápida', onClick: () => setModal(true) }} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Detalle</th>
                  <th className="px-4 py-3">Inventario</th>
                  <th className="px-4 py-3">Sucursal</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-slate-500">{fmtCalendarDate(r.date)}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{r.counterparty ?? '—'}</td>
                    <td className="px-4 py-3">
                      {r.product
                        ? <><span className="font-medium text-slate-800 dark:text-slate-100">{r.product.name}</span> <span className="text-slate-400">{r.product.quantity} {r.product.unit}</span></>
                        : <span className="text-slate-600 dark:text-slate-300">{r.detail}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.affectsInventory
                        ? <span className="text-xs font-medium text-violet-600 dark:text-violet-400">Sí</span>
                        : <span className="text-xs text-slate-400">Servicio</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{r.branchName ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">+{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* HU-194-A — facturas de venta cargadas por OCR: lista + búsqueda + detalle */}
      <InvoicesPanel kind="sale" />

      {modal && <QuickRegisterModal initialMode="sale" lockMode onClose={() => setModal(false)} onSuccess={() => { setModal(false); load() }} />}
      {invoice && <InvoiceUploadModal kind="sale" onClose={() => setInvoice(false)} onSuccess={() => { setInvoice(false); load() }} />}
    </div>
  )
}
