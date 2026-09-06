/**
 * HU-196 — Exportación a Excel de compras/ventas rápidas y facturas cargadas. Verifica que se genera
 * un .xlsx válido (firma ZIP) con encabezados y filas correctas, respetando el tipo (compra/venta).
 */
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { registersToXlsx, invoicesToXlsx, type InvoiceExportRow } from './export'
import type { QuickRegisterRow } from './service'

const reg = (over: Partial<QuickRegisterRow> = {}): QuickRegisterRow => ({
  id: 't1', kind: 'purchase', amount: 2600, description: 'Compra rápida — Líquido lavaloza (D1 SAS)',
  detail: 'Líquido lavaloza', counterparty: 'D1 SAS', date: new Date('2026-04-03T10:57:00Z'),
  branchName: 'Sede', affectsInventory: false, product: null, unitValue: 2600,
  origin: 'invoice', invoiceId: 'inv1', invoiceNumber: 'GOZ5292464', createdByName: 'Ana', createdAt: new Date('2026-04-03T10:58:00Z'),
  ...over,
}) as QuickRegisterRow

async function readSheet(buf: Buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb.worksheets[0]!
}

describe('HU-196 — export a Excel', () => {
  it('registersToXlsx: genera un xlsx con encabezado y una fila por registro', async () => {
    const buf = await registersToXlsx([reg(), reg({ id: 't2', affectsInventory: true, product: { sku: 'A1', name: 'Audífonos', unit: 'unidad', quantity: 2 } })], 'purchase')
    expect(buf.length).toBeGreaterThan(0)
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK') // firma ZIP (xlsx)
    const sheet = await readSheet(buf)
    expect(sheet.getRow(1).getCell(1).value).toBe('Fecha')
    expect(sheet.rowCount).toBe(3) // 1 encabezado + 2 filas
    expect(sheet.getRow(2).getCell(8).value).toBe('GOZ5292464') // columna N.º factura
  })

  it('registersToXlsx: en venta el encabezado del monto dice "Ingreso"', async () => {
    const sheet = await readSheet(await registersToXlsx([reg({ kind: 'sale' })], 'sale'))
    expect(sheet.getRow(1).getCell(11).value).toBe('Ingreso')
  })

  it('invoicesToXlsx: genera un xlsx con las columnas de la factura', async () => {
    const rows: InvoiceExportRow[] = [{ issuer: 'D1 SAS', nit: '900276962-1', invoiceNumber: 'GOZ5292464', date: new Date('2026-04-03'), total: 11250, hasImage: true, createdAt: new Date('2026-04-03') }]
    const sheet = await readSheet(await invoicesToXlsx(rows, 'purchase'))
    expect(sheet.getRow(1).getCell(4).value).toBe('N.º factura')
    expect(sheet.getRow(2).getCell(3).value).toBe('900276962-1')
    expect(sheet.getRow(2).getCell(5).value).toBe(11250)
  })
})
