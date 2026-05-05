import ExcelJS from 'exceljs'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import {
  REQUIRED_COLUMNS,
  UserRowSchema,
  ProductRowSchema,
  StockRowSchema,
  SupplierRowSchema,
  ClientRowSchema,
  AppointmentRowSchema,
  TransactionRowSchema,
  type BulkUploadType,
  type RowError,
} from './schema'

// ─── Metadatos comunes de un archivo subido ───────────────────────────────────

export interface UploadMeta {
  fileName:   string
  fileSize:   number
  rowCount:   number
  fileBuffer: Buffer
}

// ─── Parse Excel ──────────────────────────────────────────────────────────────

export async function parseExcel(
  buffer: Buffer,
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const workbook = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any)

  const sheet = workbook.worksheets[0]
  if (!sheet) throw { statusCode: 400, message: 'El archivo Excel no contiene ninguna hoja', code: 'INVALID_FILE' }

  const headerRow = sheet.getRow(1)
  const headers: string[] = []

  headerRow.eachCell((cell) => {
    const val = String(cell.value ?? '').trim().toLowerCase().replace(/\s+/g, '_')
    headers.push(val)
  })

  if (headers.length === 0 || headers.every((h) => h === '')) {
    throw { statusCode: 400, message: 'El archivo Excel no tiene cabeceras en la primera fila', code: 'INVALID_FILE' }
  }

  const rows: Record<string, unknown>[] = []

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const obj: Record<string, unknown> = {}
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber - 1]
      if (header) {
        const raw = cell.value as unknown
        let val: unknown = raw
        if (raw !== null && typeof raw === 'object') {
          const o = raw as Record<string, unknown>
          if ('result' in o) {
            val = o['result']                    // celda con fórmula
          } else if ('text' in o) {
            val = o['text']                      // celda hyperlink (emails, URLs)
          }
        }
        // Normalizar strings vacíos / solo espacios a null
        if (typeof val === 'string' && val.trim() === '') val = null
        obj[header] = val ?? null
      }
    })
    const hasData = Object.values(obj).some((v) => v !== null && v !== '' && v !== undefined)
    if (hasData) rows.push(obj)
  })

  return { headers, rows }
}

// ─── Resolución nombre→ID de sucursal ────────────────────────────────────────

async function resolveSucursalIds(
  tenantId: string,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const hasSucursal = rows.some((r) => r['sucursal_id'] != null && r['sucursal_id'] !== '')
  if (!hasSucursal) return rows

  const branches = await prisma.branch.findMany({
    where:  { tenantId },
    select: { id: true, name: true },
  })

  const idSet     = new Set(branches.map((b) => b.id))
  const nameToId  = new Map(branches.map((b) => [b.name.toLowerCase().trim(), b.id]))

  return rows.map((row) => {
    const raw = row['sucursal_id']
    if (raw == null || typeof raw !== 'string' || raw === '') return row
    if (idSet.has(raw)) return row                                // ya es ID
    const resolved = nameToId.get(raw.toLowerCase().trim())
    return resolved ? { ...row, sucursal_id: resolved } : row    // nombre→ID; si no existe, deja pasar para que valide
  })
}

// ─── Validación por tipo ──────────────────────────────────────────────────────

export async function validateRows(
  tenantId: string,
  type: BulkUploadType,
  rows: Record<string, unknown>[],
): Promise<RowError[]> {
  const resolved = await resolveSucursalIds(tenantId, rows)
  if (type === 'users')        return validateUsers(tenantId, resolved)
  if (type === 'products')     return validateProducts(tenantId, resolved)
  if (type === 'stock')        return validateStock(tenantId, resolved)
  if (type === 'suppliers')    return validateSuppliers(tenantId, resolved)
  if (type === 'clients')      return validateClients(tenantId, resolved)
  if (type === 'appointments') return validateAppointments(tenantId, resolved)
  if (type === 'transactions') return validateTransactions(tenantId, rows)
  return []
}

// ─── Users ────────────────────────────────────────────────────────────────────

