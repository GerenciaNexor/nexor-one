import ExcelJS from 'exceljs'
import type { BulkUploadType } from './schema'

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface ColumnDef {
  key:         string
  label:       string
  required:    boolean
  type:        'texto' | 'número' | 'fecha' | 'lista'
  description: string
  example:     string
  validValues?: string[]
  width?:      number
}

// ─── Definiciones de columnas por tipo ───────────────────────────────────────

const COLUMNS: Record<BulkUploadType, ColumnDef[]> = {
  users: [
    {
      key: 'nombre', label: 'nombre', required: true, type: 'texto', width: 30,
      description: 'Nombre completo del usuario.',
      example: 'María González López',
    },
    {
      key: 'email', label: 'email', required: true, type: 'texto', width: 35,
      description: 'Correo electrónico. Debe ser único en todo el sistema.',
      example: 'maria.gonzalez@miempresa.co',
    },
    {
      key: 'contraseña', label: 'contraseña', required: false, type: 'texto', width: 25,
      description: 'Contraseña inicial (mínimo 8 caracteres). Si se deja vacío se genera una automáticamente y se muestra en el preview.',
      example: 'Contrasena2026*',
    },
    {
      key: 'rol', label: 'rol', required: true, type: 'lista', width: 22,
      description: 'Rol del usuario dentro del sistema.',
      example: 'OPERATIVE',
      validValues: ['OPERATIVE', 'AREA_MANAGER', 'BRANCH_ADMIN', 'TENANT_ADMIN'],
    },
    {
      key: 'modulo', label: 'modulo', required: false, type: 'lista', width: 15,
      description: 'Módulo asignado. Obligatorio si el rol es OPERATIVE o AREA_MANAGER.',
      example: 'KIRA',
      validValues: ['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'],
    },
    {
      key: 'sucursal_id', label: 'sucursal_id', required: false, type: 'texto', width: 32,
      description: 'Nombre o ID de la sucursal (ej: "Sede Norte"). Debe coincidir exactamente con el nombre en el sistema.',
      example: 'Sede Norte',
    },
  ],

  products: [
    {
      key: 'sku', label: 'sku', required: true, type: 'texto', width: 18,
      description: 'Código único del producto en tu catálogo. No puede repetirse.',
      example: 'PROD-001',
    },
    {
      key: 'nombre', label: 'nombre', required: true, type: 'texto', width: 35,
      description: 'Nombre descriptivo del producto.',
      example: 'Caja de guantes de nitrilo talla M',
    },
    {
      key: 'descripcion', label: 'descripcion', required: false, type: 'texto', width: 45,
      description: 'Descripción detallada del producto.',
      example: 'Caja x100 guantes de nitrilo azul, sin polvo, talla M',
    },
    {
      key: 'categoria', label: 'categoria', required: false, type: 'texto', width: 22,
      description: 'Categoría del producto para clasificación interna.',
      example: 'Insumos médicos',
    },
    {
      key: 'unidad', label: 'unidad', required: true, type: 'texto', width: 15,
      description: 'Unidad de medida (ej: unidad, caja, kg, litro, metro).',
      example: 'caja',
    },
    {
      key: 'precio_venta', label: 'precio_venta', required: false, type: 'número', width: 18,
      description: 'Precio de venta en pesos colombianos. Solo números.',
      example: '85000',
    },
    {
      key: 'precio_costo', label: 'precio_costo', required: false, type: 'número', width: 18,
      description: 'Precio de costo en pesos colombianos. Solo números.',
      example: '62000',
    },
    {
      key: 'stock_minimo', label: 'stock_minimo', required: false, type: 'número', width: 18,
      description: 'Cantidad mínima antes de generar alerta de reabastecimiento. Mínimo 0.',
      example: '5',
    },
    {
      key: 'stock_maximo', label: 'stock_maximo', required: false, type: 'número', width: 18,
      description: 'Cantidad máxima a mantener en inventario. Debe ser mayor al stock mínimo.',
      example: '50',
    },
  ],

  stock: [
    {
      key: 'sku', label: 'sku', required: true, type: 'texto', width: 18,
      description: 'SKU del producto ya registrado en el catálogo KIRA.',
      example: 'PROD-001',
    },
    {
      key: 'sucursal_id', label: 'sucursal_id', required: true, type: 'texto', width: 32,
      description: 'Nombre o ID de la sucursal (ej: "Sede Norte"). Debe coincidir exactamente con el nombre en el sistema.',
      example: 'Sede Norte',
    },
    {
      key: 'cantidad', label: 'cantidad', required: true, type: 'número', width: 15,
      description: 'Cantidad inicial en inventario para esa sucursal. No puede ser negativa.',
      example: '30',
    },
  ],

  suppliers: [
    {
      key: 'nombre', label: 'nombre', required: true, type: 'texto', width: 35,
      description: 'Razón social o nombre comercial del proveedor.',
      example: 'Distribuciones Médicas del Caribe S.A.S.',
    },
    {
      key: 'nit', label: 'nit', required: true, type: 'texto', width: 20,
      description: 'NIT o identificación tributaria. Debe ser único en tu catálogo de proveedores.',
      example: '900.123.456-7',
    },
    {
      key: 'dias_credito', label: 'dias_credito', required: true, type: 'número', width: 18,
      description: 'Días de plazo para pago. Debe ser un número positivo.',
      example: '30',
    },
    {
      key: 'contacto', label: 'contacto', required: false, type: 'texto', width: 30,
      description: 'Nombre del contacto principal en el proveedor.',
      example: 'Carlos Martínez',
    },
    {
      key: 'email', label: 'email', required: false, type: 'texto', width: 35,
      description: 'Correo electrónico del proveedor o del contacto.',
      example: 'ventas@dismedica.co',
    },
    {
      key: 'telefono', label: 'telefono', required: false, type: 'texto', width: 18,
      description: 'Teléfono de contacto. Incluye indicativo si es internacional.',
      example: '+57 5 3201234',
    },
    {
      key: 'ciudad', label: 'ciudad', required: false, type: 'texto', width: 20,
      description: 'Ciudad donde está ubicado el proveedor.',
      example: 'Barranquilla',
    },
    {
      key: 'notas', label: 'notas', required: false, type: 'texto', width: 45,
      description: 'Observaciones adicionales sobre el proveedor.',
      example: 'Entrega los martes y jueves. Mínimo de compra $500.000',
    },
  ],

  clients: [
    {
      key: 'nombre', label: 'nombre', required: true, type: 'texto', width: 35,
      description: 'Nombre completo del cliente o razón social.',
      example: 'Ana Lucía Pedraza',
    },
    {
      key: 'email', label: 'email', required: false, type: 'texto', width: 35,
      description: 'Correo electrónico del cliente.',
      example: 'ana.pedraza@gmail.com',
    },
    {
      key: 'telefono', label: 'telefono', required: false, type: 'texto', width: 18,
      description: 'Número de teléfono del cliente.',
      example: '+57 310 9876543',
    },
    {
      key: 'whatsapp', label: 'whatsapp', required: false, type: 'texto', width: 22,
      description: 'Número de WhatsApp (con indicativo). Si se provee debe ser único.',
      example: '573109876543',
    },
    {
      key: 'empresa', label: 'empresa', required: false, type: 'texto', width: 30,
      description: 'Empresa a la que pertenece el cliente (si aplica).',
      example: 'Constructora El Pino Ltda.',
    },
    {
      key: 'nit', label: 'nit', required: false, type: 'texto', width: 20,
      description: 'NIT de la empresa del cliente (si aplica).',
      example: '800.456.123-5',
    },
    {
      key: 'ciudad', label: 'ciudad', required: false, type: 'texto', width: 20,
      description: 'Ciudad de residencia o sede del cliente.',
      example: 'Medellín',
    },
    {
      key: 'origen', label: 'origen', required: false, type: 'lista', width: 18,
      description: 'Canal por el que llegó el cliente.',
      example: 'referido',
      validValues: ['whatsapp', 'email', 'manual', 'referido'],
    },
  ],

  appointments: [
    {
      key: 'nombre_cliente', label: 'nombre_cliente', required: true, type: 'texto', width: 30,
      description: 'Nombre completo del cliente para la cita.',
      example: 'Pedro Ramírez Suárez',
    },
    {
      key: 'servicio_id', label: 'servicio_id', required: true, type: 'texto', width: 32,
      description: 'ID del tipo de servicio. Consúltalo en AGENDA → Servicios.',
      example: 'cm1abc2def3ghi456',
    },
    {
      key: 'sucursal_id', label: 'sucursal_id', required: true, type: 'texto', width: 32,
      description: 'Nombre o ID de la sucursal (ej: "Sede Norte"). Debe coincidir exactamente con el nombre en el sistema.',
      example: 'Sede Norte',
    },
    {
      key: 'fecha_hora', label: 'fecha_hora', required: true, type: 'fecha', width: 25,
      description: 'Fecha y hora de inicio de la cita en formato ISO 8601. Debe ser una fecha futura.',
      example: '2026-07-15T10:00:00',
    },
    {
      key: 'telefono_cliente', label: 'telefono_cliente', required: false, type: 'texto', width: 22,
      description: 'Teléfono de contacto del cliente para recordatorios.',
      example: '+57 321 1234567',
    },
    {
      key: 'notas', label: 'notas', required: false, type: 'texto', width: 45,
      description: 'Observaciones o instrucciones especiales para la cita.',
      example: 'Paciente alérgico a la penicilina',
    },
  ],

  transactions: [
    {
      key: 'tipo', label: 'tipo', required: true, type: 'lista', width: 14,
      description: 'Tipo de movimiento financiero.',
      example: 'egreso',
      validValues: ['ingreso', 'egreso'],
    },
    {
      key: 'monto', label: 'monto', required: true, type: 'número', width: 18,
      description: 'Valor de la transacción en pesos colombianos. Debe ser positivo.',
      example: '250000',
    },
    {
      key: 'descripcion', label: 'descripcion', required: true, type: 'texto', width: 45,
      description: 'Descripción breve del movimiento.',
      example: 'Compra de materiales de oficina',
    },
    {
      key: 'fecha', label: 'fecha', required: true, type: 'fecha', width: 16,
      description: 'Fecha de la transacción en formato YYYY-MM-DD.',
      example: '2026-06-15',
    },
    {
      key: 'categoria_id', label: 'categoria_id', required: false, type: 'texto', width: 32,
      description: 'ID de la categoría VERA. Consúltala en VERA → Categorías.',
      example: 'cm1cat2eg3ory456',
    },
    {
      key: 'sucursal_id', label: 'sucursal_id', required: false, type: 'texto', width: 32,
      description: 'Nombre o ID de la sucursal (ej: "Sede Norte"). Debe coincidir exactamente con el nombre en el sistema.',
      example: 'Sede Norte',
    },
  ],
}

