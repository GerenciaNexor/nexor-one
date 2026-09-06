'use client'

import { useState } from 'react'
import { InvoiceUploadModal } from '@/components/quick/InvoiceUploadModal'
import { InvoicesPanel } from '@/components/quick/InvoicesPanel'
import { QuickRegistersPanel } from '@/components/quick/QuickRegistersPanel'

export default function QuickSalesPage() {
  const [modal, setModal] = useState(false)
  const [invoice, setInvoice] = useState(false)
  const [tab, setTab] = useState<'registers' | 'invoices'>('registers')
  const [reload, setReload] = useState(0)

  const refresh = () => setReload((n) => n + 1)

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

      {/* Dos pestañas: historial de ventas rápidas vs facturas cargadas (no se estorban con muchos datos) */}
      <div className="mt-5 flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {(['registers', 'invoices'] as const).map((v) => (
          <button key={v} onClick={() => setTab(v)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${tab === v ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            {v === 'registers' ? 'Ventas rápidas' : 'Facturas cargadas'}
          </button>
        ))}
      </div>

      {tab === 'invoices'
        ? <InvoicesPanel kind="sale" hideHeader />
        : <QuickRegistersPanel kind="sale" reloadSignal={reload} onNew={() => setModal(true)} />}

      {modal && <InvoiceUploadModal kind="sale" startManual onClose={() => setModal(false)} onSuccess={() => { setModal(false); refresh() }} />}
      {invoice && <InvoiceUploadModal kind="sale" onClose={() => setInvoice(false)} onSuccess={() => { setInvoice(false); refresh() }} />}
    </div>
  )
}