async function validateUsers(tenantId: string, rows: Record<string, unknown>[]): Promise<RowError[]> {
  const errors: RowError[] = []
  const emailsInFile = new Set<string>()

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2
    const parsed = UserRowSchema.safeParse(normalizeRow(rows[i]!))

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row: rowNum, column: String(issue.path[0] ?? 'desconocido'), message: issue.message })
      }
      continue
    }

    const data = parsed.data

    if ((data.rol === 'OPERATIVE' || data.rol === 'AREA_MANAGER') && !data.modulo) {
      errors.push({ row: rowNum, column: 'modulo', message: `El módulo es requerido para el rol ${data.rol}` })
    }

    const emailLower = data.email.toLowerCase()
    if (emailsInFile.has(emailLower)) {
      errors.push({ row: rowNum, column: 'email', message: 'El email está duplicado en el archivo' })
    } else {
      emailsInFile.add(emailLower)
      const existingUser = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })
      if (existingUser) {
        errors.push({ row: rowNum, column: 'email', message: 'El email ya está registrado en el sistema' })
      }
    }

    if (data.sucursal_id) {
      const branch = await prisma.branch.findFirst({ where: { id: data.sucursal_id, tenantId }, select: { id: true } })
      if (!branch) {
        errors.push({ row: rowNum, column: 'sucursal_id', message: `La sucursal "${data.sucursal_id}" no existe` })
      }
    }
  }

  return errors
}

// ─── Products ─────────────────────────────────────────────────────────────────

async function validateProducts(tenantId: string, rows: Record<string, unknown>[]): Promise<RowError[]> {
  const errors: RowError[] = []
  const skusInFile = new Set<string>()

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2
    const parsed = ProductRowSchema.safeParse(normalizeRow(rows[i]!))

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row: rowNum, column: String(issue.path[0] ?? 'desconocido'), message: issue.message })
      }
      continue
    }

    const data = parsed.data

    if (data.stock_maximo !== undefined && data.stock_maximo <= data.stock_minimo) {
      errors.push({ row: rowNum, column: 'stock_maximo', message: 'El stock máximo debe ser mayor al stock mínimo' })
    }

    const skuKey = data.sku.toLowerCase()
    if (skusInFile.has(skuKey)) {
      errors.push({ row: rowNum, column: 'sku', message: 'El SKU está duplicado en el archivo' })
    } else {
      skusInFile.add(skuKey)
      const existing = await prisma.product.findFirst({ where: { tenantId, sku: data.sku }, select: { id: true } })
      if (existing) {
        errors.push({ row: rowNum, column: 'sku', message: `El SKU "${data.sku}" ya existe en el catálogo` })
      }
    }
  }

  return errors
}

// ─── Stock ────────────────────────────────────────────────────────────────────

async function validateStock(tenantId: string, rows: Record<string, unknown>[]): Promise<RowError[]> {
  const errors: RowError[] = []

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2
    const parsed = StockRowSchema.safeParse(normalizeRow(rows[i]!))

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row: rowNum, column: String(issue.path[0] ?? 'desconocido'), message: issue.message })
      }
      continue
    }

    const data = parsed.data

    const product = await prisma.product.findFirst({ where: { tenantId, sku: data.sku }, select: { id: true } })
    if (!product) {
      errors.push({ row: rowNum, column: 'sku', message: `El SKU "${data.sku}" no existe en el catálogo del tenant` })
    }

    const branch = await prisma.branch.findFirst({ where: { id: data.sucursal_id, tenantId }, select: { id: true } })
    if (!branch) {
      errors.push({ row: rowNum, column: 'sucursal_id', message: `La sucursal "${data.sucursal_id}" no existe` })
    }
  }

  return errors
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

async function validateSuppliers(tenantId: string, rows: Record<string, unknown>[]): Promise<RowError[]> {
  const errors: RowError[] = []
  const nitsInFile = new Set<string>()

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2
    const parsed = SupplierRowSchema.safeParse(normalizeRow(rows[i]!))

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row: rowNum, column: String(issue.path[0] ?? 'desconocido'), message: issue.message })
      }
      continue
    }

    const data = parsed.data

    if (nitsInFile.has(data.nit)) {
      errors.push({ row: rowNum, column: 'nit', message: 'El NIT está duplicado en el archivo' })
    } else {
      nitsInFile.add(data.nit)
      const existing = await prisma.supplier.findFirst({ where: { tenantId, taxId: data.nit }, select: { id: true } })
      if (existing) {
        errors.push({ row: rowNum, column: 'nit', message: `El NIT "${data.nit}" ya existe en proveedores` })
      }
    }
  }

  return errors
}

