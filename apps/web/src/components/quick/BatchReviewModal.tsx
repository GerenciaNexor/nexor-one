'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { Portal } from '@/components/ui/Portal'
import { InvoiceUploadModal, type ExtractResult, type ExtractedItem } from './InvoiceUploadModal'
import { InvoiceDetailModal } from './InvoicesPanel'

type Kind = 'purchase' | 'sale'

interface BatchItem {
  id: string
  fileName: string
  status: 'pending' | 'processing' | 'ready' | 'unreadable' | 'duplicate' | 'failed' | 'registered' | 'rejected'
  issuer: string | null
  nit: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  total: number | null
  error: string | null
  duplicateOf: string | null
  registeredInvoiceId: string | null
  hasImage: boolean
  proposal: { items?: ExtractedItem[]; additionalFields?: { label: string; value: string }[]; fullExtraction?: unknown } | null
}
interface Batch {
  id: string; kind: Kind; mode: string; status: string
  total: number; processed: number; failed: number; branchId: string | null; projectId: string | null; createdAt: string
  items: BatchItem[]
}

const LABEL: Record<BatchItem['status'], { text: string; cls: string }> = {
  pending:    { text: 'En cola',      cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  processing: { text: 'Leyendo…',     cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  ready:      { text: 'Lista',        cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  registered: { text: 'Registrada',   cls: 'bg-emerald-600 text-white' },
  duplicate:  { text: 'Duplicada',    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  unreadable: { text: 'No legible',   cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  failed:     { text: 'Error',        cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  rejected:   { text: 'Rechazada',    cls: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
}

/**
 * HU-212 — Revisión de un lote ya leído. Muestra el resumen (listas / duplicadas / no legibles) y
 * exige la decisión: "Revisar una por una" (abre cada factura con lo propuesto) o "Aceptar todas".
 */
export function BatchReviewModal({ batchId, onClose, onDone }: { batchId: string; onClose: () => void; onDone: () => void }) {
  const [batch, setBatch]   = useState<Batch | null>(null)
  const [loading, setLoad]  = useState(true)
  const [accepting, setAcc] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const [err, setErr]       = useState<string | null>(null)
  const [reviewing, setReviewing]   = useState(false)  // revisión 1×1 activa (siempre el 1er ítem "ready")
  const [reviewTotal, setReviewTotal] = useState(0)    // cuántas había al iniciar la revisión (para "X / N")
  const [singleReviewId, setSingleReviewId] = useState<string | null>(null) // ítem abierto para revisar/editar
  const [registeredId, setRegisteredId] = useState<string | null>(null)   // factura registrada a abrir

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get<{ data: Batch }>(`/v1/quick/invoices/batch/${batchId}`)
      setBatch(r.data)
      if (r.data.status === 'processing') setTimeout(() => { void load() }, 2500)
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudo cargar el lote.')
    } finally { setLoad(false) }
  }, [batchId])

  useEffect(() => { void load() }, [load])

  const isSale = batch?.kind === 'sale'
  const readyItems = batch?.items.filter((i) => i.status === 'ready') ?? []

  async function acceptAll() {
    if (!batch) return
    setAcc(true); setErr(null)
    try {
      await apiClient.post(`/v1/quick/invoices/batch/${batch.id}/accept`, {})
      onDone()
    } catch (e: unknown) {
      setErr((e as { message?: string }).message ?? 'No se pudieron registrar las facturas.')
      setAcc(false)
    }
  }

  // Reconstruye lo que InvoiceUploadModal espera a partir de la propuesta guardada del ítem.
  function extractionFor(it: BatchItem): ExtractResult {
    return {
      canRead: true, kind: batch!.kind,
      issuer: it.issuer, nit: it.nit, invoiceNumber: it.invoiceNumber,
      date: it.invoiceDate, total: it.total,
      items: it.proposal?.items ?? [],
      additionalFields: it.proposal?.additionalFields ?? [],
      fullExtraction: it.proposal?.fullExtraction,
    }
  }

  // Revisión una-por-una: SIEMPRE el primer ítem "ready". Al registrar uno, sale de la lista y el
  // siguiente pasa a ser [0]. `key` por ítem → cada factura re-monta el modal y vuelve a sembrar sus
  // datos (sin key, React reusaba la instancia y el guard de siembra dejaba los datos del ítem anterior:
  // parecía que "no guardaba ni avanzaba").
  const reviewItem = reviewing ? readyItems[0] : null
  if (reviewItem && batch) {
    return (
      <InvoiceUploadModal
        key={reviewItem.id}
        kind={batch.kind}
        initialExtraction={extractionFor(reviewItem)}
        batchItemId={reviewItem.id}
        initialBranchId={batch.branchId ?? undefined}
        initialProjectId={batch.projectId ?? undefined}
        batchProgress={{ current: Math.min(reviewTotal, reviewTotal - readyItems.length + 1), total: reviewTotal }}
        onReject={async () => { await apiClient.post(`/v1/quick/invoices/batch/${batch.id}/items/${reviewItem.id}/reject`, {}); await load() }}
        onClose={() => setReviewing(false)}
        onSuccess={() => { void load() }}  // recarga: el registrado sale de "ready"; el próximo pasa a [0]
      />
    )
  }
  // Si `reviewing` sigue activo pero ya no quedan ítems "ready", reviewItem es null y cae al resumen.

  // Revisión INDIVIDUAL (clic en una factura del listado): abre el MISMO modal editable, para modificar,
  // aprobar (guardar) o rechazar. Al terminar vuelve al listado del lote (no avanza en secuencia).
  const singleItem = singleReviewId && batch ? (batch.items.find((i) => i.id === singleReviewId) ?? null) : null
  if (singleItem && batch) {
    return (
      <InvoiceUploadModal
        key={singleItem.id}
        kind={batch.kind}
        initialExtraction={extractionFor(singleItem)}
        batchItemId={singleItem.id}
        initialBranchId={batch.branchId ?? undefined}
        initialProjectId={batch.projectId ?? undefined}
        onReject={async () => { await apiClient.post(`/v1/quick/invoices/batch/${batch.id}/items/${singleItem.id}/reject`, {}); await load(); setSingleReviewId(null) }}
        onClose={() => setSingleReviewId(null)}
        onSuccess={() => { void load(); setSingleReviewId(null) }}
      />
    )
  }

  const accent = isSale ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Revisión del lote — {isSale ? 'Ventas' : 'Compras'} rápidas</h3>
              {batch && <p className="mt-0.5 text-xs text-slate-500">{batch.processed} de {batch.total} procesadas · {readyItems.length} lista{readyItems.length === 1 ? '' : 's'} para registrar</p>}
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading && <p className="py-10 text-center text-sm text-slate-400">Cargando lote…</p>}
            {err && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{err}</p>}

            {batch?.status === 'processing' && (
              <p className="mb-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" /> Aún se están leyendo facturas…
              </p>
            )}

            {batch && (
              <ul className="space-y-2">
                {batch.items.map((it) => {
                  const l = LABEL[it.status]
                  // Registrada → detalle de la factura real; lista/duplicada → modal editable (revisar);
                  // el resto (no legible / error / rechazada) no es accionable.
                  const clickable = it.status === 'registered' || it.status === 'ready' || it.status === 'duplicate'
                  const open = () => {
                    if (it.status === 'registered' && it.registeredInvoiceId) setRegisteredId(it.registeredInvoiceId)
                    else if (it.status === 'ready' || it.status === 'duplicate') setSingleReviewId(it.id)
                  }
                  return (
                    <li key={it.id}>
                      <button
                        onClick={open} disabled={!clickable}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 px-3.5 py-2.5 text-left transition-colors dark:border-slate-800 ${clickable ? 'hover:border-slate-300 hover:bg-slate-50 dark:hover:border-slate-600 dark:hover:bg-slate-800/50' : 'cursor-default'}`}>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{it.issuer || it.fileName}</p>
                          <p className="truncate text-xs text-slate-500">
                            {it.invoiceNumber ? `Nº ${it.invoiceNumber}` : 'Sin número'}
                            {it.total != null && ` · $${it.total.toLocaleString('es-CO')}`}
                            {it.nit && ` · NIT ${it.nit}`}
                          </p>
                          {it.status === 'duplicate' && <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">Ya existe una factura con el número {it.duplicateOf}.</p>}
                          {(it.status === 'unreadable' || it.status === 'failed') && <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">{it.error || 'No se pudo leer — vuelve a cargarla manualmente.'}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${l.cls}`}>{l.text}</span>
                          {clickable && <span className="text-xs text-slate-400">{it.status === 'registered' ? 'Ver ›' : 'Revisar ›'}</span>}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {batch && batch.status !== 'processing' && (
            <div className="border-t border-slate-100 px-6 py-4 dark:border-slate-800">
              {readyItems.length === 0 ? (
                <p className="text-center text-sm text-slate-500">No hay facturas listas para registrar en este lote.</p>
              ) : !confirmAll ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button onClick={() => { setReviewTotal(readyItems.length); setReviewing(true) }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">
                    Revisar una por una ({readyItems.length})
                  </button>
                  <button onClick={() => setConfirmAll(true)} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${accent}`}>
                    Aceptar todas ({readyItems.length})
                  </button>
                </div>
              ) : (
                <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-900/20">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Se registrarán <b>{readyItems.length}</b> factura{readyItems.length === 1 ? '' : 's'} tal como las leyó la IA, sin revisión individual.
                    El inventario solo se afecta cuando el producto fue reconocido{batch.branchId ? '' : ' y hay sucursal'}; el resto queda como {isSale ? 'ingreso' : 'gasto'}.
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button onClick={() => setConfirmAll(false)} disabled={accepting} className="rounded-lg border border-amber-300 px-4 py-2 text-sm text-amber-800 disabled:opacity-50 dark:border-amber-700 dark:text-amber-200">Cancelar</button>
                    <button onClick={() => void acceptAll()} disabled={accepting} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${accent}`}>
                      {accepting ? 'Registrando…' : 'Sí, registrar todas'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Factura ya registrada (reusa el detalle de "Facturas cargadas") */}
      {registeredId && batch && (
        <InvoiceDetailModal id={registeredId} kind={batch.kind} onClose={() => setRegisteredId(null)} onChanged={() => { void load() }} />
      )}
    </Portal>
  )
}
