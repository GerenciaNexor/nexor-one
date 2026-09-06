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
  issuer: string | null; nit: string | null; invoiceNumber: string | null
  date: Date | string | null; total: number | null; hasImage: boolean; createdAt: Date | string
}

/** Excel de las facturas cargadas (por OCR) ya filtradas. */
export async function invoicesToXlsx(rows: InvoiceExportRow[], kind: Kind): Promise<Buffer> {
  const isSale = kind === 'sale'
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('Facturas cargadas')
  sheet.columns = [
    { header: 'Fecha factura',                  key: 'date',          width: 16 },
    { header: isSale ? 'Cliente' : 'Emisor',    key: 'issuer',        width: 32 },
    { header: 'NIT / documento',                key: 'nit',           width: 20 },
    { header: 'N.º factura',                     key: 'invoiceNumber', width: 20 },
    { header: 'Total',                           key: 'total',         width: 16 },
    { header: 'Imagen',                          key: 'hasImage',      width: 10 },
    { header: 'Cargada el',                      key: 'createdAt',     width: 20 },
  ]
  for (const r of rows) {
    sheet.addRow({
      date:          fmtDate(r.date),
      issuer:        r.issuer ?? '',
      nit:           r.nit ?? '',
      invoiceNumber: r.invoiceNumber ?? '',
      total:         r.total ?? '',
      hasImage:      r.hasImage ? 'Sí' : 'No',
      createdAt:     fmtDate(r.createdAt),
    })
  }
  sheet.getColumn('total').numFmt = '#,##0'
  styleHeader(sheet)
  return toBuffer(wb)
}
