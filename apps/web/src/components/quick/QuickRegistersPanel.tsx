'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { fmtDateTime } from '@/lib/format-date'
import { downloadFile, toQuery } from '@/lib/download'
import { RegisterDetailModal, type QuickRegister } from '@/components/quick/RegisterDetailModal'
import { EmptyState } from '@/components/ui/EmptyState'

type Kind = 'purchase' | 'sale'
const money = (n: number) => `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`

/**
 * HU-196 — Panel del historial de registros rápidos (compras/ventas) con filtros y exportación a Excel.
 * Compartido por NIRA (compras) y ARI (ventas). Descarga respeta el filtro activo (todo si no hay).
 */
export function QuickRegistersPanel({ kind, reloadSignal, onNew }: { kind: Kind; reloadSignal: number; onNew: () => void }) {
  const isSale = kind === 'sale'
  const [rows, setRows]   = useState<QuickRegister[] | null>(null)
  const [detail, setDetail] = useState<QuickRegister | null>(null)
  const [q, setQ]         = useState('')
  const [from, setFrom]   = useState('')
  const [to, setTo]       = useState('')
  const [inventory, setInventory] = useState('')  // '' | 'yes' | 'service'
  const [origin, setOrigin]       = useState('')  // '' | 'invoice' | 'manual'
  const [exporting, setExporting] = useState(false)

  const load = useCallback(() => {
    const qs = toQuery({ kind, q: q.trim(), from, to, inventory, origin, limit: 100 })
    setRows(null)
    apiClient.get<{ data: QuickRegister[] }>(`/v1/quick/registers${qs}`).then((r) => setRows(r.data)).catch(() => setRows([]))
  }, [kind, q, from, to, inventory, origin])

  // Recarga al montar, al cambiar de tipo, y cuando el padre registra algo nuevo (reloadSignal).
  useEffect(() => { load() }, [kind, reloadSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  async function exportExcel() {
    setExporting(true)
    try {
      const qs = toQuery({ kind, q: q.trim(), from, to, inventory, origin })
      await downloadFile(`/v1/quick/registers/export${qs}`, `${isSale ? 'ventas' : 'compras'}-rapidas-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch { /* noop */ } finally { setExporting(false) }
  }

  const hasFilter = !!(q || from || to || inventory || origin)
  const inp = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className="mt-4">
      {/* Filtros: búsqueda, rango de fecha, inventario, origen */}
      <div className="flex flex-wrap items-end gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder={`${isSale ? 'Cliente' : 'Proveedor'} o detalle…`} className={`${inp} min-w-[200px] flex-1`} />
        <label className="flex flex-col text-[11px] text-slate-500">Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} /></label>
        <label className="flex flex-col text-[11px] text-slate-500">Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} /></label>
        <label className="flex flex-col text-[11px] text-slate-500">Inventario
          <select value={inventory} onChange={(e) => setInventory(e.target.value)} className={inp}>
            <option value="">Todos</option>
            <option value="yes">Afecta stock</option>
            <option value="service">Servicio</option>
          </select>
        </label>
        <label className="flex flex-col text-[11px] text-slate-500">Origen
          <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={inp}>
            <option value="">Todos</option>
            <option value="invoice">Factura</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <button onClick={load} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">Filtrar</button>
        {hasFilter && (
          <button onClick={() => { setQ(''); setFrom(''); setTo(''); setInventory(''); setOrigin(''); setTimeout(load, 0) }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-700">Limpiar</button>
        )}
        <button onClick={exportExcel} disabled={exporting || rows === null || (rows?.length ?? 0) === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20">
          {exporting ? 'Generando…' : '⬇ Descargar Excel'}
        </button>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          {rows === null ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />)}</div>
          ) : rows.length === 0 ? (
            hasFilter ? (
              <p className="p-6 text-center text-sm text-slate-400">No hay {isSale ? 'ventas' : 'compras'} rápidas con esos filtros.</p>
            ) : (
              <EmptyState bordered={false}
                title={`Sin ${isSale ? 'ventas' : 'compras'} rápidas`}
                description={isSale
                  ? 'Registra una venta pequeña que ya ocurrió (mostrador, un servicio…). Quedará aquí y en tus finanzas, sin pasar por el pipeline.'
                  : 'Registra una compra pequeña que ya ocurrió (café, insumos urgentes…). Quedará aquí y en tus finanzas, sin pasar por el flujo de OC.'}
                action={{ label: isSale ? 'Nueva venta rápida' : 'Nueva compra rápida', onClick: onNew }} />
            )
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">{isSale ? 'Cliente' : 'Proveedor'}</th>
                  <th className="px-4 py-3">Detalle</th>
                  <th className="px-4 py-3">Inventario</th>
                  <th className="px-4 py-3">Origen</th>
                  <th className="px-4 py-3">Sucursal</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setDetail(r)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className="px-4 py-3 text-slate-500">{fmtDateTime(r.createdAt)}</td>
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
                    <td className="px-4 py-3">
                      {r.origin === 'invoice'
                        ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">📄 Factura</span>
                        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">✍️ Manual</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{r.branchName ?? '—'}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${isSale ? 'text-emerald-600' : 'text-slate-800 dark:text-slate-100'}`}>{isSale ? '+' : '−'}{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {detail && <RegisterDetailModal reg={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
