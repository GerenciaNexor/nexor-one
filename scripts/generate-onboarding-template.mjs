import ExcelJS from 'exceljs'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'docs')
const OUT_FILE = path.join(OUT_DIR, 'NEXOR_Onboarding_Template.xlsx')

fs.mkdirSync(OUT_DIR, { recursive: true })

// ─── Colores ──────────────────────────────────────────────────────────────────
const C = {
  NEXOR_DARK:   'FF1A3A5C', // Azul oscuro NEXOR (encabezados obligatorios)
  NEXOR_LIGHT:  'FFD6E4F0', // Azul claro (fondo encabezados obligatorios)
  OPT_TEXT:     'FF595959', // Gris texto (opcionales)
  OPT_BG:       'FFF2F2F2', // Gris fondo (opcionales)
  EXAMPLE_BG:   'FFE8F5E9', // Verde claro (fila ejemplo)
  INSTR_BG:     'FFFFF9C4', // Amarillo (fila instrucciones)
  INSTR_TEXT:   'FF5D4037', // Marrón (texto instrucciones)
  WHITE:        'FFFFFFFF',
  BORDER:       'FFB0BEC5',
}

const workbook = new ExcelJS.Workbook()
workbook.creator = 'NEXOR'
workbook.lastModifiedBy = 'NEXOR'
workbook.created = new Date()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function border() {
  const side = { style: 'thin', color: { argb: C.BORDER } }
  return { top: side, left: side, bottom: side, right: side }
}

function addInstructionRow(sheet, text, colCount) {
  const row = sheet.addRow([text])
  sheet.mergeCells(row.number, 1, row.number, colCount)
  const cell = row.getCell(1)
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.INSTR_BG } }
  cell.font = { color: { argb: C.INSTR_TEXT }, italic: true, size: 10 }
  cell.alignment = { wrapText: true, vertical: 'middle' }
  row.height = 42
  return row
}

function addHeaderRow(sheet, columns) {
  // columns: [{ label, required }]
  const values = columns.map(c => c.required ? `${c.label} *` : c.label)
  const row = sheet.addRow(values)
  row.height = 22

  columns.forEach((col, i) => {
    const cell = row.getCell(i + 1)
    if (col.required) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.NEXOR_LIGHT } }
      cell.font = { bold: true, color: { argb: C.NEXOR_DARK }, size: 10 }
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.OPT_BG } }
      cell.font = { bold: true, color: { argb: C.OPT_TEXT }, size: 10 }
    }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = border()
  })
  return row
}

function addExampleRow(sheet, values, columns) {
  const row = sheet.addRow(values)
  row.height = 18
  columns.forEach((_, i) => {
    const cell = row.getCell(i + 1)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.EXAMPLE_BG } }
    cell.font = { italic: true, size: 10, color: { argb: 'FF2E7D32' } }
    cell.alignment = { vertical: 'middle' }
    cell.border = border()
  })
  return row
}

function addLegendRow(sheet, colCount) {
  const legendRow = sheet.addRow([''])
  sheet.mergeCells(legendRow.number, 1, legendRow.number, colCount)
  legendRow.getCell(1).value = '* Campo obligatorio   |   Sin asterisco = campo opcional   |   Fila verde = ejemplo de llenado'
  legendRow.getCell(1).font = { size: 9, color: { argb: C.OPT_TEXT }, italic: true }
  legendRow.getCell(1).alignment = { horizontal: 'center' }
  legendRow.height = 14
}

function setColumnWidths(sheet, widths) {
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w
  })
}

function freezeRow(sheet, row) {
  sheet.views = [{ state: 'frozen', ySplit: row }]
}

// =============================================================================
// PESTAÑA 1 — Empresa
// =============================================================================

const sheetEmpresa = workbook.addWorksheet('Empresa', { tabColor: { argb: 'FF1A3A5C' } })

const colsEmpresa = [
  { label: 'Nombre comercial',         required: true  },
  { label: 'Nombre legal / Razón social', required: true  },
  { label: 'NIT / RUT',                required: true  },
  { label: 'Zona horaria',             required: true  },
  { label: 'Moneda',                   required: true  },
  { label: 'Logo URL o archivo',       required: false },
]

addInstructionRow(sheetEmpresa,
  'INSTRUCCIONES — Empresa: Complete los datos de la empresa. Todos los campos con asterisco (*) son obligatorios. ' +
  'Zona horaria: usar formato IANA, ej: America/Bogota, America/Mexico_City, America/Lima. ' +
  'Moneda: usar código ISO 4217, ej: COP, MXN, PEN, USD.',
  colsEmpresa.length)

addHeaderRow(sheetEmpresa, colsEmpresa)

addExampleRow(sheetEmpresa,
  ['Farmacia López', 'Farmacia López S.A.S.', '900123456-7', 'America/Bogota', 'COP', '(dejar vacío o pegar URL)'],
  colsEmpresa)

