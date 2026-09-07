import ExcelJS from 'exceljs'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { assertBulkUploadWithinDemoLimits } from '../../lib/demo-limits'
import {
  REQUIRED_COLUMNS,
  HEADER_ALIASES,
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

// ─── HU-206 — Detección de duplicados ──────────────────────────────────────────

/** Normaliza un identificador para comparar: ignora guiones, espacios y mayúsculas ("1234-5" = "12345"). */
export function normId(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/[\s-]/g, '')
}

/** Identificador de duplicado por sección (los 4 cargues en alcance de HU-206). */
const DUP_CONFIG: Partial<Record<BulkUploadType, { column: string; label: string }>> = {
  products:  { column: 'sku',   label: 'SKU' },
  users:     { column: 'email', label: 'correo' },
  suppliers: { column: 'nit',   label: 'NIT' },
  clients:   { column: 'nit',   label: 'documento/NIT' },
}
export function dupIdentifierLabel(type: BulkUploadType): string | null { return DUP_CONFIG[type]?.label ?? null }

/** Una coincidencia: una fila del archivo cuyo identificador ya existe en el sistema (mismo tenant). */
export interface DuplicateMatch {
  row:          number   // fila del archivo (encabezado = 1; datos desde 2)
  identifier:   string   // valor tal como viene en el archivo
  normalized:   string   // clave normalizada (la que decide la acción)
  fileName:     string   // nombre en el archivo
  existingName: string   // nombre del registro que ya existe (para que el usuario sepa qué actualizaría)
}

type DbLike = typeof prisma | TxClient

async function fetchExistingIdentifiers(db: DbLike, tenantId: string, type: BulkUploadType): Promise<Array<{ id: string; ident: string | null; name: string }>> {
  switch (type) {
    case 'products':  return (await db.product.findMany({ where: { tenantId },  select: { id: true, sku: true,   name: true } })).map((p) => ({ id: p.id, ident: p.sku,   name: p.name }))
    case 'users':     return (await db.user.findMany({ where: { tenantId },     select: { id: true, email: true, name: true } })).map((u) => ({ id: u.id, ident: u.email, name: u.name }))
    case 'suppliers': return (await db.supplier.findMany({ where: { tenantId }, select: { id: true, taxId: true, name: true } })).map((s) => ({ id: s.id, ident: s.taxId, name: s.name }))
    case 'clients':   return (await db.client.findMany({ where: { tenantId },   select: { id: true, taxId: true, name: true } })).map((c) => ({ id: c.id, ident: c.taxId, name: c.name }))
    default:          return []
  }
}

/** Mapa normalizado(identificador) → id del registro existente (mismo tenant). */
async function existingIdentifierMap(db: DbLike, tenantId: string, type: BulkUploadType): Promise<Map<string, string>> {
  const rows = await fetchExistingIdentifiers(db, tenantId, type)
  const map = new Map<string, string>()
  for (const e of rows) { const n = normId(e.ident); if (n) map.set(n, e.id) }
  return map
}

/**
 * HU-206 — Detecta, ANTES de cargar, las filas del archivo cuyo identificador ya existe en el sistema
 * (comparación NORMALIZADA, dentro del mismo tenant). No modifica nada: solo reporta las coincidencias
 * para que el usuario elija omitir o actualizar. El duplicado INTERNO del archivo lo maneja validateRows.
 */