// ─── Nombres de archivo y de hoja ─────────────────────────────────────────────

const TEMPLATE_NAMES: Record<BulkUploadType, string> = {
  users:        'Usuarios',
  products:     'Productos',
  stock:        'StockInicial',
  suppliers:    'Proveedores',
  clients:      'Clientes',
  appointments: 'Citas',
  transactions: 'Transacciones',
}

// ─── Paleta de colores ────────────────────────────────────────────────────────

const COLORS = {
  headerRequired: 'FFBDD7EE',  // Azul claro
  headerOptional: 'FFD9D9D9',  // Gris claro
  headerFont:     'FF1F3864',  // Azul oscuro (texto)
  exampleGreen:   'FF00703C',  // Verde oscuro (texto fila ejemplo)
  instrTitle:     'FF1F3864',  // Azul oscuro (título instrucciones)
  instrRequired:  'FFBDD7EE',  // Azul claro (fondo fila obligatoria en instrucciones)
  instrHeader:    'FF1F3864',  // Azul oscuro (cabecera tabla instrucciones)
  instrHeaderFont:'FFFFFFFF',  // Blanco
}

// ─── Generador principal ──────────────────────────────────────────────────────

export async function generateTemplate(type: BulkUploadType): Promise<Buffer> {
  const cols = COLUMNS[type]
  const name = TEMPLATE_NAMES[type]

  const workbook = new ExcelJS.Workbook()
  workbook.creator  = 'NEXOR'
  workbook.created  = new Date()
  workbook.modified = new Date()

  buildDataSheet(workbook, type, cols, name)
  buildInstructionsSheet(workbook, cols, name)

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export function getTemplateFileName(type: BulkUploadType): string {
  return `NEXOR_Plantilla_${TEMPLATE_NAMES[type]}.xlsx`
}

// ─── Hoja de Datos ────────────────────────────────────────────────────────────

function buildDataSheet(
  workbook: ExcelJS.Workbook,
  type: BulkUploadType,
  cols: ColumnDef[],
  name: string,
): void {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  // Definir columnas
  sheet.columns = cols.map((col) => ({
    key:   col.key,
    width: col.width ?? 20,
  }))

  // ── Fila 1: Encabezados — sin asterisco para que el archivo sea reutilizable ──
  const headerRow = sheet.addRow(
    cols.map((col) => col.key),
  )

  headerRow.eachCell((cell, colIndex) => {
    const col = cols[colIndex - 1]!
    cell.font = {
      bold:  true,
      color: { argb: COLORS.headerFont },
      size:  11,
    }
    cell.fill = {
      type:    'pattern',
      pattern: 'solid',
      fgColor: { argb: col.required ? COLORS.headerRequired : COLORS.headerOptional },
    }
    cell.border = {
      bottom: { style: 'medium', color: { argb: COLORS.headerFont } },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }
  })
  headerRow.height = 22

  // ── Fila 2: Ejemplo ─────────────────────────────────────────────────────────
  const exampleRow = sheet.addRow(cols.map((col) => col.example))

  exampleRow.eachCell((cell) => {
    cell.font = {
      italic: true,
      color:  { argb: COLORS.exampleGreen },
      size:   10,
    }
    cell.fill = {
      type:    'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2EFDA' },  // verde muy tenue
    }
  })

  // ── Validaciones de lista desplegable (filas 2..1001) ───────────────────────
  cols.forEach((col, colIdx) => {
    if (!col.validValues?.length) return

    const colLetter = columnLetter(colIdx + 1)
    const formula   = `"${col.validValues.join(',')}"`

    for (let row = 2; row <= 1001; row++) {
      const cell = sheet.getCell(`${colLetter}${row}`)
      cell.dataValidation = {
        type:        'list',
        allowBlank:  true,
        formulae:    [formula],
        showErrorMessage: true,
        errorTitle:  'Valor inválido',
        error:       `Los valores permitidos son: ${col.validValues.join(', ')}`,
      }
    }
  })
}

