'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { BatchReviewModal } from './BatchReviewModal'

type Kind = 'purchase' | 'sale'

interface BatchRow {
  id: string
  status: string        // processing | ready | done
  total: number; processed: number; failed: number
  createdAt: string
  ready: number; duplicate: number; unreadable: number; failedItems: number; registered: number
}

const STATUS: Record<string, { text: string; cls: string }> = {
  processing: { text: 'Procesando',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  ready:      { text: 'Por revisar',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  done:       { text: 'Cerrado',      cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
}

/** HU-212 — Pestaña "Lotes": lista de cargas masivas y su estado; abre la revisión de cada una. */
export function BatchesPanel({ kind }: { kind: Kind }) {
  const [rows, setRows]     = useState<BatchRow[]>([])
  const [loading, setLoad]  = useState(true)
  const [open, setOpen]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoad(true)
    try {
      const r = await apiClient.get<{ data: BatchRow[] }>(`/v1/quick/invoices/batch?kind=${kind}`)
      setRows(r.data)
    } catch { /* silencioso */ } finally { setLoad(false) }
  }, [kind])

  useEffect(() => { void load() }, [load])

  const fmtDate = (s: string) => new Date(s).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div>
      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400">Cargando lotes…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center dark:border-slate-700">
          <p className="text-sm text-slate-500">Aún no has cargado lotes de facturas.</p>
          <p className="mt-1 text-xs text-slate-400">Usa &ldquo;Cargar varias&rdquo; para subir hasta 10 imágenes de una vez.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((b) => {
            const st = STATUS[b.status] ?? STATUS.done!
            const canReview = b.status !== 'done' || b.ready > 0
            return (
              <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.text}</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{b.total} factura{b.total === 1 ? '' : 's'}</span>
                    <span className="text-xs text-slate-400">{fmtDate(b.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {b.registered > 0 && <span className="text-emerald-600 dark:text-emerald-400">{b.registered} registrada{b.registered === 1 ? '' : 's'} · </span>}
                    {b.ready > 0 && <span>{b.ready} por revisar · </span>}
                    {b.duplicate > 0 && <span className="text-amber-600 dark:text-amber-400">{b.duplicate} duplicada{b.duplicate === 1 ? '' : 's'} · </span>}
                    {(b.unreadable + b.failedItems) > 0 && <span className="text-rose-600 dark:text-rose-400">{b.unreadable + b.failedItems} no legible{(b.unreadable + b.failedItems) === 1 ? '' : 's'}</span>}
                  </p>
                </div>
                <button
                  onClick={() => setOpen(b.id)}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">
                  {canReview ? 'Revisar' : 'Ver'}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {open && (
        <BatchReviewModal
          batchId={open}
          onClose={() => setOpen(null)}
          onDone={() => { setOpen(null); void load() }}
        />
      )}
    </div>
  )
}
