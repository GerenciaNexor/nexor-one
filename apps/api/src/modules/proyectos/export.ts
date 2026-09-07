import ExcelJS from 'exceljs'
import type { ProjectTxRow } from './service'

// HU-202 — Excel del historial detallado de transacciones asignadas a un proyecto (respeta el filtro).

const fmtDate = (d: Date | string): string => {
  const date = typeof d === 'string' ? new Date(d) : d
  return isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

const STATUS_LABEL: Record<string, string> = {
  assigned:   'Asignada',
  over_limit: 'Sobre-límite',
  pending:    'En espera',
}

export async function projectTxToXlsx(projectName: string, rows: ProjectTxRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('Transacciones')
  sheet.columns = [
    { header: 'Fecha',       key: 'date',        width: 16 },
    { header: 'Tipo',        key: 'type',        width: 12 },
    { header: 'Descripción', key: 'description', width: 48 },
    { header: 'Categoría',   key: 'category',    width: 20 },
    { header: 'Estado',      key: 'status',      width: 14 },
    { header: 'Monto',       key: 'amount',      width: 16 },
  ]
  for (const r of rows) {
    sheet.addRow({
      date:        fmtDate(r.date),
      type:        r.type === 'income' ? 'Venta / ingreso' : 'Compra / gasto',
      description: r.description,
      category:    r.category ?? '',
      status:      r.assignmentStatus ? (STATUS_LABEL[r.assignmentStatus] ?? r.assignmentStatus) : '',
      // Monto SIEMPRE positivo: el tipo (compra/venta) ya indica la naturaleza; no se muestra en negativo.
      amount:      r.amount,
    })
  }
  sheet.getColumn('amount').numFmt = '#,##0'

  // Fila de total = suma del avance/consumo del proyecto (montos positivos, como en la UI).
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const totalRow = sheet.addRow({ description: 'TOTAL', amount: total })
  totalRow.font = { bold: true }

  const head = sheet.getRow(1)
  head.font = { bold: true, color: { argb: 'FF1F3864' } }
  head.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } } })
  head.height = 20

  return Buffer.from(await wb.xlsx.writeBuffer())
}