// ─── Clients ──────────────────────────────────────────────────────────────────

async function validateClients(tenantId: string, rows: Record<string, unknown>[]): Promise<RowError[]> {
  const errors: RowError[] = []
  const whatsappsInFile = new Set<string>()

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2
    const parsed = ClientRowSchema.safeParse(normalizeRow(rows[i]!))

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row: rowNum, column: String(issue.path[0] ?? 'desconocido'), message: issue.message })
      }
      continue
    }

    const data = parsed.data

    if (data.whatsapp) {
      if (whatsappsInFile.has(data.whatsapp)) {
        errors.push({ row: rowNum, column: 'whatsapp', message: 'El número de WhatsApp está duplicado en el archivo' })
      } else {
        whatsappsInFile.add(data.whatsapp)
        const existingClient = await prisma.client.findFirst({ where: { tenantId, whatsappId: data.whatsapp }, select: { id: true } })
        if (existingClient) {
          errors.push({ row: rowNum, column: 'whatsapp', message: `El WhatsApp "${data.whatsapp}" ya está registrado` })
        }
      }
    }
  }

  return errors
}

// ─── Appointments ─────────────────────────────────────────────────────────────

async function validateAppointments(tenantId: string, rows: Record<string, unknown>[]): Promise<RowError[]> {
  const errors: RowError[] = []

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2
    const parsed = AppointmentRowSchema.safeParse(normalizeRow(rows[i]!))

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row: rowNum, column: String(issue.path[0] ?? 'desconocido'), message: issue.message })
      }
      continue
    }

    const data = parsed.data

    const service = await prisma.serviceType.findFirst({
      where: { id: data.servicio_id, tenantId, isActive: true },
      select: { id: true, durationMinutes: true },
    })
    if (!service) {
      errors.push({ row: rowNum, column: 'servicio_id', message: `El servicio "${data.servicio_id}" no existe o está inactivo` })
      continue
    }

    const branch = await prisma.branch.findFirst({ where: { id: data.sucursal_id, tenantId }, select: { id: true } })
    if (!branch) {
      errors.push({ row: rowNum, column: 'sucursal_id', message: `La sucursal "${data.sucursal_id}" no existe` })
      continue
    }

    const startAt = new Date(data.fecha_hora)
    if (isNaN(startAt.getTime())) {
      errors.push({ row: rowNum, column: 'fecha_hora', message: `Fecha inválida. Use formato ISO 8601: 2026-06-01T10:00:00` })
      continue
    }
    if (startAt <= new Date()) {
      errors.push({ row: rowNum, column: 'fecha_hora', message: 'La fecha de la cita debe ser futura' })
    }

    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60 * 1000)
    const conflict = await prisma.appointment.findFirst({
      where: {
        tenantId,
        branchId: data.sucursal_id,
        serviceTypeId: data.servicio_id,
        status: { not: 'cancelled' },
        OR: [
          { startAt: { gte: startAt, lt: endAt } },
          { endAt:   { gt: startAt, lte: endAt } },
        ],
      },
      select: { id: true },
    })
    if (conflict) {
      errors.push({ row: rowNum, column: 'fecha_hora', message: `El slot ${data.fecha_hora} ya está ocupado` })
    }
  }

  return errors
}

// ─── Transactions ─────────────────────────────────────────────────────────────

