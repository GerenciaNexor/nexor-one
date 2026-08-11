'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { fmtCalendarDate } from '@/lib/format-date'
import { Portal } from '@/components/ui/Portal'
import { useAuthStore } from '@/store/auth'

type Kind = 'purchase' | 'sale'
const money = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`)
const fmtDate = (iso: string | null) => (iso ? fmtCalendarDate(iso) : '—')

interface InvoiceRow {
  id: string; issuer: string | null; nit: string | null; date: string | null
  total: number | null; invoiceNumber: string | null; hasImage: boolean; createdAt: string
}

/** HU-194-A — Lista + búsqueda + detalle de facturas cargadas por OCR (compra en NIRA, venta en ARI). */
export function InvoicesPanel({ kind, hideHeader = false }: { kind: Kind; hideHeader?: boolean }) {
  const isSale = kind === 'sale'
  const [rows, setRows]   = useState<InvoiceRow[] | null>(null)
  const [q, setQ]         = useState('')
  const [from, setFrom]   = useState('')
  const [to, setTo]       = useState('')
  const [minTotal, setMin] = useState('')
  const [maxTotal, setMax] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)

  const load = useCallback(() => {
    const p = new URLSearchParams({ kind })
    if (q.trim())  p.set('q', q.trim())
    if (from)      p.set('from', from)
    if (to)        p.set('to', to)
    if (minTotal)  p.set('minTotal', minTotal)
    if (maxTotal)  p.set('maxTotal', maxTotal)
    setRows(null)
    apiClient.get<{ data: InvoiceRow[] }>(`/v1/quick/invoices?${p.toString()}`).then((r) => setRows(r.data)).catch(() => setRows([]))
  }, [kind, q, from, to, minTotal, maxTotal])

  useEffect(() => { load() }, [kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const inp = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className={hideHeader ? '' : 'mt-8'}>
      {!hideHeader && <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Facturas cargadas</h2>}
      <p className="mt-0.5 text-xs text-slate-500">Facturas de {isSale ? 'venta' : 'compra'} leídas por foto (OCR). Ábrelas para ver toda su información y la imagen original.</p>

      {/* Búsqueda: número/emisor, rango de fecha, rango de total */}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="N.º de factura, emisor o NIT…" className={`${inp} min-w-[200px] flex-1`} />
        <label className="flex flex-col text-[11px] text-slate-500">Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} /></label>
        <label className="flex flex-col text-[11px] text-slate-500">Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} /></label>
        <label className="flex flex-col text-[11px] text-slate-500">Total mín.<input type="number" value={minTotal} onChange={(e) => setMin(e.target.value)} className={`${inp} w-28`} /></label>
        <label className="flex flex-col text-[11px] text-slate-500">Total máx.<input type="number" value={maxTotal} onChange={(e) => setMax(e.target.value)} className={`${inp} w-28`} /></label>
        <button onClick={load} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">Buscar</button>
        {(q || from || to || minTotal || maxTotal) && (
          <button onClick={() => { setQ(''); setFrom(''); setTo(''); setMin(''); setMax(''); setTimeout(load, 0) }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-700">Limpiar</button>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          {rows === null ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">No hay facturas cargadas{q || from || to || minTotal || maxTotal ? ' con esos filtros' : ''}.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">N.º factura</th>
                  <th className="px-4 py-3">{isSale ? 'Cliente' : 'Proveedor / Emisor'}</th>
                  <th className="px-4 py-3">NIT</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setDetailId(r.id)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="px-4 py-3 text-slate-500">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{r.invoiceNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{r.issuer ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{r.nit ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-100">{money(r.total)}</td>
                    <td className="px-4 py-3 text-right text-xs text-blue-600 dark:text-blue-400">Ver detalle →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {detailId && <InvoiceDetailModal id={detailId} kind={kind} onClose={() => setDetailId(null)} />}
    </div>
  )
}

// ─── Detalle: TODA la información + imagen original ─────────────────────────────

interface InvoiceDetail {
  id: string; kind: Kind; issuer: string | null; nit: string | null; date: string | null; total: number | null
  hasImage: boolean; createdAt: string; createdByName?: string | null
  additionalFields: { label: string; value: string }[]
  items: Array<{ description?: string; quantity?: number; unitValue?: number; amount?: number; productName?: string; affectsStock?: boolean; addedToInventory?: boolean; transactionId?: string }>
  fullExtraction?: { items?: Array<{ description?: { value?: string }; quantity?: { value?: number }; unitPrice?: { value?: number } }> }
}

export function InvoiceDetailModal({ id, kind, onClose }: { id: string; kind: Kind; onClose: () => void }) {
  const isSale = kind === 'sale'
  const [inv, setInv] = useState<InvoiceDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [imgUrl, setImgUrl] = useState<string | null>(null)

  useEffect(() => {
    let url: string | null = null
    apiClient.get<{ data: InvoiceDetail }>(`/v1/quick/invoices/${id}`).then((r) => setInv(r.data)).catch((e: unknown) => setErr((e as { message?: string }).message ?? 'No se pudo cargar la factura'))
    const token  = useAuthStore.getState().token
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
    fetch(`${apiUrl}/v1/quick/invoices/${id}/image`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => (res.ok ? res.blob() : null)).then((b) => { if (b) { url = URL.createObjectURL(b); setImgUrl(url) } }).catch(() => {})
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [id])

  // Ítems: los registrados (con efecto). Si no hay, cae a los leídos por OCR.
  const items = inv?.items?.length
    ? inv.items.map((it) => ({ description: it.description ?? '', quantity: it.quantity ?? null, unitValue: it.unitValue ?? null, productName: it.productName ?? null, affectsStock: it.affectsStock, transactionId: it.transactionId }))
    : (inv?.fullExtraction?.items ?? []).map((it) => ({ description: it.description?.value ?? '', quantity: it.quantity?.value ?? null, unitValue: it.unitPrice?.value ?? null, productName: null as string | null, affectsStock: undefined as boolean | undefined, transactionId: undefined as string | undefined }))

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Factura de {isSale ? 'venta' : 'compra'}</h3>
              {inv && <p className="mt-0.5 text-xs text-slate-500">📄 Origen: factura por foto{inv.createdByName ? ` · Subida por ${inv.createdByName}` : ''}{inv.createdAt ? ` · ${fmtDate(inv.createdAt)}` : ''}</p>}
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600">✕</button>
          </div>

          {err && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{err}</p>}
          {!inv && !err && <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />)}</div>}

          {inv && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {/* Columna izquierda: datos */}
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div><dt className="text-xs text-slate-500">{isSale ? 'Cliente' : 'Proveedor / Emisor'}</dt><dd className="text-slate-800 dark:text-slate-100">{inv.issuer ?? '—'}</dd></div>
                  <div><dt className="text-xs text-slate-500">NIT</dt><dd className="text-slate-800 dark:text-slate-100">{inv.nit ?? '—'}</dd></div>
                  <div><dt className="text-xs text-slate-500">Fecha</dt><dd className="text-slate-800 dark:text-slate-100">{fmtDate(inv.date)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Total</dt><dd className="font-semibold text-slate-900 dark:text-slate-100">{money(inv.total)}</dd></div>
                </dl>

                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Ítems ({items.length})</p>
                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {items.map((it, i) => (
                          <tr key={i}>
                            <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">
                              {it.description}
                              {it.affectsStock != null && (
                                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${it.affectsStock ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700'}`}>
                                  {it.affectsStock ? 'afectó stock' : (isSale ? 'ingreso' : 'gasto')}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right text-slate-500">{it.quantity ?? '—'}</td>
                            <td className="px-2 py-1.5 text-right text-slate-700 dark:text-slate-200">{money(it.unitValue ?? null)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {inv.additionalFields.length > 0 && (
                  <details open className="rounded-lg border border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">Información adicional obtenida ({inv.additionalFields.length})</summary>
                    <dl className="divide-y divide-slate-100 px-3 pb-2 dark:divide-slate-700/60">
                      {inv.additionalFields.map((f, i) => (
                        <div key={i} className="flex gap-3 py-1.5 text-xs">
                          <dt className="w-2/5 shrink-0 font-medium text-slate-500 dark:text-slate-400">{f.label}</dt>
                          <dd className="min-w-0 flex-1 break-words text-slate-700 dark:text-slate-200">{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </div>

              {/* Columna derecha: imagen original */}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Imagen original</p>
                {inv.hasImage ? (
                  imgUrl
                    ? <a href={imgUrl} target="_blank" rel="noreferrer"><img src={imgUrl} alt="Factura" className="max-h-[60vh] w-full rounded-lg border border-slate-200 object-contain dark:border-slate-700" /></a>
                    : <div className="h-64 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700" />
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400 dark:border-slate-600">Sin imagen guardada.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Portal>
  )
}
