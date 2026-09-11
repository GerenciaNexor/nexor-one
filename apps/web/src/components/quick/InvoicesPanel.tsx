'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { fmtCalendarDate, fmtDateTime } from '@/lib/format-date'
import { Portal } from '@/components/ui/Portal'
import { useAuthStore } from '@/store/auth'
import { downloadFile, toQuery } from '@/lib/download'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { DOCUMENT_TYPES } from '@nexor/shared'

// HU-210 — editar/eliminar facturas cargadas: solo administradores (mín. Jefe de área).
const MANAGER_ROLES = ['AREA_MANAGER', 'BRANCH_ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN']

type Kind = 'purchase' | 'sale'
const money = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`)
const fmtDate = (iso: string | null) => (iso ? fmtCalendarDate(iso) : '—')

interface InvoiceRow {
  id: string; issuer: string | null; counterpartyName?: string | null; nit: string | null; date: string | null
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
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting]   = useState(false)

  async function runExport(opts: ExportOptions) {
    setExporting(true)
    try {
      const qs = toQuery({
        kind, q: q.trim(), from, to, minTotal, maxTotal,
        dateFormat: opts.dateFormat, includeTime: String(opts.includeTime), docDigitsOnly: String(opts.docDigitsOnly),
        columns: opts.columns.join(','),
      })
      await downloadFile(`/v1/quick/invoices/export${qs}`, `facturas-${isSale ? 'venta' : 'compra'}-${new Date().toISOString().slice(0, 10)}.xlsx`)
      setExportOpen(false)
    } catch { /* noop */ } finally { setExporting(false) }
  }

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
        <button onClick={() => setExportOpen(true)} disabled={rows === null || (rows?.length ?? 0) === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20">
          ⬇ Descargar Excel
        </button>
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
                  <th className="px-4 py-3">{isSale ? 'Cliente' : 'Proveedor'}</th>
                  <th className="px-4 py-3">Emisor</th>
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
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{r.counterpartyName ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{r.issuer ?? '—'}</td>
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

      {detailId && <InvoiceDetailModal id={detailId} kind={kind} onClose={() => setDetailId(null)} onChanged={load} />}
      {exportOpen && <ExportOptionsModal isSale={isSale} exporting={exporting} onClose={() => setExportOpen(false)} onConfirm={runExport} />}
    </div>
  )
}

// ─── Modal de opciones de descarga a Excel (HU-210) ────────────────────────────

interface ExportOptions { dateFormat: 'dmy' | 'mdy' | 'ymd'; includeTime: boolean; docDigitsOnly: boolean; columns: string[] }

// Orden y etiquetas de las columnas exportables (deben coincidir con INVOICE_EXPORT_COLUMNS del backend).
const EXPORT_COLUMNS = (isSale: boolean): { key: string; label: string }[] => [
  { key: 'date',          label: 'Fecha factura' },
  { key: 'counterparty',  label: isSale ? 'Cliente' : 'Proveedor' },
  { key: 'issuer',        label: 'Emisor' },
  { key: 'documentType',  label: 'Tipo de documento' },
  { key: 'document',      label: 'Documento / NIT' },
  { key: 'invoiceNumber', label: 'N.º factura' },
  { key: 'total',         label: 'Total' },
  { key: 'hasImage',      label: 'Imagen' },
  { key: 'createdAt',     label: 'Cargada el' },
]

const DATE_FORMATS: { value: ExportOptions['dateFormat']; label: string }[] = [
  { value: 'dmy', label: 'DD/MM/AAAA' },
  { value: 'mdy', label: 'MM/DD/AAAA' },
  { value: 'ymd', label: 'AAAA/MM/DD' },
]

function ExportOptionsModal({ isSale, exporting, onClose, onConfirm }: {
  isSale: boolean; exporting: boolean; onClose: () => void; onConfirm: (o: ExportOptions) => void
}) {
  const allCols = EXPORT_COLUMNS(isSale)
  const [dateFormat, setDateFormat]     = useState<ExportOptions['dateFormat']>('dmy')
  const [includeTime, setIncludeTime]   = useState(true)
  const [docDigitsOnly, setDocDigits]   = useState(false)
  const [cols, setCols] = useState<string[]>(allCols.map((c) => c.key))

  const toggleCol = (k: string) => setCols((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k])
  const ordered = allCols.filter((c) => cols.includes(c.key)).map((c) => c.key)  // respeta el orden fijo

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Opciones de descarga</h3>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Elige cómo quieres el archivo de Excel.</p>

          {/* Formato de fecha */}
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Formato de fecha</p>
            <div className="flex flex-wrap gap-2">
              {DATE_FORMATS.map((f) => (
                <button key={f.value} onClick={() => setDateFormat(f.value)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${dateFormat === f.value ? 'border-blue-500 bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Opciones */}
          <div className="mt-4 space-y-2">
            <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={includeTime} onChange={(e) => setIncludeTime(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600" />
              <span>Incluir la hora (hora y minutos)<span className="block text-[11px] text-slate-400">Se agrega a la fecha de la columna &ldquo;Cargada el&rdquo;</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={docDigitsOnly} onChange={(e) => setDocDigits(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600" />
              <span>Documento sin dígito de verificación<span className="block text-[11px] text-slate-400">Ej: 900276962-1 → 900276962 (solo lo anterior al &ldquo;-&rdquo;)</span></span>
            </label>
          </div>

          {/* Columnas */}
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Columnas a incluir</p>
            <div className="grid grid-cols-2 gap-1.5">
              {allCols.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={cols.includes(c.key)} onChange={() => toggleCol(c.key)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                  {c.label}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} disabled={exporting} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
            <button onClick={() => onConfirm({ dateFormat, includeTime, docDigitsOnly, columns: ordered })} disabled={exporting || ordered.length === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {exporting ? 'Generando…' : 'Descargar Excel'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

// ─── Detalle: TODA la información + imagen original ─────────────────────────────

interface InvoiceDetail {
  id: string; kind: Kind; issuer: string | null; counterparty?: { id: string; name: string } | null; nit: string | null; documentType?: string | null; invoiceNumber?: string | null; date: string | null; total: number | null
  hasImage: boolean; createdAt: string; createdByName?: string | null
  additionalFields: { label: string; value: string }[]
  items: Array<{ description?: string; quantity?: number; unitValue?: number; amount?: number; productName?: string; affectsStock?: boolean; addedToInventory?: boolean; transactionId?: string }>
  fullExtraction?: { items?: Array<{ description?: { value?: string }; quantity?: { value?: number }; unitPrice?: { value?: number } }> }
}

export function InvoiceDetailModal({ id, kind, onClose, onChanged }: { id: string; kind: Kind; onClose: () => void; onChanged?: () => void }) {
  const isSale = kind === 'sale'
  const role   = useAuthStore((s) => s.user?.role)
  const canManage = !!role && MANAGER_ROLES.includes(role)   // HU-210 — editar/eliminar solo administradores
  const [inv, setInv] = useState<InvoiceDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [imgUrl, setImgUrl] = useState<string | null>(null)

  // HU-210 — edición del encabezado + eliminación con reversión.
  const [editing, setEditing]     = useState(false)
  const [form, setForm]           = useState({ counterpartyId: '', issuer: '', nit: '', documentType: '', invoiceNumber: '', date: '', total: '' })
  const [cps, setCps]             = useState<{ id: string; name: string; isGeneric?: boolean; taxId?: string | null }[]>([])
  const [saving, setSaving]       = useState(false)
  const [confirmDel, setConfirm]  = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [actionErr, setActionErr] = useState<string | null>(null)

  useEffect(() => {
    let url: string | null = null
    apiClient.get<{ data: InvoiceDetail }>(`/v1/quick/invoices/${id}`).then((r) => setInv(r.data)).catch((e: unknown) => setErr((e as { message?: string }).message ?? 'No se pudo cargar la factura'))
    const token  = useAuthStore.getState().token
    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'
    fetch(`${apiUrl}/v1/quick/invoices/${id}/image`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => (res.ok ? res.blob() : null)).then((b) => { if (b) { url = URL.createObjectURL(b); setImgUrl(url) } }).catch(() => {})
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [id])

  // HU-210 — terceros registrados (proveedores/clientes) para poder corregir el proveedor de la factura.
  useEffect(() => {
    if (!canManage) return
    apiClient.get<{ data: typeof cps }>(isSale ? '/v1/quick/clients' : '/v1/quick/suppliers')
      .then((r) => setCps(r.data)).catch(() => {})
  }, [canManage, isSale])

  function startEdit() {
    if (!inv) return
    setActionErr(null)
    setForm({
      counterpartyId: inv.counterparty?.id ?? '',
      issuer:        inv.issuer ?? '',
      nit:           inv.nit ?? '',
      documentType:  inv.documentType ?? '',
      invoiceNumber: inv.invoiceNumber ?? '',
      date:          inv.date ? inv.date.slice(0, 10) : '',
      total:         inv.total != null ? String(inv.total) : '',
    })
    setEditing(true)
  }

  async function saveEdit() {
    setSaving(true); setActionErr(null)
    try {
      const r = await apiClient.patch<{ data: InvoiceDetail }>(`/v1/quick/invoices/${id}`, {
        ...(isSale ? { clientId: form.counterpartyId || null } : { supplierId: form.counterpartyId || null }),
        issuer:        form.issuer.trim() || null,
        nit:           form.nit.trim() || null,
        documentType:  form.documentType || null,
        invoiceNumber: form.invoiceNumber.trim() || null,
        date:          form.date || null,
        total:         form.total === '' ? null : Number(form.total),
      })
      setInv(r.data); setEditing(false); onChanged?.()
    } catch (e: unknown) {
      setActionErr((e as { message?: string }).message ?? 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  async function doDelete() {
    setDeleting(true); setActionErr(null)
    try {
      await apiClient.delete(`/v1/quick/invoices/${id}`)
      onChanged?.(); onClose()
    } catch (e: unknown) {
      setActionErr((e as { message?: string }).message ?? 'No se pudo eliminar la factura')
      setConfirm(false)
    } finally { setDeleting(false) }
  }

  // Ítems: los registrados (con efecto). Si no hay, cae a los leídos por OCR.
  const items = inv?.items?.length
    ? inv.items.map((it) => ({ description: it.description ?? '', quantity: it.quantity ?? null, unitValue: it.unitValue ?? null, productName: it.productName ?? null, affectsStock: it.affectsStock, transactionId: it.transactionId }))
    : (inv?.fullExtraction?.items ?? []).map((it) => ({ description: it.description?.value ?? '', quantity: it.quantity?.value ?? null, unitValue: it.unitPrice?.value ?? null, productName: null as string | null, affectsStock: undefined as boolean | undefined, transactionId: undefined as string | undefined }))

  const dinp = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
  const dlbl = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400'

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Factura de {isSale ? 'venta' : 'compra'}</h3>
              {inv && <p className="mt-0.5 text-xs text-slate-500">📄 Origen: factura por foto{inv.createdByName ? ` · Subida por ${inv.createdByName}` : ''}{inv.createdAt ? ` · ${fmtDateTime(inv.createdAt)}` : ''}</p>}
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600">✕</button>
          </div>

          {err && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{err}</p>}
          {!inv && !err && <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />)}</div>}

          {inv && (
            <>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {/* Columna izquierda: datos */}
              <div className="space-y-4">
                {editing ? (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                    <div className="col-span-2"><label className={dlbl}>{isSale ? 'Cliente' : 'Proveedor'} (registrado)</label>
                      <SearchableSelect value={form.counterpartyId} onChange={(v) => setForm((f) => ({ ...f, counterpartyId: v }))} className={dinp}
                        placeholder={isSale ? 'Sin cliente' : 'Sin proveedor'}
                        options={[{ value: '', label: isSale ? 'Sin cliente' : 'Sin proveedor' }, ...cps.map((o) => ({ value: o.id, label: `${o.name}${o.isGeneric ? ' (genérico)' : ''}`, hint: o.taxId ?? undefined }))]} /></div>
                    <div className="col-span-2"><label className={dlbl}>Emisor (en la factura)</label>
                      <input value={form.issuer} onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))} className={dinp} placeholder="Nombre impreso en la factura" /></div>
                    <div><label className={dlbl}>Tipo de documento</label>
                      <SearchableSelect value={form.documentType} onChange={(v) => setForm((f) => ({ ...f, documentType: v }))} className={dinp} placeholder="—"
                        options={[{ value: '', label: '—' }, ...DOCUMENT_TYPES.map((d) => ({ value: d.code, label: d.label }))]} /></div>
                    <div><label className={dlbl}>NIT o documento</label>
                      <input value={form.nit} onChange={(e) => setForm((f) => ({ ...f, nit: e.target.value }))} className={dinp} /></div>
                    <div><label className={dlbl}>N.º de factura</label>
                      <input value={form.invoiceNumber} onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))} className={dinp} /></div>
                    <div><label className={dlbl}>Fecha</label>
                      <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={dinp} /></div>
                    <div><label className={dlbl}>Total</label>
                      <input type="number" value={form.total} onChange={(e) => setForm((f) => ({ ...f, total: e.target.value }))} className={dinp} /></div>
                    <p className="col-span-2 text-[11px] text-slate-400">Solo corrige los datos de la factura. No cambia los ítems, el stock ni las transacciones ya registradas.</p>
                  </div>
                ) : (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  {/* HU-210 — proveedor/cliente REGISTRADO y emisor leído son distintos (mismo NIT, nombre comercial distinto). */}
                  <div><dt className="text-xs text-slate-500">{isSale ? 'Cliente' : 'Proveedor'}</dt><dd className="text-slate-800 dark:text-slate-100">{inv.counterparty?.name ?? '—'}</dd></div>
                  <div><dt className="text-xs text-slate-500">Emisor (en la factura)</dt><dd className="text-slate-800 dark:text-slate-100">{inv.issuer ?? '—'}</dd></div>
                  <div><dt className="text-xs text-slate-500">{inv.documentType ? inv.documentType : 'NIT'}</dt><dd className="text-slate-800 dark:text-slate-100">{inv.nit ?? '—'}</dd></div>
                  <div><dt className="text-xs text-slate-500">N.º de factura</dt><dd className="text-slate-800 dark:text-slate-100">{inv.invoiceNumber ?? '—'}</dd></div>
                  <div><dt className="text-xs text-slate-500">Fecha</dt><dd className="text-slate-800 dark:text-slate-100">{fmtDate(inv.date)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Total</dt><dd className="font-semibold text-slate-900 dark:text-slate-100">{money(inv.total)}</dd></div>
                </dl>
                )}

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
                    ? <a href={imgUrl} target="_blank" rel="noreferrer"><img src={imgUrl} alt="Factura" className="max-h-[60dvh] w-full rounded-lg border border-slate-200 object-contain dark:border-slate-700" /></a>
                    : <div className="h-64 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700" />
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400 dark:border-slate-600">Sin imagen guardada.</p>
                )}
              </div>
            </div>

            {/* HU-210 — acciones (solo administradores): editar encabezado / eliminar con reversión */}
            {canManage && (
              <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-700">
                {editing ? (
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditing(false)} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
                    <button onClick={() => void saveEdit()} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar cambios'}</button>
                  </div>
                ) : confirmDel ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-600 dark:text-slate-300">¿Eliminar esta factura? Se revierten sus movimientos de stock y se borran sus transacciones.</p>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirm(false)} disabled={deleting} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
                      <button onClick={() => void doDelete()} disabled={deleting} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{deleting ? 'Eliminando…' : 'Sí, eliminar'}</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setConfirm(true)} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20">Eliminar</button>
                    <button onClick={startEdit} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Editar</button>
                  </div>
                )}
              </div>
            )}
            {actionErr && <p className="mt-2 text-right text-sm text-red-600 dark:text-red-400">{actionErr}</p>}
            </>
          )}
        </div>
      </div>
    </Portal>
  )
}