async function validateTransactions(tenantId: string, rows: Record<string, unknown>[]): Promise<RowError[]> {
  const errors: RowError[] = []

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2
    const parsed = TransactionRowSchema.safeParse(normalizeRow(rows[i]!))

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row: rowNum, column: String(issue.path[0] ?? 'desconocido'), message: issue.message })
      }
      continue
    }

    const data = parsed.data

    if (isNaN(new Date(data.fecha).getTime())) {
      errors.push({ row: rowNum, column: 'fecha', message: `Fecha inválida. Use formato YYYY-MM-DD` })
    }

    if (data.categoria_id) {
      const category = await prisma.transactionCategory.findFirst({
        where: { id: data.categoria_id, tenantId, isActive: true },
        select: { id: true },
      })
      if (!category) {
        errors.push({ row: rowNum, column: 'categoria_id', message: `La categoría "${data.categoria_id}" no existe` })
      }
    }

    if (data.sucursal_id) {
      const branch = await prisma.branch.findFirst({ where: { id: data.sucursal_id, tenantId }, select: { id: true } })
      if (!branch) {
        errors.push({ row: rowNum, column: 'sucursal_id', message: `La sucursal "${data.sucursal_id}" no existe` })
      }
    }
  }

  return errors
}

// ─── Registro de log de validación (preview o failed) ─────────────────────────

export async function logValidationResult(
  tenantId: string,
  userId: string,
  type: BulkUploadType,
  meta: UploadMeta,
  errors: RowError[],
): Promise<string> {
  const status = errors.length > 0 ? 'failed' : 'preview'

  const log = await prisma.bulkUploadLog.create({
    data: {
      tenantId,
      userId,
      type,
      fileName:    meta.fileName,
      fileSize:    meta.fileSize,
      rowCount:    meta.rowCount,
      recordCount: 0,
      status,
      errors:      errors.length > 0 ? (errors as unknown as object) : undefined,
      fileData:    new Uint8Array(meta.fileBuffer),
      finishedAt:  new Date(),
    },
    select: { id: true },
  })

  if (errors.length > 0) {
    await notifyFailure(tenantId, userId, log.id, type, meta.fileName, errors.length)
  }

  return log.id
}

// ─── Registro de intento fallido desde /process ───────────────────────────────

export async function logFailedUpload(
  tenantId: string,
  userId: string,
  type: string,
  meta: UploadMeta,
  errors: RowError[],
): Promise<string> {
  const log = await prisma.bulkUploadLog.create({
    data: {
      tenantId,
      userId,
      type,
      fileName:    meta.fileName,
      fileSize:    meta.fileSize,
      rowCount:    meta.rowCount,
      recordCount: 0,
      status:      'failed',
      errors:      errors.length > 0 ? (errors as unknown as object) : undefined,
      fileData:    new Uint8Array(meta.fileBuffer),
      finishedAt:  new Date(),
    },
    select: { id: true },
  })

  await notifyFailure(tenantId, userId, log.id, type, meta.fileName, errors.length)

  return log.id
}

// ─── Procesamiento atómico ────────────────────────────────────────────────────

export async function processRows(
  tenantId: string,
  userId: string,
  type: BulkUploadType,
  rows: Record<string, unknown>[],
  meta: UploadMeta,
): Promise<{ processed: number; logId: string }> {
  const startedAt = new Date()
  const resolved  = await resolveSucursalIds(tenantId, rows)

  const processed = await prisma.$transaction(async (tx) => {
    if (type === 'users')        return _processUsers(tx, tenantId, resolved)
    if (type === 'products')     return _processProducts(tx, tenantId, resolved)
    if (type === 'stock')        return _processStock(tx, tenantId, userId, resolved)
    if (type === 'suppliers')    return _processSuppliers(tx, tenantId, resolved)
    if (type === 'clients')      return _processClients(tx, tenantId, resolved)
    if (type === 'appointments') return _processAppointments(tx, tenantId, resolved)
    if (type === 'transactions') return _processTransactions(tx, tenantId, resolved)
    return 0
  })

  const log = await prisma.bulkUploadLog.create({
    data: {
      tenantId,
      userId,
      type,
      fileName:    meta.fileName,
      fileSize:    meta.fileSize,
      rowCount:    meta.rowCount,
      recordCount: processed,
      status:      'success',
      fileData:    new Uint8Array(meta.fileBuffer),
      finishedAt:  new Date(),
    },
    select: { id: true },
  })

  void notifySuccess(tenantId, log.id, type, meta.fileName, processed, startedAt)

  return { processed, logId: log.id }
}

