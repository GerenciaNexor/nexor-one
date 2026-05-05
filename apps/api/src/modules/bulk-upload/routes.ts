import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '../../lib/prisma'
import { requireTenantAdmin } from '../../lib/guards'
import { bearerAuth, stdErrors } from '../../lib/openapi'
import { BULK_UPLOAD_TYPES, REQUIRED_COLUMNS, type BulkUploadType } from './schema'
import {
  parseExcel,
  validateRows,
  processRows,
  logFailedUpload,
  logValidationResult,
  type UploadMeta,
} from './service'
import { generateTemplate, getTemplateFileName } from './templates'

export async function bulkUploadRoutes(app: FastifyInstance): Promise<void> {

  // ─── POST /validate ─────────────────────────────────────────────────────────

  app.post('/validate', {
    schema: {
      tags:        ['Carga masiva'],
      summary:     'Validar archivo de carga masiva',
      description: `Recibe un archivo Excel (multipart/form-data) y el campo "type".
Tipos: ${BULK_UPLOAD_TYPES.join(', ')}.
Sin errores → devuelve preview. Con errores → devuelve lista de errores.
Genera un registro inmutable en bulk_upload_logs.`,
      security: bearerAuth,
      response: { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
    const { type, fileBuffer, fileName, fileSize } = await readMultipart(request)

    if (!type) return reply.code(400).send({ error: 'El campo "type" es requerido', code: 'MISSING_TYPE' })
    if (!BULK_UPLOAD_TYPES.includes(type as BulkUploadType)) {
      return reply.code(400).send({ error: `Tipo inválido. Permitidos: ${BULK_UPLOAD_TYPES.join(', ')}`, code: 'INVALID_TYPE' })
    }
    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.code(400).send({ error: 'Se requiere un archivo Excel', code: 'MISSING_FILE' })
    }

    const uploadType = type as BulkUploadType
    const tenantId   = request.user.tenantId
    const userId     = request.user.userId

    let headers: string[]
    let rows: Record<string, unknown>[]
    try {
      const parsed = await parseExcel(fileBuffer)
      headers = parsed.headers
      rows    = parsed.rows
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 400).send({ error: e.message ?? 'No se pudo leer el archivo', code: e.code ?? 'INVALID_FILE' })
    }

    if (rows.length === 0) return reply.code(400).send({ error: 'El archivo no contiene datos', code: 'EMPTY_FILE' })

    const missing = REQUIRED_COLUMNS[uploadType].filter((col) => !headers.includes(col))
    if (missing.length > 0) {
      return reply.code(400).send({ error: `Columnas requeridas faltantes: ${missing.join(', ')}`, code: 'MISSING_COLUMNS', missing })
    }

    const meta: UploadMeta = { fileName, fileSize, rowCount: rows.length, fileBuffer }
    const errors = await validateRows(tenantId, uploadType, rows)
    const logId  = await logValidationResult(tenantId, userId, uploadType, meta, errors)

    if (errors.length > 0) {
      return reply.code(200).send({ valid: false, errors, errorCount: errors.length, totalRows: rows.length, logId })
    }

    return reply.code(200).send({
      valid:    true,
      preview:  buildPreview(uploadType, rows),
      count:    rows.length,
      logId,
      fileName,
      message:  `${rows.length} registros listos para importar. Llama a /process con el mismo archivo para confirmar.`,
    })
  })

  // ─── POST /process ──────────────────────────────────────────────────────────

  app.post('/process', {
    schema: {
      tags:        ['Carga masiva'],
      summary:     'Procesar archivo de carga masiva',
      description: `Valida y procesa atómicamente. Si hay errores rechaza sin procesar nada.
Genera un registro inmutable en bulk_upload_logs con el archivo adjunto.
Solo TENANT_ADMIN.`,
      security: bearerAuth,
      response: { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
    const { type, fileBuffer, fileName, fileSize } = await readMultipart(request)

    if (!type || !BULK_UPLOAD_TYPES.includes(type as BulkUploadType)) {
      return reply.code(400).send({ error: 'El campo "type" debe ser un tipo válido', code: 'INVALID_TYPE' })
    }
    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.code(400).send({ error: 'Se requiere un archivo Excel', code: 'MISSING_FILE' })
    }

    const uploadType = type as BulkUploadType
    const tenantId   = request.user.tenantId
    const userId     = request.user.userId

    let headers: string[]
    let rows: Record<string, unknown>[]
    try {
      const parsed = await parseExcel(fileBuffer)
      headers = parsed.headers
      rows    = parsed.rows
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 400).send({ error: e.message ?? 'No se pudo leer el archivo', code: e.code ?? 'INVALID_FILE' })
    }

    if (rows.length === 0) return reply.code(400).send({ error: 'El archivo no contiene datos', code: 'EMPTY_FILE' })

    const missing = REQUIRED_COLUMNS[uploadType].filter((col) => !headers.includes(col))
    if (missing.length > 0) {
      return reply.code(400).send({ error: `Columnas requeridas faltantes: ${missing.join(', ')}`, code: 'MISSING_COLUMNS', missing })
    }

    const meta: UploadMeta = { fileName, fileSize, rowCount: rows.length, fileBuffer }
    const errors = await validateRows(tenantId, uploadType, rows)

    if (errors.length > 0) {
      const logId = await logFailedUpload(tenantId, userId, uploadType, meta, errors)
      return reply.code(422).send({
        error:      'El archivo contiene errores. Corrígelos y vuelve a intentarlo.',
        code:       'VALIDATION_ERRORS',
        errors,
        errorCount: errors.length,
        totalRows:  rows.length,
        logId,
      })
    }

    try {
      const result = await processRows(tenantId, userId, uploadType, rows, meta)
      return reply.code(200).send({
        success:   true,
        processed: result.processed,
        logId:     result.logId,
        message:   `Se importaron ${result.processed} registros exitosamente.`,
      })
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string }
      const logId = await logFailedUpload(tenantId, userId, uploadType, meta, [])
      return reply.code(500).send({ error: e.message ?? 'Error al procesar el archivo', code: 'PROCESS_ERROR', logId })
    }
  })

  // ─── GET /logs ──────────────────────────────────────────────────────────────

  app.get('/logs', {
    schema: {
      tags:        ['Carga masiva'],
      summary:     'Historial de cargas masivas',
      description: 'Lista las cargas masivas del tenant autenticado con paginación.',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: {
          page:   { type: 'string' },
          limit:  { type: 'string' },
          type:   { type: 'string' },
          status: { type: 'string' },
        },
      },
      response: { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
    const q     = request.query as { page?: string; limit?: string; type?: string; status?: string }
    const page  = Math.max(1, Number(q.page  ?? 1))
    const limit = Math.min(50, Math.max(1, Number(q.limit ?? 20)))

    const where = {
      tenantId: request.user.tenantId,
      ...(q.type   ? { type:   q.type   } : {}),
      ...(q.status ? { status: q.status } : {}),
    }

    const [data, total] = await Promise.all([
      prisma.bulkUploadLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
        select: {
          id:          true,
          type:        true,
          fileName:    true,
          fileSize:    true,
          rowCount:    true,
          recordCount: true,
          status:      true,
          createdAt:   true,
          finishedAt:  true,
        },
      }),
      prisma.bulkUploadLog.count({ where }),
    ])

    return reply.code(200).send({ data, total, page, limit })
  })

  // ─── GET /logs/:id ──────────────────────────────────────────────────────────

  app.get('/logs/:id', {
    schema: {
      tags:        ['Carga masiva'],
      summary:     'Detalle de una carga masiva',
      description: 'Devuelve el detalle completo incluyendo errores si los hubo. Solo el TENANT_ADMIN de su propio tenant.',
      security:    bearerAuth,
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      response: { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
    const { id }    = request.params as { id: string }
    const tenantId  = request.user.tenantId

    const log = await prisma.bulkUploadLog.findFirst({
      where: { id, tenantId },
      select: {
        id:          true,
        type:        true,
        fileName:    true,
        fileSize:    true,
        rowCount:    true,
        recordCount: true,
        status:      true,
        errors:      true,
        createdAt:   true,
        finishedAt:  true,
        userId:      true,
      },
    })

    if (!log) return reply.code(404).send({ error: 'Registro no encontrado', code: 'NOT_FOUND' })

    return reply.code(200).send(log)
  })

  // ─── GET /template/:type ────────────────────────────────────────────────────

  app.get('/template/:type', {
    schema: {
      tags:     ['Carga masiva'],
      summary:  'Descargar plantilla Excel',
      description: `Genera y descarga la plantilla Excel con encabezados, fila de ejemplo y hoja de instrucciones.
Tipos válidos: ${BULK_UPLOAD_TYPES.join(', ')}.`,
      security: bearerAuth,
      params: {
        type: 'object',
        properties: { type: { type: 'string' } },
        required: ['type'],
      },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
    const { type } = request.params as { type: string }

    if (!BULK_UPLOAD_TYPES.includes(type as BulkUploadType)) {
      return reply.code(400).send({ error: `Tipo inválido. Permitidos: ${BULK_UPLOAD_TYPES.join(', ')}`, code: 'INVALID_TYPE' })
    }

    const buffer   = await generateTemplate(type as BulkUploadType)
    const fileName = getTemplateFileName(type as BulkUploadType)

    return reply
      .code(200)
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .header('Content-Length', buffer.length)
      .send(buffer)
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readMultipart(
  request: FastifyRequest,
): Promise<{ type: string | null; fileBuffer: Buffer | null; fileName: string; fileSize: number }> {
  const req = request as unknown as { parts: () => AsyncIterable<{ type: 'field' | 'file'; fieldname: string; value?: unknown; filename?: string; file?: AsyncIterable<Buffer> }> }
  const parts = req.parts()

  let type: string | null = null
  let fileBuffer: Buffer | null = null
  let fileName = 'archivo.xlsx'
  let fileSize = 0

  for await (const part of parts) {
    if (part.type === 'field' && part.fieldname === 'type') {
      type = String(part.value)
    } else if (part.type === 'file' && part.file) {
      fileName = part.filename ?? 'archivo.xlsx'
      const chunks: Buffer[] = []
      for await (const chunk of part.file) {
        chunks.push(chunk)
      }
      fileBuffer = Buffer.concat(chunks)
      fileSize   = fileBuffer.length
    }
  }

  return { type, fileBuffer, fileName, fileSize }
}

function buildPreview(type: BulkUploadType, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.slice(0, 10).map((row) => {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(row)) {
      if (val !== null && val !== undefined && val !== '') {
        out[key] = (type === 'users' && key === 'contraseña') ? '••••••••' : val
      }
    }
    return out
  })
}
