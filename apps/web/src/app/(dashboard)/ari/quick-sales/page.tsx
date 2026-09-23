'use client'

import { useState } from 'react'
import { InvoiceUploadModal } from '@/components/quick/InvoiceUploadModal'
import { InvoicesPanel } from '@/components/quick/InvoicesPanel'
import { QuickRegistersPanel } from '@/components/quick/QuickRegistersPanel'
import { BatchUploadModal } from '@/components/quick/BatchUploadModal'
import { BatchReviewModal } from '@/components/quick/BatchReviewModal'
import { BatchesPanel } from '@/components/quick/BatchesPanel'

type Tab = 'registers' | 'invoices' | 'batches'

export default function QuickSalesPage() {
  const [modal, setModal] = useState(false)
  const [invoice, setInvoice] = useState(false)
  const [batchUpload, setBatchUpload] = useState(false)
  const [reviewBatch, setReviewBatch] = useState<string | null>(null) // lote a revisar tras esperar
  const [batchReload, setBatchReload] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('registers')
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
          <button onClick={() => setBatchUpload(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
            🗂️ Cargar varias
          </button>
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

      {notice && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Cerrar" className="text-emerald-400 hover:text-emerald-600">✕</button>
        </div>
      )}

      {/* Pestañas: historial de ventas rápidas · facturas cargadas · lotes por OCR (no se estorban con muchos datos) */}
      <div className="mt-5 flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {(['registers', 'invoices', 'batches'] as const).map((v) => (
          <button key={v} onClick={() => setTab(v)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${tab === v ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            {v === 'registers' ? 'Ventas rápidas' : v === 'invoices' ? 'Facturas cargadas' : 'Lotes'}
          </button>
        ))}
      </div>

      {tab === 'invoices'
        ? <InvoicesPanel kind="sale" hideHeader />
        : tab === 'batches'
          ? <BatchesPanel key={batchReload} kind="sale" />
          : <QuickRegistersPanel kind="sale" reloadSignal={reload} onNew={() => setModal(true)} />}

      {modal && <InvoiceUploadModal kind="sale" startManual onClose={() => setModal(false)} onSuccess={() => { setModal(false); refresh() }} />}
      {invoice && <InvoiceUploadModal kind="sale" onClose={() => setInvoice(false)} onSuccess={() => { setInvoice(false); refresh() }} />}

      {batchUpload && (
        <BatchUploadModal
          kind="sale"
          onClose={() => setBatchUpload(false)}
          onReady={(batchId) => { setBatchUpload(false); setReviewBatch(batchId) }}
          onBackground={() => { setBatchUpload(false); setTab('batches'); setBatchReload((n) => n + 1); setNotice('El lote se está procesando en segundo plano. Te avisaremos por la plataforma y WhatsApp cuando esté listo.') }}
        />
      )}

      {reviewBatch && (
        <BatchReviewModal
          batchId={reviewBatch}
          onClose={() => { setReviewBatch(null); setBatchReload((n) => n + 1) }}
          onDone={() => { setReviewBatch(null); setBatchReload((n) => n + 1); refresh() }}
        />
      )}
    </div>
  )
}
