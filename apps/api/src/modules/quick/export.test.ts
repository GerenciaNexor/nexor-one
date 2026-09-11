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
  // Cast al tipo exacto del parámetro: los @types/node recientes hacen Buffer genérico y choca con
  // la firma de ExcelJS.load (Buffer<ArrayBufferLike> vs Buffer).
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0])
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

  const invRow = (): InvoiceExportRow => ({
    issuer: 'GRAN FRUVER', counterpartyName: 'D1 SAS', documentType: 'CC', nit: '900276962-1',
    invoiceNumber: 'GOZ5292464', date: new Date('2026-04-03'), total: 11250, hasImage: true, createdAt: new Date('2026-04-03T12:00:00Z'),
  })

  it('invoicesToXlsx: proveedor + emisor y tipo de documento / número separados', async () => {
    const sheet = await readSheet(await invoicesToXlsx([invRow()], 'purchase'))
    expect(sheet.getRow(1).getCell(2).value).toBe('Proveedor')
    expect(sheet.getRow(1).getCell(4).value).toBe('Tipo de documento')
    expect(sheet.getRow(1).getCell(5).value).toBe('Número de documento')
    expect(sheet.getRow(1).getCell(6).value).toBe('N.º factura')
    expect(sheet.getRow(2).getCell(2).value).toBe('D1 SAS')         // proveedor registrado
    expect(sheet.getRow(2).getCell(3).value).toBe('GRAN FRUVER')    // emisor leído
    expect(sheet.getRow(2).getCell(4).value).toBe('CC')            // tipo de documento
    expect(sheet.getRow(2).getCell(5).value).toBe('900276962-1')   // documento completo
    expect(sheet.getRow(2).getCell(7).value).toBe(11250)           // total
  })

  it('invoicesToXlsx: opciones — columnas elegidas, documento sin dígito y formato de fecha', async () => {
    const sheet = await readSheet(await invoicesToXlsx([invRow()], 'purchase', {
      columns: ['date', 'document', 'total'], docDigitsOnly: true, dateFormat: 'ymd', includeTime: false,
    }))
    // Solo las 3 columnas pedidas, en el orden fijo.
    expect(sheet.getRow(1).getCell(1).value).toBe('Fecha factura')
    expect(sheet.getRow(1).getCell(2).value).toBe('Número de documento')
    expect(sheet.getRow(1).getCell(3).value).toBe('Total')
    expect(sheet.getRow(1).getCell(4).value).toBeFalsy()           // no hay 4ª columna
    expect(sheet.getRow(2).getCell(1).value).toBe('2026/04/03')    // formato AAAA/MM/DD (UTC)
    expect(sheet.getRow(2).getCell(2).value).toBe('900276962')     // solo antes del "-"
  })
})