addLegendRow(sheetEmpresa, colsEmpresa.length)
setColumnWidths(sheetEmpresa, [25, 30, 18, 22, 10, 30])
freezeRow(sheetEmpresa, 2)

// =============================================================================
// PESTAÑA 2 — Sucursales
// =============================================================================

const sheetSucursales = workbook.addWorksheet('Sucursales', { tabColor: { argb: 'FF1565C0' } })

const colsSucursales = [
  { label: 'Nombre de la sucursal', required: true  },
  { label: 'Ciudad',                required: true  },
  { label: 'Dirección',             required: false },
  { label: 'Teléfono',              required: false },
]

addInstructionRow(sheetSucursales,
  'INSTRUCCIONES — Sucursales: Agregue una fila por cada sucursal o sede de la empresa. ' +
  'El nombre de la sucursal debe ser exacto: se referenciará en las pestañas "Stock inicial" y "Usuarios". ' +
  'Se requiere al menos 1 sucursal.',
  colsSucursales.length)

addHeaderRow(sheetSucursales, colsSucursales)

addExampleRow(sheetSucursales,
  ['Sede Norte', 'Bogotá', 'Cra 10 #20-30, Local 5', '601 234 5678'],
  colsSucursales)

addExampleRow(sheetSucursales,
  ['Sede Sur', 'Medellín', 'Cl 80 #45-12', '604 987 6543'],
  colsSucursales)

addLegendRow(sheetSucursales, colsSucursales.length)
setColumnWidths(sheetSucursales, [28, 18, 32, 18])
freezeRow(sheetSucursales, 2)

// =============================================================================
// PESTAÑA 3 — Usuarios
// =============================================================================

const sheetUsuarios = workbook.addWorksheet('Usuarios', { tabColor: { argb: 'FF6A1B9A' } })

const colsUsuarios = [
  { label: 'Nombre completo',              required: true  },
  { label: 'Email',                        required: true  },
  { label: 'Rol',                          required: true  },
  { label: 'Módulo (si aplica)',           required: false },
  { label: 'Sucursal asignada',            required: false },
]

addInstructionRow(sheetUsuarios,
  'INSTRUCCIONES — Usuarios: Complete un usuario por fila. NO incluir contraseñas — el sistema las envía por email de invitación. ' +
  'Roles válidos: TENANT_ADMIN (admin general), BRANCH_ADMIN (admin sucursal), AREA_MANAGER (jefe de área), OPERATIVE (operativo). ' +
  'Módulo: solo completar si el rol es AREA_MANAGER u OPERATIVE. Valores: ARI, NIRA, KIRA, AGENDA, VERA. ' +
  'Sucursal asignada: escribir el nombre exacto tal como aparece en la pestaña Sucursales. TENANT_ADMIN puede dejarse vacío.',
  colsUsuarios.length)

addHeaderRow(sheetUsuarios, colsUsuarios)

addExampleRow(sheetUsuarios,
  ['María García', 'maria@empresa.com', 'TENANT_ADMIN', '', ''],
  colsUsuarios)

addExampleRow(sheetUsuarios,
  ['Carlos Ruiz', 'carlos@empresa.com', 'BRANCH_ADMIN', '', 'Sede Norte'],
  colsUsuarios)

addExampleRow(sheetUsuarios,
  ['Ana Torres', 'ana@empresa.com', 'AREA_MANAGER', 'KIRA', 'Sede Norte'],
  colsUsuarios)

addExampleRow(sheetUsuarios,
  ['Luis Mora', 'luis@empresa.com', 'OPERATIVE', 'ARI', 'Sede Sur'],
  colsUsuarios)

addLegendRow(sheetUsuarios, colsUsuarios.length)
setColumnWidths(sheetUsuarios, [28, 32, 18, 18, 26])
freezeRow(sheetUsuarios, 2)

// Validación de lista en columna Rol
sheetUsuarios.getColumn(3).eachCell({ includeEmpty: false }, (cell, rowNum) => {
  if (rowNum <= 2) return
})
for (let r = 3; r <= 100; r++) {
  sheetUsuarios.getCell(r, 3).dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: ['"TENANT_ADMIN,BRANCH_ADMIN,AREA_MANAGER,OPERATIVE"'],
    showErrorMessage: true,
    errorTitle: 'Rol inválido',
    error: 'Use: TENANT_ADMIN, BRANCH_ADMIN, AREA_MANAGER u OPERATIVE',
  }
  sheetUsuarios.getCell(r, 4).dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: ['"ARI,NIRA,KIRA,AGENDA,VERA"'],
    showErrorMessage: true,
    errorTitle: 'Módulo inválido',
    error: 'Use: ARI, NIRA, KIRA, AGENDA o VERA',
  }
}

// =============================================================================
// PESTAÑA 4 — Productos
// =============================================================================

const sheetProductos = workbook.addWorksheet('Productos', { tabColor: { argb: 'FF2E7D32' } })