export async function detectDuplicates(tenantId: string, type: BulkUploadType, rows: Record<string, unknown>[]): Promise<DuplicateMatch[]> {
  const cfg = DUP_CONFIG[type]
  if (!cfg) return []
  const existing = await fetchExistingIdentifiers(prisma, tenantId, type)
  const byNorm = new Map<string, string>()  // normalized → existingName
  for (const e of existing) { const n = normId(e.ident); if (n) byNorm.set(n, e.name) }

  const matches: DuplicateMatch[] = []
  const seen = new Set<string>()
  for (let i = 0; i < rows.length; i++) {
    const nr    = normalizeRow(rows[i]!)
    const value = nr[cfg.column] == null ? '' : String(nr[cfg.column])
    if (!value) continue
    const n = normId(value)
    if (!n || seen.has(n)) continue
    const existingName = byNorm.get(n)
    if (existingName !== undefined) {
      seen.add(n)
      matches.push({ row: i + 2, identifier: value, normalized: n, fileName: String(nr['nombre'] ?? nr['nombre_cliente'] ?? ''), existingName })
    }
  }
  return matches
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
    const norm = String(cell.value ?? '').trim().toLowerCase().replace(/\s+/g, '_')
    headers.push(HEADER_ALIASES[norm] ?? norm) // sinónimos → clave canónica (p. ej. "nit o documento" → "nit")
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

  // HU-197 — solo sedes ACTIVAS: la carga masiva crea registros nuevos; una sede desactivada
  // conserva su histórico pero no admite operaciones nuevas.
  const branches = await prisma.branch.findMany({
    where:  { tenantId, isActive: true },
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
  await assertBulkUploadWithinDemoLimits(tenantId, type, rows.length) // Cierre S16 — respeta topes de demo
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

    const emailLower = normId(data.email)
    if (emailsInFile.has(emailLower)) {
      errors.push({ row: rowNum, column: 'email', message: 'El email está duplicado en el archivo' })
    } else {
      emailsInFile.add(emailLower)
      // HU-206 — el correo YA existente en ESTE tenant no es un error: es una coincidencia (omitir/
      // actualizar, ver detectDuplicates). Pero un correo usado en OTRA empresa sí bloquea (el correo
      // es único global; no se puede crear ni "actualizar" un usuario de otro tenant).
      const existingUser = await prisma.user.findUnique({ where: { email: data.email }, select: { tenantId: true } })
      if (existingUser && existingUser.tenantId !== tenantId) {
        errors.push({ row: rowNum, column: 'email', message: 'El email ya está registrado en otra empresa' })
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

    // HU-206 — el SKU ya existente NO es error: es coincidencia (omitir/actualizar). Solo se marca el
    // duplicado INTERNO del archivo (dos filas con el mismo SKU).
    const skuKey = normId(data.sku)
    if (skusInFile.has(skuKey)) {
      errors.push({ row: rowNum, column: 'sku', message: 'El SKU está duplicado en el archivo' })
    } else {
      skusInFile.add(skuKey)
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

    // HU-206 — el NIT ya existente NO es error: es coincidencia (omitir/actualizar). Solo el duplicado
    // INTERNO del archivo se marca como error.
    const nitKey = normId(data.nit)
    if (nitsInFile.has(nitKey)) {
      errors.push({ row: rowNum, column: 'nit', message: 'El NIT está duplicado en el archivo' })
    } else {
      nitsInFile.add(nitKey)
    }
  }

  return errors
}

// ─── Clients ──────────────────────────────────────────────────────────────────

async function validateClients(_tenantId: string, rows: Record<string, unknown>[]): Promise<RowError[]> {
  const errors: RowError[] = []
  const nitsInFile = new Set<string>()

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

    // HU-206 — identificador de cliente = documento/NIT. Un NIT ya existente NO es error: es coincidencia
    // (omitir/actualizar, ver detectDuplicates). Solo se marca el duplicado INTERNO del archivo.
    if (data.nit) {
      const nitKey = normId(data.nit)
      if (nitsInFile.has(nitKey)) {
        errors.push({ row: rowNum, column: 'nit', message: 'El documento/NIT está duplicado en el archivo' })
      } else {
        nitsInFile.add(nitKey)
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

    if (data.centro_costo_id) {
      const cc = await prisma.costCenter.findFirst({
        where: { id: data.centro_costo_id, tenantId, isActive: true },
        select: { id: true },
      })
      if (!cc) {
        errors.push({ row: rowNum, column: 'centro_costo_id', message: `El centro de costo "${data.centro_costo_id}" no existe` })
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

// HU-206 — acción por coincidencia (clave = identificador normalizado): omitir o actualizar.
export type DuplicateActions = Record<string, 'skip' | 'update'>
/** Resumen del cargue: nuevos / actualizados / omitidos. */
export interface ProcessSummary { created: number; updated: number; skipped: number }
const emptySummary = (): ProcessSummary => ({ created: 0, updated: 0, skipped: 0 })

export async function processRows(
  tenantId: string,
  userId: string,
  type: BulkUploadType,
  rows: Record<string, unknown>[],
  meta: UploadMeta,
  actions: DuplicateActions = {},
): Promise<{ summary: ProcessSummary; processed: number; logId: string }> {
  await assertBulkUploadWithinDemoLimits(tenantId, type, rows.length) // Cierre S16 — respeta topes de demo
  const startedAt = new Date()
  const resolved  = await resolveSucursalIds(tenantId, rows)

  const summary = await prisma.$transaction(async (tx) => {
    if (type === 'users')        return _processUsers(tx, tenantId, resolved, actions)
    if (type === 'products')     return _processProducts(tx, tenantId, resolved, actions)
    if (type === 'suppliers')    return _processSuppliers(tx, tenantId, resolved, actions)
    if (type === 'clients')      return _processClients(tx, tenantId, resolved, actions)
    // Tipos sin detección de duplicados (HU-206): stock, citas, transacciones → todo es "nuevo".
    if (type === 'stock')        return { ...emptySummary(), created: await _processStock(tx, tenantId, userId, resolved) }
    if (type === 'appointments') return { ...emptySummary(), created: await _processAppointments(tx, tenantId, resolved) }
    if (type === 'transactions') return { ...emptySummary(), created: await _processTransactions(tx, tenantId, resolved) }
    return emptySummary()
  })

  // recordCount = registros que efectivamente entraron/cambiaron (nuevos + actualizados).
  const processed = summary.created + summary.updated

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

  return { summary, processed, logId: log.id }
}

// ─── Procesadores internos (dentro de transacción) ────────────────────────────

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

async function _processUsers(tx: TxClient, tenantId: string, rows: Record<string, unknown>[], actions: DuplicateActions): Promise<ProcessSummary> {
  const parsed = rows.map((r) => UserRowSchema.parse(normalizeRow(r)))
  const map = await existingIdentifierMap(tx, tenantId, 'users')
  let created = 0, updated = 0, skipped = 0

  for (const data of parsed) {
    const n = normId(data.email)
    const existingId = map.get(n)
    if (existingId) {
      // HU-206 — coincidencia: se OMITE (default, nunca duplica) o se ACTUALIZA el existente.
      if ((actions[n] ?? 'skip') === 'update') {
        await tx.user.update({
          where: { id: existingId },
          data: {
            name:     data.nombre,
            role:     data.rol,
            module:   data.modulo ?? null,
            branchId: data.sucursal_id || null,
            ...(data.contraseña ? { passwordHash: await bcrypt.hash(data.contraseña, 12) } : {}),
          },
        })
        updated++
      } else skipped++
    } else {
      const hash = await bcrypt.hash(data.contraseña ?? generatePassword(), 12)
      await tx.user.create({
        data: { tenantId, branchId: data.sucursal_id || null, email: data.email, name: data.nombre, passwordHash: hash, role: data.rol, module: data.modulo ?? null },
        select: { id: true },
      })
      created++
    }
  }

  return { created, updated, skipped }
}

async function _processProducts(tx: TxClient, tenantId: string, rows: Record<string, unknown>[], actions: DuplicateActions): Promise<ProcessSummary> {
  const parsed = rows.map((r) => ProductRowSchema.parse(normalizeRow(r)))
  const map = await existingIdentifierMap(tx, tenantId, 'products')
  let created = 0, updated = 0, skipped = 0

  for (const data of parsed) {
    const payload = {
      name:        data.nombre,
      description: data.descripcion ?? null,
      category:    data.categoria ?? null,
      unit:        data.unidad,
      salePrice:   data.precio_venta ?? null,
      costPrice:   data.precio_costo ?? null,
      minStock:    data.stock_minimo,
      maxStock:    data.stock_maximo ?? null,
      rentalPrice: data.precio_alquiler ?? null,
      isSellable:  data.es_vendible,
      isRentable:  data.es_alquilable,
    }
    const n = normId(data.sku)
    const existingId = map.get(n)
    if (existingId) {
      if ((actions[n] ?? 'skip') === 'update') { await tx.product.update({ where: { id: existingId }, data: payload }); updated++ }
      else skipped++
    } else {
      await tx.product.create({ data: { tenantId, sku: data.sku, ...payload }, select: { id: true } })
      created++
    }
  }

  return { created, updated, skipped }
}

async function _processStock(tx: TxClient, tenantId: string, userId: string, rows: Record<string, unknown>[]): Promise<number> {
  const parsed = rows.map((r) => StockRowSchema.parse(normalizeRow(r)))
  let count = 0

  for (const data of parsed) {
    const product = await tx.product.findFirst({ where: { tenantId, sku: data.sku }, select: { id: true } })
    if (!product) continue

    // HU-128 — leer el stock actual para quantityBefore (antes se asumía 0, era un bug).
    const existing = await tx.stock.findUnique({
      where:  { productId_branchId: { productId: product.id, branchId: data.sucursal_id } },
      select: { quantity: true },
    })
    const before = existing ? parseFloat(String(existing.quantity)) : 0
    const after  = data.cantidad

    await tx.stock.upsert({
      where:  { productId_branchId: { productId: product.id, branchId: data.sucursal_id } },
      create: { productId: product.id, branchId: data.sucursal_id, quantity: after },
      update: { quantity: after },
    })

    await tx.stockMovement.create({
      data: {
        tenantId,
        productId:      product.id,
        branchId:       data.sucursal_id,
        userId,
        type:           'ajuste',          // HU-128 — normalizado (antes 'adjustment')
        reason:         'ajuste',          // HU-128 — carga masiva = ajuste de inventario
        quantity:       Math.abs(after - before),
        quantityBefore: before,
        quantityAfter:  after,
        referenceType:  'bulk_upload',
      },
    })

    count++
  }

  return count
}

async function _processSuppliers(tx: TxClient, tenantId: string, rows: Record<string, unknown>[], actions: DuplicateActions): Promise<ProcessSummary> {
  const parsed = rows.map((r) => SupplierRowSchema.parse(normalizeRow(r)))
  const map = await existingIdentifierMap(tx, tenantId, 'suppliers')
  let created = 0, updated = 0, skipped = 0

  for (const data of parsed) {
    const payload = {
      name:         data.nombre,
      contactName:  data.contacto || null,
      email:        data.email || null,
      phone:        data.telefono || null,
      documentType: data.tipo_documento ?? null,
      paymentTerms: data.dias_credito ?? null,
      address:      data.direccion || null,
      city:         data.ciudad || null,
      notes:        data.notas || null,
    }
    const n = normId(data.nit)
    const existingId = map.get(n)
    if (existingId) {
      if ((actions[n] ?? 'skip') === 'update') { await tx.supplier.update({ where: { id: existingId }, data: payload }); updated++ }
      else skipped++
    } else {
      await tx.supplier.create({ data: { tenantId, taxId: data.nit, ...payload }, select: { id: true } })
      created++
    }
  }

  return { created, updated, skipped }
}

async function _processClients(tx: TxClient, tenantId: string, rows: Record<string, unknown>[], actions: DuplicateActions): Promise<ProcessSummary> {
  const parsed = rows.map((r) => ClientRowSchema.parse(normalizeRow(r)))
  const map = await existingIdentifierMap(tx, tenantId, 'clients')
  let created = 0, updated = 0, skipped = 0

  for (const data of parsed) {
    const payload = {
      name:       data.nombre,
      email:      data.email || null,
      phone:      data.telefono || null,
      whatsappId: data.whatsapp || null,
      company:    data.empresa || null,
      address:    data.direccion || null,
      city:       data.ciudad || null,
      source:     data.origen || null,
      notes:      data.notas || null,
    }
    // HU-206 — identificador = documento/NIT. Sin NIT no hay con qué deduplicar → siempre es nuevo.
    const n = data.nit ? normId(data.nit) : ''
    const existingId = n ? map.get(n) : undefined
    if (existingId) {
      if ((actions[n] ?? 'skip') === 'update') { await tx.client.update({ where: { id: existingId }, data: payload }); updated++ }
      else skipped++
    } else {
      await tx.client.create({ data: { tenantId, taxId: data.nit || null, ...payload }, select: { id: true } })
      created++
    }
  }

  return { created, updated, skipped }
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
        clientEmail:   data.email_cliente || null,
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
      branchId:     data.sucursal_id || null,
      categoryId:   data.categoria_id || null,
      costCenterId: data.centro_costo_id || null,
      isManual:     true,
      type:         data.tipo === 'ingreso' ? 'income' : 'expense',
      amount:       data.monto,
      currency:     'COP',
      description:  data.descripcion,
      externalReference: data.referencia || null,
      date:         new Date(data.fecha),
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
    // Notifica a los admins del tenant. El equipo NEXOR (plataforma) NO recibe notificaciones
    // in-app: supervisa las cargas desde la plataforma (/platform/supervision, HU-137/HU-140).
    const admins = await prisma.user.findMany({
      where: { tenantId, role: 'TENANT_ADMIN', isActive: true },
      select: { id: true },
    })

    const notificationData = admins.map((u) => ({
      tenantId,
      userId:  u.id,
      type:    'bulk_upload_failed',
      title:   'Carga masiva con errores',
      message: `El archivo "${fileName}" (${type}) tuvo ${errorCount} error(es). Revisa el detalle para corregirlos.`,
      link:    `/settings/bulk-upload/${logId}`,
    }))

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
    // Notifica a los admins del tenant. El equipo NEXOR supervisa desde la plataforma
    // (/platform/supervision, HU-140), sin notificaciones in-app.
    const admins = await prisma.user.findMany({
      where: { tenantId, role: 'TENANT_ADMIN', isActive: true },
      select: { id: true },
    })

    const durationSec = Math.round((Date.now() - startedAt.getTime()) / 1000)

    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((u) => ({
          tenantId,
          userId:   u.id,
          type:     'bulk_upload_success',
          title:    'Carga masiva completada',
          message:  `"${fileName}" (${type}): ${count} registros en ${durationSec}s.`,
          link:     `/settings/bulk-upload/${logId}`,
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
