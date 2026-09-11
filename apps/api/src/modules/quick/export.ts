import ExcelJS from 'exceljs'
import type { QuickRegisterRow } from './service'

// HU-196 — Exportación a Excel de lo que trae el filtro (compras/ventas rápidas y facturas cargadas).

type Kind = 'purchase' | 'sale'

const fmtDate = (d: Date | string | null): string => {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  return isNaN(date.getTime()) ? '' : date.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

function styleHeader(sheet: ExcelJS.Worksheet): void {
  const row = sheet.getRow(1)
  row.font = { bold: true, color: { argb: 'FF1F3864' } }
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } }
    cell.alignment = { vertical: 'middle' }
  })
  row.height = 20
}

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** Excel del historial de registros rápidos (compras o ventas) ya filtrado. */
export async function registersToXlsx(rows: QuickRegisterRow[], kind: Kind): Promise<Buffer> {
  const isSale = kind === 'sale'
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet(isSale ? 'Ventas rápidas' : 'Compras rápidas')
  sheet.columns = [
    { header: 'Fecha',                          key: 'date',        width: 20 },
    { header: isSale ? 'Cliente' : 'Proveedor', key: 'counterparty', width: 30 },
    { header: 'Detalle',                         key: 'detail',      width: 35 },
    { header: 'Producto',                        key: 'product',     width: 28 },
    { header: 'Cantidad',                        key: 'quantity',    width: 12 },
    { header: 'Inventario',                      key: 'inventory',   width: 14 },
    { header: 'Origen',                          key: 'origin',      width: 12 },
    { header: 'N.º factura',                     key: 'invoiceNumber', width: 18 },
    { header: 'Sucursal',                        key: 'branch',      width: 20 },
    { header: 'Registrado por',                  key: 'author',      width: 24 },
    { header: isSale ? 'Ingreso' : 'Egreso',     key: 'amount',      width: 16 },
  ]
  for (const r of rows) {
    sheet.addRow({
      date:          fmtDate(r.date ?? r.createdAt),
      counterparty:  r.counterparty ?? '',
      detail:        r.product ? r.product.name : r.detail,
      product:       r.product ? `${r.product.name} (${r.product.sku})` : '',
      quantity:      r.product?.quantity ?? '',
      inventory:     r.affectsInventory ? 'Sí (stock)' : 'Servicio',
      origin:        r.origin === 'invoice' ? 'Factura' : 'Manual',
      invoiceNumber: r.invoiceNumber ?? '',
      branch:        r.branchName ?? '',
      author:        r.createdByName ?? '',
      amount:        r.amount,
    })
  }
  sheet.getColumn('amount').numFmt = '#,##0'
  styleHeader(sheet)
  return toBuffer(wb)
}

export interface InvoiceExportRow {
  counterpartyName?: string | null; issuer: string | null; documentType?: string | null; nit: string | null; invoiceNumber: string | null
  date: Date | string | null; total: number | null; hasImage: boolean; createdAt: Date | string
}

/** HU-210 — opciones de la exportación de facturas (las elige el usuario en el modal de descarga). */
export type DateFormat = 'dmy' | 'mdy' | 'ymd'
export interface InvoiceExportOptions {
  dateFormat?:    DateFormat   // orden de la fecha (default dmy = DD/MM/AAAA)
  includeTime?:   boolean      // incluir la hora en "Cargada el" (default true)
  columns?:       string[]     // claves de columnas a incluir (default: todas)
  docDigitsOnly?: boolean      // documento: solo lo anterior al "-" (sin dígito de verificación)
}

/** Formatea una fecha con el ORDEN elegido. `tz` fija la zona (UTC para fechas puras; Bogotá para timestamps). */
function fmtDateOrder(d: Date | string | null, order: DateFormat, withTime: boolean, tz: string): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('es-CO', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const y = get('year'), m = get('month'), da = get('day')
  let s = order === 'mdy' ? `${m}/${da}/${y}` : order === 'ymd' ? `${y}/${m}/${da}` : `${da}/${m}/${y}`
  if (withTime) s += ' ' + new Intl.DateTimeFormat('es-CO', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true }).format(date)
  return s
}

/** Orden fijo de las columnas de facturas (para el Excel y para el selector del modal). */
export const INVOICE_EXPORT_COLUMNS = ['date', 'counterparty', 'issuer', 'documentType', 'document', 'invoiceNumber', 'total', 'hasImage', 'createdAt'] as const
export type InvoiceExportColumn = (typeof INVOICE_EXPORT_COLUMNS)[number]

/** Excel de las facturas cargadas (por OCR) ya filtradas, con las opciones elegidas por el usuario. */
export async function invoicesToXlsx(rows: InvoiceExportRow[], kind: Kind, options: InvoiceExportOptions = {}): Promise<Buffer> {
  const isSale = kind === 'sale'
  const order       = options.dateFormat ?? 'dmy'
  const includeTime = options.includeTime !== false
  const docNumber = (nit: string | null): string => {
    if (!nit) return ''
    return options.docDigitsOnly ? (nit.split('-')[0] ?? nit) : nit
  }

  // Catálogo de columnas: encabezado + cómo obtener el valor de cada fila.
  const cols: Record<InvoiceExportColumn, { header: string; width: number; num?: boolean; get: (r: InvoiceExportRow) => string | number }> = {
    date:          { header: 'Fecha factura',              width: 16, get: (r) => fmtDateOrder(r.date, order, false, 'UTC') },
    counterparty:  { header: isSale ? 'Cliente' : 'Proveedor', width: 32, get: (r) => r.counterpartyName ?? '' },
    issuer:        { header: 'Emisor (factura)',           width: 32, get: (r) => r.issuer ?? '' },
    documentType:  { header: 'Tipo de documento',          width: 18, get: (r) => r.documentType ?? '' },
    document:      { header: 'Número de documento',        width: 20, get: (r) => docNumber(r.nit) },
    invoiceNumber: { header: 'N.º factura',                width: 20, get: (r) => r.invoiceNumber ?? '' },
    total:         { header: 'Total',                      width: 16, num: true, get: (r) => r.total ?? '' },
    hasImage:      { header: 'Imagen',                     width: 10, get: (r) => (r.hasImage ? 'Sí' : 'No') },
    createdAt:     { header: 'Cargada el',                 width: 20, get: (r) => fmtDateOrder(r.createdAt, order, includeTime, 'America/Bogota') },
  }

  const requested = options.columns?.length
    ? INVOICE_EXPORT_COLUMNS.filter((k) => options.columns!.includes(k))
    : [...INVOICE_EXPORT_COLUMNS]
  const selected = requested.length ? requested : [...INVOICE_EXPORT_COLUMNS]  // nunca vacío

  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('Facturas cargadas')
  sheet.columns = selected.map((k) => ({ header: cols[k].header, key: k, width: cols[k].width }))
  for (const r of rows) {
    const row: Record<string, string | number> = {}
    for (const k of selected) row[k] = cols[k].get(r)
    sheet.addRow(row)
  }
  if (selected.includes('total')) sheet.getColumn('total').numFmt = '#,##0'
  styleHeader(sheet)
  return toBuffer(wb)
}