// ─── Hoja de Instrucciones ────────────────────────────────────────────────────

function buildInstructionsSheet(
  workbook: ExcelJS.Workbook,
  cols: ColumnDef[],
  templateName: string,
): void {
  const sheet = workbook.addWorksheet('Instrucciones')

  sheet.columns = [
    { key: 'col',         width: 22 },
    { key: 'required',    width: 14 },
    { key: 'type',        width: 14 },
    { key: 'description', width: 55 },
    { key: 'example',     width: 35 },
    { key: 'values',      width: 40 },
  ]

  // ── Título ───────────────────────────────────────────────────────────────────
  const titleRow = sheet.addRow([`Instrucciones — Plantilla de ${templateName}`])
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: COLORS.instrTitle } }
  sheet.mergeCells(`A1:F1`)
  titleRow.height = 28

  // ── Subtítulo ────────────────────────────────────────────────────────────────
  const subRow = sheet.addRow([
    'Las columnas marcadas con * son OBLIGATORIAS. Las celdas con fondo azul en la hoja de datos son obligatorias.',
  ])
  subRow.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF555555' } }
  sheet.mergeCells(`A2:F2`)
  subRow.height = 18

  sheet.addRow([])  // espacio

  // ── Cabecera de tabla ────────────────────────────────────────────────────────
  const headerRow = sheet.addRow(['Columna', 'Obligatoria', 'Tipo de dato', 'Descripción', 'Ejemplo', 'Valores permitidos'])
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.instrHeaderFont }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.instrHeader } }
    cell.border = {
      top:    { style: 'thin' },
      bottom: { style: 'thin' },
      left:   { style: 'thin' },
      right:  { style: 'thin' },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  headerRow.height = 20

  // ── Filas por columna ────────────────────────────────────────────────────────
  for (const col of cols) {
    const row = sheet.addRow([
      col.required ? `${col.key}*` : col.key,
      col.required ? 'Sí' : 'No',
      col.type,
      col.description,
      col.example,
      col.validValues?.join(', ') ?? '—',
    ])

    // Fondo azul para obligatorias
    if (col.required) {
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.instrRequired } }
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.instrRequired } }
    }

    row.eachCell((cell) => {
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left:   { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right:  { style: 'thin', color: { argb: 'FFE0E0E0' } },
      }
      cell.alignment = { vertical: 'top', wrapText: true }
    })

    row.getCell(1).font = { bold: col.required, size: 10 }
    row.getCell(2).alignment = { vertical: 'top', horizontal: 'center' }
    row.height = Math.max(20, Math.ceil(col.description.length / 55) * 15)
  }

  // ── Notas finales ────────────────────────────────────────────────────────────
  sheet.addRow([])
  const noteRow = sheet.addRow(['Notas importantes:'])
  noteRow.getCell(1).font = { bold: true, size: 11, color: { argb: COLORS.instrTitle } }
  sheet.mergeCells(`A${noteRow.number}:F${noteRow.number}`)

  const notes = [
    '1. Elimina la fila de ejemplo (fila 2) antes de subir el archivo.',
    '2. No cambies los nombres de las columnas — el sistema los reconoce exactamente como están.',
    '3. No uses fórmulas en las celdas — solo valores directos.',
    '4. Los IDs (sucursal_id, servicio_id, etc.) los puedes obtener desde el módulo correspondiente en NEXOR.',
    '5. El archivo debe estar en formato .xlsx (Excel 2007 o superior).',
  ]

  for (const note of notes) {
    const r = sheet.addRow([note])
    r.getCell(1).font = { size: 10, color: { argb: 'FF333333' } }
    sheet.mergeCells(`A${r.number}:F${r.number}`)
  }
}

// ─── Util: letra de columna ───────────────────────────────────────────────────

function columnLetter(col: number): string {
  let letter = ''
  while (col > 0) {
    const rem = (col - 1) % 26
    letter = String.fromCharCode(65 + rem) + letter
    col = Math.floor((col - 1) / 26)
  }
  return letter
}
