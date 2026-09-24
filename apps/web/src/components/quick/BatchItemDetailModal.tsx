'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/store/auth'
import { Portal } from '@/components/ui/Portal'

type Kind = 'purchase' | 'sale'

export interface BatchDetailItem {
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
  proposal: { items?: { description?: string; quantity?: number | null; unitValue?: number | null; productName?: string | null }[]; additionalFields?: { label: string; value: string }[] } | null
}

const money = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toLocaleString('es-CO')}`)

/**
 * HU — Detalle de un ítem del lote: muestra lo que leyó la IA (encabezado, ítems, info adicional) junto a
 * la imagen original. Si aún no está aprobado (ready/duplicate) permite Aprobar (registrar) o Rechazar.
 * Si ya está registrado, ofrece abrir la factura registrada.
 */
export function BatchItemDetailModal({ item, batchId, kind, onClose, onChanged, onOpenRegistered }: {
  item: BatchDetailItem
  batchId: string
  kind: Kind
  onClose: () => void
  onChanged: () => void
  onOpenRegistered: (invoiceId: string) => void
}) {
  const isSale = kind === 'sale'
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [busy, setBusy]     = useState<null | 'accept' | 'reject'>(null)
  const [err, setErr]       = useState<string | null>(null)

  useEffect(() => {
    if (!item.hasImage) return
    let url: string | null = null
    const token  = useAuthStore.getState().token
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
    fetch(`${apiUrl}/v1/quick/invoices/batch/${batchId}/items/${item.id}/image`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => (res.ok ? res.blob() : null)).then((b) => { if (b) { url = URL.createObjectURL(b); setImgUrl(url) } }).catch(() => {})
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [batchId, item.id, item.hasImage])

  const canDecide = item.status === 'ready' || item.status === 'duplicate'

  async function approve() {
    setBusy('accept'); setErr(null)
    try { await apiClient.post(`/v1/quick/invoices/batch/${batchId}/items/${item.id}/accept`, {}); onChanged(); onClose() }
    catch (e: unknown) { setErr((e as { message?: string }).message ?? 'No se pudo aprobar.'); setBusy(null) }
  }
  async function reject() {
    setBusy('reject'); setErr(null)
    try { await apiClient.post(`/v1/quick/invoices/batch/${batchId}/items/${item.id}/reject`, {}); onChanged(); onClose() }
    catch (e: unknown) { setErr((e as { message?: string }).message ?? 'No se pudo rechazar.'); setBusy(null) }
  }

  const items = item.proposal?.items ?? []
  const extra = (item.proposal?.additionalFields ?? []).filter((f) => f?.label && f?.value)
  const accent = isSale ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'

  return (
    <Portal>
      <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Detalle de la factura — {isSale ? 'Venta' : 'Compra'} rápida</h3>
              <p className="mt-0.5 text-xs text-slate-500">Origen: lote por foto · {item.fileName}</p>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600">✕</button>
          </div>

          <div className="grid flex-1 gap-6 overflow-y-auto p-6 md:grid-cols-2">
            {/* Datos leídos */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-slate-500">{isSale ? 'Cliente' : 'Proveedor'} (leído)</p><p className="font-medium text-slate-800 dark:text-slate-100">{item.issuer || '—'}</p></div>
                <div><p className="text-xs text-slate-500">NIT / documento</p><p className="font-medium text-slate-800 dark:text-slate-100">{item.nit || '—'}</p></div>
                <div><p className="text-xs text-slate-500">N.º de factura</p><p className="font-medium text-slate-800 dark:text-slate-100">{item.invoiceNumber || '—'}</p></div>
                <div><p className="text-xs text-slate-500">Fecha</p><p className="font-medium text-slate-800 dark:text-slate-100">{item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString('es-CO') : '—'}</p></div>
                <div><p className="text-xs text-slate-500">Total</p><p className="font-semibold text-slate-900 dark:text-slate-100">{money(item.total)}</p></div>
              </div>

              {item.status === 'duplicate' && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Ya existe una factura con el número {item.duplicateOf}. Puedes aprobarla igual si es correcta, o rechazarla.</p>}
              {(item.status === 'unreadable' || item.status === 'failed') && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{item.error || 'No se pudo leer esta factura.'}</p>}

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Ítems leídos ({items.length})</p>
                {items.length === 0 ? <p className="text-xs text-slate-400">Sin ítems leídos.</p> : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                    {items.map((it, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="truncate text-slate-700 dark:text-slate-200">{it.description || 'Ítem'}</span>
                        <span className="shrink-0 text-slate-500">{it.quantity ?? 1} × {money(it.unitValue ?? 0)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {extra.length > 0 && (
                <details className="rounded-lg border border-slate-100 dark:border-slate-800">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">Información adicional obtenida ({extra.length})</summary>
                  <div className="space-y-1 px-3 pb-3">
                    {extra.map((f, i) => (
                      <div key={i} className="flex justify-between gap-3 text-xs"><span className="text-slate-500">{f.label}</span><span className="text-right text-slate-700 dark:text-slate-200">{f.value}</span></div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* Imagen original */}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Imagen original</p>
              {item.hasImage
                ? (imgUrl ? <img src={imgUrl} alt="Factura" className="max-h-[60vh] w-full rounded-lg object-contain ring-1 ring-slate-200 dark:ring-slate-700" /> : <div className="flex h-40 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" /></div>)
                : <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400 dark:border-slate-600">Sin imagen.</p>}
            </div>
          </div>

          {err && <p className="px-6 pb-2 text-sm text-red-600 dark:text-red-400">{err}</p>}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
            {item.status === 'registered' && item.registeredInvoiceId && (
              <button onClick={() => { onOpenRegistered(item.registeredInvoiceId!); onClose() }} className={`mr-auto rounded-lg px-4 py-2 text-sm font-semibold text-white ${accent}`}>
                Ver factura registrada
              </button>
            )}
            {canDecide && (
              <>
                <button onClick={() => void reject()} disabled={!!busy} className="mr-auto rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20">
                  {busy === 'reject' ? 'Rechazando…' : 'Rechazar'}
                </button>
                <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">Cerrar</button>
                <button onClick={() => void approve()} disabled={!!busy} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${accent}`}>
                  {busy === 'accept' ? 'Aprobando…' : 'Aprobar y registrar'}
                </button>
              </>
            )}
            {!canDecide && item.status !== 'registered' && (
              <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">Cerrar</button>
            )}
            {item.status === 'registered' && (
              <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">Cerrar</button>
            )}
          </div>
        </div>
      </div>
    </Portal>
  )
}
