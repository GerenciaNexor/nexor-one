'use client'

import { Portal } from '@/components/ui/Portal'
import { fmtCalendarDate } from '@/lib/format-date'
import { InvoiceDetailModal } from '@/components/quick/InvoicesPanel'

/** Un registro del historial rápido, tal como lo devuelve listQuickRegisters. */
export interface QuickRegister {
  id: string
  kind: 'purchase' | 'sale'
  amount: number
  detail?: string
  description?: string
  counterparty?: string | null
  date: string
  branchName: string | null
  affectsInventory: boolean
  product: { sku: string; name: string; unit: string; quantity: number | null } | null
  unitValue?: number
  origin: 'manual' | 'invoice'
  invoiceId: string | null
  createdByName: string | null
  createdAt: string
}

const money = (n: number | null | undefined) => (n == null ? '—' : `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`)
const fmtDateTime = (iso: string) => { try { return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return iso } }

/**
 * HU-194-C — Detalle de un registro del historial rápido. Si vino de una FACTURA, reutiliza el detalle
 * completo (imagen + datos + información adicional, HU-194-A). Si fue MANUAL, muestra los datos
 * ingresados. En ambos casos: quién lo ingresó y cuándo.
 */
export function RegisterDetailModal({ reg, onClose }: { reg: QuickRegister; onClose: () => void }) {
  // Origen factura → detalle completo de factura (ya muestra "subido por X · fecha").
  if (reg.origin === 'invoice' && reg.invoiceId) {
    return <InvoiceDetailModal id={reg.invoiceId} kind={reg.kind} onClose={onClose} />
  }

  const isSale  = reg.kind === 'sale'
  const name    = reg.product?.name ?? reg.detail ?? reg.description ?? '—'
  const author  = reg.createdByName ?? 'Usuario del sistema'

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-slate-800 dark:text-slate-100">{value}</dd>
    </div>
  )

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/60 dark:bg-slate-900 dark:ring-slate-700" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{isSale ? 'Venta' : 'Compra'} rápida</h3>
              <p className="mt-0.5 text-xs text-slate-500">✍️ Ingreso manual · Ingresado por {author} · {fmtDateTime(reg.createdAt)}</p>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600">✕</button>
          </div>

          <dl className="mt-4 divide-y divide-slate-100 dark:divide-slate-700/60">
            <Row label={isSale ? 'Cliente' : 'Proveedor'} value={reg.counterparty ?? '—'} />
            <Row label={reg.affectsInventory ? 'Producto' : 'Concepto'} value={name} />
            {reg.affectsInventory && <Row label="Cantidad" value={`${reg.product?.quantity ?? '—'} ${reg.product?.unit ?? ''}`.trim()} />}
            {reg.affectsInventory && <Row label={isSale ? 'Precio unit.' : 'Costo unit.'} value={money(reg.unitValue)} />}
            <Row label="Sucursal" value={reg.branchName ?? '—'} />
            <Row label="Fecha" value={fmtCalendarDate(reg.date)} />
            <Row label="Inventario" value={reg.affectsInventory ? 'Sí (afectó stock)' : 'No (servicio/consumo)'} />
            <Row label={isSale ? 'Ingreso' : 'Gasto'} value={<span className={isSale ? 'text-emerald-600' : ''}>{money(reg.amount)}</span>} />
          </dl>
        </div>
      </div>
    </Portal>
  )
}