// ─── Procesadores internos (dentro de transacción) ────────────────────────────

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

async function _processUsers(tx: TxClient, tenantId: string, rows: Record<string, unknown>[]): Promise<number> {
  const parsed = rows.map((r) => UserRowSchema.parse(normalizeRow(r)))

  await Promise.all(
    parsed.map(async (data) => {
      const password = data.contraseña ?? generatePassword()
      const hash = await bcrypt.hash(password, 12)
      return tx.user.create({
        data: {
          tenantId,
          branchId:     data.sucursal_id || null,
          email:        data.email,
          name:         data.nombre,
          passwordHash: hash,
          role:         data.rol,
          module:       data.modulo ?? null,
        },
        select: { id: true },
      })
    }),
  )

  return parsed.length
}

async function _processProducts(tx: TxClient, tenantId: string, rows: Record<string, unknown>[]): Promise<number> {
  const parsed = rows.map((r) => ProductRowSchema.parse(normalizeRow(r)))

  await tx.product.createMany({
    data: parsed.map((data) => ({
      tenantId,
      sku:         data.sku,
      name:        data.nombre,
      description: data.descripcion ?? null,
      category:    data.categoria ?? null,
      unit:        data.unidad,
      salePrice:   data.precio_venta ?? null,
      costPrice:   data.precio_costo ?? null,
      minStock:    data.stock_minimo,
      maxStock:    data.stock_maximo ?? null,
    })),
  })

  return parsed.length
}

async function _processStock(tx: TxClient, tenantId: string, userId: string, rows: Record<string, unknown>[]): Promise<number> {
  const parsed = rows.map((r) => StockRowSchema.parse(normalizeRow(r)))
  let count = 0

  for (const data of parsed) {
    const product = await tx.product.findFirst({ where: { tenantId, sku: data.sku }, select: { id: true } })
    if (!product) continue

    await tx.stock.upsert({
      where:  { productId_branchId: { productId: product.id, branchId: data.sucursal_id } },
      create: { productId: product.id, branchId: data.sucursal_id, quantity: data.cantidad },
      update: { quantity: data.cantidad },
    })

    await tx.stockMovement.create({
      data: {
        tenantId,
        productId:      product.id,
        branchId:       data.sucursal_id,
        userId,
        type:           'adjustment',
        quantity:       data.cantidad,
        quantityBefore: 0,
        quantityAfter:  data.cantidad,
        referenceType:  'bulk_upload',
      },
    })

    count++
  }

  return count
}

async function _processSuppliers(tx: TxClient, tenantId: string, rows: Record<string, unknown>[]): Promise<number> {
  const parsed = rows.map((r) => SupplierRowSchema.parse(normalizeRow(r)))

  await tx.supplier.createMany({
    data: parsed.map((data) => ({
      tenantId,
      name:         data.nombre,
      contactName:  data.contacto || null,
      email:        data.email || null,
      phone:        data.telefono || null,
      taxId:        data.nit,
      paymentTerms: data.dias_credito,
      city:         data.ciudad || null,
      notes:        data.notas || null,
    })),
  })

  return parsed.length
}

async function _processClients(tx: TxClient, tenantId: string, rows: Record<string, unknown>[]): Promise<number> {
  const parsed = rows.map((r) => ClientRowSchema.parse(normalizeRow(r)))

  await tx.client.createMany({
    data: parsed.map((data) => ({
      tenantId,
      name:       data.nombre,
      email:      data.email || null,
      phone:      data.telefono || null,
      whatsappId: data.whatsapp || null,
      company:    data.empresa || null,
      taxId:      data.nit || null,
      city:       data.ciudad || null,
      source:     data.origen || null,
    })),
  })

  return parsed.length
}