const colsProductos = [
  { label: 'SKU',               required: true  },
  { label: 'Nombre',            required: true  },
  { label: 'Categoría',         required: false },
  { label: 'Unidad de medida',  required: true  },
  { label: 'Precio de venta',   required: false },
  { label: 'Precio de costo',   required: false },
  { label: 'Stock mínimo',      required: true  },
  { label: 'Stock máximo',      required: false },
]

addInstructionRow(sheetProductos,
  'INSTRUCCIONES — Productos (KIRA): Complete un producto por fila. El SKU debe ser único y se usará en la pestaña "Stock inicial". ' +
  'Unidad de medida: unidad, kg, litro, caja, par, etc. ' +
  'Stock mínimo: el sistema enviará alerta cuando el stock baje de este valor. ' +
  'Precios: en la moneda definida en la pestaña Empresa, sin símbolo ni puntos de miles (ej: 15000).',
  colsProductos.length)

addHeaderRow(sheetProductos, colsProductos)

addExampleRow(sheetProductos,
  ['SHAM-001', 'Shampoo Pantene 400ml', 'Cuidado personal', 'unidad', 15000, 9000, 10, 100],
  colsProductos)

addExampleRow(sheetProductos,
  ['CREM-002', 'Crema hidratante 200ml', 'Cuidado personal', 'unidad', 28000, 16000, 5, 50],
  colsProductos)

addExampleRow(sheetProductos,
  ['MED-003', 'Acetaminofén 500mg x10', 'Medicamentos', 'caja', 4500, 2800, 20, 200],
  colsProductos)

addLegendRow(sheetProductos, colsProductos.length)
setColumnWidths(sheetProductos, [14, 32, 22, 18, 16, 16, 14, 14])
freezeRow(sheetProductos, 2)

// =============================================================================
// PESTAÑA 5 — Stock inicial
// =============================================================================

const sheetStock = workbook.addWorksheet('Stock inicial', { tabColor: { argb: 'FFF57F17' } })

const colsStock = [
  { label: 'SKU del producto',           required: true },
  { label: 'Nombre de la sucursal',      required: true },
  { label: 'Cantidad actual en stock',   required: true },
]

addInstructionRow(sheetStock,
  'INSTRUCCIONES — Stock inicial (KIRA): Indique cuántas unidades tiene actualmente de cada producto en cada sucursal. ' +
  '⚠️ IMPORTANTE: El SKU debe coincidir EXACTAMENTE con el SKU de la pestaña Productos. ' +
  'El nombre de la sucursal debe coincidir EXACTAMENTE con el nombre de la pestaña Sucursales. ' +
  'Si un producto no tiene stock en una sucursal, simplemente no agregue esa fila.',
  colsStock.length)

addHeaderRow(sheetStock, colsStock)

addExampleRow(sheetStock, ['SHAM-001', 'Sede Norte', 45], colsStock)
addExampleRow(sheetStock, ['SHAM-001', 'Sede Sur', 30], colsStock)
addExampleRow(sheetStock, ['CREM-002', 'Sede Norte', 12], colsStock)
addExampleRow(sheetStock, ['MED-003', 'Sede Norte', 80], colsStock)

addLegendRow(sheetStock, colsStock.length)
setColumnWidths(sheetStock, [20, 28, 24])
freezeRow(sheetStock, 2)

// =============================================================================
// PESTAÑA 6 — Proveedores
// =============================================================================

const sheetProveedores = workbook.addWorksheet('Proveedores', { tabColor: { argb: 'FFC62828' } })

const colsProveedores = [
  { label: 'Nombre del proveedor',  required: false },
  { label: 'Nombre del contacto',   required: false },
  { label: 'Email',                 required: false },
  { label: 'Teléfono',              required: false },
  { label: 'NIT / RUT',             required: false },
  { label: 'Días de crédito',       required: false },
]

addInstructionRow(sheetProveedores,
  'INSTRUCCIONES — Proveedores (NIRA): Esta pestaña es completamente opcional. ' +
  'Si el módulo NIRA (Compras) está activo, complete aquí los proveedores actuales de la empresa para que queden cargados desde el inicio. ' +
  'Días de crédito: número de días que el proveedor da de plazo para pagar (ej: 30, 60, 90). Dejar vacío si es pago inmediato.',
  colsProveedores.length)

addHeaderRow(sheetProveedores, colsProveedores)

addExampleRow(sheetProveedores,
  ['Distribuidora Reyes', 'Pedro Reyes', 'pedro@reyes.com', '310 987 6543', '800456789-1', 30],
  colsProveedores)

addExampleRow(sheetProveedores,
  ['Laboratorios Norte', 'Sandra López', 'sandra@labnorte.com', '601 555 1234', '900654321-2', 60],
  colsProveedores)

addLegendRow(sheetProveedores, colsProveedores.length)
setColumnWidths(sheetProveedores, [28, 26, 30, 18, 18, 16])
freezeRow(sheetProveedores, 2)

// =============================================================================
// Guardar
// =============================================================================

await workbook.xlsx.writeFile(OUT_FILE)
console.log(`✅ Plantilla generada: ${OUT_FILE}`)
