import type { FastifyInstance } from 'fastify'
import { requireRole } from '../../lib/guards'
import { extractDocument } from './service'
import type { DocumentType } from './service'
import { objRes, stdErrors, bearerAuth } from '../../lib/openapi'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/octet-stream', // algunos clientes envían este tipo genérico
])

export async function ocrRoutes(app: FastifyInstance): Promise<void> {

  /**
   * POST /v1/ocr/extract
   * Extrae datos estructurados de una imagen o PDF usando Claude Vision.
   * El archivo no se persiste — se procesa en memoria y se descarta.
   *
   * Campos multipart:
   *   file  — imagen (jpg, png, webp) o PDF (requerido, máx. 10 MB)
   *   type  — "quote" | "order" (opcional, Claude auto-detecta si no se envía)
   */
  app.post('/extract', {
    schema: {
      tags:        ['OCR'],
      summary:     'Extraer datos de imagen o PDF con Claude Vision',
      description: 'Recibe una imagen o PDF de cotización u orden de compra y devuelve los datos estructurados extraídos por Claude Vision. El archivo no se almacena.',
      security:    bearerAuth,
      consumes:    ['multipart/form-data'],
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: [requireRole('AREA_MANAGER')],
  }, async (request, reply) => {
    // ── Leer partes del multipart ──────────────────────────────────────────
    let docTypeRaw = ''
    let fileBuffer: Buffer | null = null
    let fileName   = ''
    let mimeType   = ''

    try {
      for await (const part of request.parts()) {
        if (part.type === 'field' && part.fieldname === 'type') {
          docTypeRaw = (part.value as string).trim().toLowerCase()
        } else if (part.type === 'file' && part.fieldname === 'file') {
          const chunks: Buffer[] = []
          for await (const chunk of part.file) {
            chunks.push(chunk)
          }
          fileBuffer = Buffer.concat(chunks)
          fileName   = part.filename ?? ''
          mimeType   = part.mimetype ?? ''
        }
      }
    } catch (err: unknown) {
      const e = err as { message?: string }
      if (e.message?.includes('Request file too large')) {
        return reply.code(413).send({
          error: 'El archivo excede el límite de 10 MB.',
          code:  'FILE_TOO_LARGE',
        })
      }
      return reply.code(400).send({ error: 'Error al leer el archivo', code: 'UPLOAD_ERROR' })
    }

    // ── Validaciones básicas ───────────────────────────────────────────────
    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.code(400).send({
        error: 'No se recibió ningún archivo. Envía el campo "file" como multipart.',
        code:  'MISSING_FILE',
      })
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return reply.code(422).send({
        error: `Formato no soportado: ${mimeType}. Usa JPG, PNG, WEBP o PDF.`,
        code:  'UNSUPPORTED_FORMAT',
      })
    }

    const validDocTypes = new Set<DocumentType>(['quote', 'order'])
    const docType: DocumentType | null = validDocTypes.has(docTypeRaw as DocumentType)
      ? (docTypeRaw as DocumentType)
      : null

    // ── Llamar al servicio de extracción ───────────────────────────────────
    try {
      const result = await extractDocument({
        fileBuffer,
        mimeType,
        fileName,
        docType,
        tenantId: request.user.tenantId,
      })
      return reply.code(200).send({ data: result })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      const status = e.statusCode ?? 500
      if (status >= 500) {
        request.log.error({ err }, 'OCR extract error')
        return reply.code(500).send({ error: 'Error interno al procesar el documento', code: 'OCR_ERROR' })
      }
      return reply.code(status).send({ error: e.message ?? 'Error al procesar', code: e.code ?? 'OCR_ERROR' })
    }
  })
}