async function _processAppointments(tx: TxClient, tenantId: string, rows: Record<string, unknown>[]): Promise<number> {
  const parsed = rows.map((r) => AppointmentRowSchema.parse(normalizeRow(r)))
  let count = 0

  for (const data of parsed) {
    const service = await tx.serviceType.findFirst({
      where: { id: data.servicio_id, tenantId },
      select: { id: true, durationMinutes: true },
    })
    if (!service) continue

    const startAt = new Date(data.fecha_hora)
    const endAt = new Date(startAt.getTime() + service.durationMinutes * 60 * 1000)

    await tx.appointment.create({
      data: {
        tenantId,
        branchId:      data.sucursal_id,
        serviceTypeId: data.servicio_id,
        clientName:    data.nombre_cliente,
        clientPhone:   data.telefono_cliente || null,
        startAt,
        endAt,
        status:  'scheduled',
        channel: 'bulk_upload',
        notes:   data.notas || null,
      },
    })

    count++
  }

  return count
}

async function _processTransactions(tx: TxClient, tenantId: string, rows: Record<string, unknown>[]): Promise<number> {
  const parsed = rows.map((r) => TransactionRowSchema.parse(normalizeRow(r)))

  await tx.transaction.createMany({
    data: parsed.map((data) => ({
      tenantId,
      branchId:    data.sucursal_id || null,
      categoryId:  data.categoria_id || null,
      isManual:    true,
      type:        data.tipo === 'ingreso' ? 'income' : 'expense',
      amount:      data.monto,
      currency:    'COP',
      description: data.descripcion,
      date:        new Date(data.fecha),
    })),
  })

  return parsed.length
}

// ─── Notificaciones ───────────────────────────────────────────────────────────

async function notifyFailure(
  tenantId: string,
  _userId: string,
  logId: string,
  type: string,
  fileName: string,
  errorCount: number,
): Promise<void> {
  try {
    const [admins, superAdmins] = await Promise.all([
      prisma.user.findMany({
        where: { tenantId, role: 'TENANT_ADMIN', isActive: true },
        select: { id: true },
      }),
      prisma.user.findMany({
        where: { role: 'SUPER_ADMIN', isActive: true },
        select: { id: true, tenantId: true },
      }),
    ])

    const notificationData = [
      ...admins.map((u) => ({
        tenantId,
        userId:  u.id,
        type:    'bulk_upload_failed',
        title:   'Carga masiva con errores',
        message: `El archivo "${fileName}" (${type}) tuvo ${errorCount} error(es). Revisa el detalle para corregirlos.`,
        link:    `/bulk-upload/logs/${logId}`,
      })),
      ...superAdmins.map((sa) => ({
        tenantId: sa.tenantId,
        userId:   sa.id,
        type:     'bulk_upload_failed',
        title:    `Carga masiva fallida — tenant ${tenantId}`,
        message:  `El archivo "${fileName}" (${type}) tuvo ${errorCount} error(es).`,
        link:     `/admin/bulk-upload/logs/${logId}`,
      })),
    ]

    if (notificationData.length > 0) {
      await prisma.notification.createMany({ data: notificationData })
    }
  } catch {
    // Las notificaciones no deben bloquear el flujo principal
  }
}

async function notifySuccess(
  tenantId: string,
  logId: string,
  type: string,
  fileName: string,
  count: number,
  startedAt: Date,
): Promise<void> {
  try {
    const superAdmins = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', isActive: true },
      select: { id: true, tenantId: true },
    })

    const durationSec = Math.round((Date.now() - startedAt.getTime()) / 1000)

    if (superAdmins.length > 0) {
      await prisma.notification.createMany({
        data: superAdmins.map((sa) => ({
          tenantId: sa.tenantId,
          userId:   sa.id,
          type:     'bulk_upload_success',
          title:    `Carga masiva completada — tenant ${tenantId}`,
          message:  `"${fileName}" (${type}): ${count} registros en ${durationSec}s. Log: ${logId}`,
          link:     `/admin/bulk-upload/logs/${logId}`,
        })),
      })
    }
  } catch {
    // silencioso
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  let pwd = ''
  for (let i = 0; i < 12; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)]
  }
  return pwd
}

function normalizeRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(raw)) {
    if (val === null || val === undefined || val === '') {
      out[key] = undefined
    } else if (typeof val === 'number') {
      out[key] = val
    } else {
      out[key] = String(val).trim()
    }
  }
  return out
}

export { REQUIRED_COLUMNS }
