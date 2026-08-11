import type { FastifyInstance, FastifyReply } from 'fastify'
import { QuickPurchaseSchema, QuickSaleSchema, RegisterInvoiceSchema } from './schema'
import { quickPurchase, quickSale, listQuickProducts, listQuickSuppliers, listQuickClients, listQuickBranches, listQuickRegisters, extractInvoice, registerInvoice, getInvoice, getInvoiceImage } from './service'
import { requireRole } from '../../lib/guards'
import { z2j, listRes, objRes, stdErrors, bearerAuth } from '../../lib/openapi'

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

const errReply = (reply: FastifyReply, err: unknown) => {
  const e = err as { statusCode?: number; message?: string; code?: string }
  return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
}

/**
 * HU-169 — Registro rápido de compra/venta (transacción ya ocurrida, sin aprobación).
 * Es un camino transversal (NIRA/ARI/KIRA/VERA); se protege por ROL (mín. OPERATIVE) + tenant/RLS,
 * sin exigir un módulo específico. El OPERATIVE queda fijado a SU sucursal.
 */
export default async function quickModule(app: FastifyInstance): Promise<void> {
  // Lookups
  app.get('/products',  { schema: { tags: ['Quick'], summary: 'Productos para registro rápido', security: bearerAuth, response: { 200: listRes, ...stdErrors } }, preHandler: [requireRole('OPERATIVE')] },
    async (req, reply) => reply.code(200).send(await listQuickProducts(req.user.tenantId)))
  app.get('/suppliers', { schema: { tags: ['Quick'], summary: 'Proveedores (incluye genérico)', security: bearerAuth, response: { 200: listRes, ...stdErrors } }, preHandler: [requireRole('OPERATIVE')] },
    async (req, reply) => reply.code(200).send(await listQuickSuppliers(req.user.tenantId)))
  app.get('/clients',   { schema: { tags: ['Quick'], summary: 'Clientes (incluye genérico)', security: bearerAuth, response: { 200: listRes, ...stdErrors } }, preHandler: [requireRole('OPERATIVE')] },
    async (req, reply) => reply.code(200).send(await listQuickClients(req.user.tenantId)))
  app.get('/branches',  { schema: { tags: ['Quick'], summary: 'Sucursales', security: bearerAuth, response: { 200: listRes, ...stdErrors } }, preHandler: [requireRole('OPERATIVE')] },
    async (req, reply) => reply.code(200).send(await listQuickBranches(req.user.tenantId)))

  /** GET /v1/quick/registers — historial de registros rápidos (compras y ventas). */
  app.get('/registers', {
    schema: { tags: ['Quick'], summary: 'Historial de registros rápidos', security: bearerAuth,
      querystring: { type: 'object', properties: { kind: { type: 'string', enum: ['purchase', 'sale'] }, page: { type: 'string' }, limit: { type: 'string' } } },
      response: { 200: listRes, ...stdErrors } },
    preHandler: [requireRole('OPERATIVE')],
  }, async (req, reply) => {
    const q = req.query as { kind?: 'purchase' | 'sale'; page?: string; limit?: string }
    const page = Math.max(1, parseInt(q.page ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? '50', 10) || 50))
    return reply.code(200).send(await listQuickRegisters(req.user.tenantId, { kind: q.kind, page, limit }))
  })

  /** POST /v1/quick/purchases — compra rápida (ya completada). */
  app.post('/purchases', {
    schema: { tags: ['Quick'], summary: 'Registrar compra rápida', security: bearerAuth, body: z2j(QuickPurchaseSchema), response: { 201: objRes, ...stdErrors } },
    preHandler: [requireRole('OPERATIVE')],
  }, async (request, reply) => {
    const parsed = QuickPurchaseSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    if (request.user.role === 'OPERATIVE') parsed.data.branchId = request.user.branchId ?? parsed.data.branchId
    try {
      const result = await quickPurchase(request.user.tenantId, request.user.userId, parsed.data)
      return reply.code(201).send({ success: true, data: result })
    } catch (err) { return errReply(reply, err) }
  })

  /** POST /v1/quick/sales — venta rápida (ya completada). */
  app.post('/sales', {
    schema: { tags: ['Quick'], summary: 'Registrar venta rápida', security: bearerAuth, body: z2j(QuickSaleSchema), response: { 201: objRes, ...stdErrors } },
    preHandler: [requireRole('OPERATIVE')],
  }, async (request, reply) => {
    const parsed = QuickSaleSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    if (request.user.role === 'OPERATIVE') parsed.data.branchId = request.user.branchId ?? parsed.data.branchId
    try {
      const result = await quickSale(request.user.tenantId, request.user.userId, parsed.data)
      return reply.code(201).send({ success: true, data: result })
    } catch (err) { return errReply(reply, err) }
  })

  // ── HU-191 — Factura por imagen (OCR) ──────────────────────────────────────

  /**
   * POST /v1/quick/invoices/extract — sube UNA imagen de factura, la lee (OCR Haiku+caching) y cruza
   * con inventario. NO persiste (el humano confirma después). tenantTx:false: llama a Claude (I/O
   * externo) y usa directPrisma con filtro tenantId.
   */
  app.post('/invoices/extract', {
    schema: { tags: ['Quick'], summary: 'Leer factura por imagen (OCR)', consumes: ['multipart/form-data'], security: bearerAuth, response: { 200: objRes, ...stdErrors } },
    config:     { tenantTx: false },
    preHandler: [requireRole('OPERATIVE')],
  }, async (request, reply) => {
    let kindRaw = '', fileBuffer: Buffer | null = null, fileName = '', mimeType = ''
    try {
      for await (const part of request.parts()) {
        if (part.type === 'field' && part.fieldname === 'kind') kindRaw = String(part.value).trim().toLowerCase()
        else if (part.type === 'file' && part.fieldname === 'file') {
          const chunks: Buffer[] = []
          for await (const chunk of part.file) chunks.push(chunk)
          fileBuffer = Buffer.concat(chunks); fileName = part.filename ?? ''; mimeType = part.mimetype ?? ''
        }
      }
    } catch (err: unknown) {
      if ((err as { message?: string }).message?.includes('too large')) return reply.code(413).send({ error: 'El archivo excede el límite de 10 MB.', code: 'FILE_TOO_LARGE' })
      return reply.code(400).send({ error: 'Error al leer el archivo', code: 'UPLOAD_ERROR' })
    }
    if (!fileBuffer || fileBuffer.length === 0) return reply.code(400).send({ error: 'No se recibió ningún archivo. Envía el campo "file".', code: 'MISSING_FILE' })
    if (!ALLOWED_MIME.has(mimeType)) return reply.code(422).send({ error: `Formato no soportado: ${mimeType}. Usa JPG, PNG, WEBP o PDF.`, code: 'UNSUPPORTED_FORMAT' })
    const kind = kindRaw === 'sale' ? 'sale' : 'purchase'
    try {
      const result = await extractInvoice({ tenantId: request.user.tenantId, kind, fileBuffer, mimeType, fileName })
      return reply.code(200).send({ success: true, data: result })
    } catch (err) { return errReply(reply, err) }
  })

  /** POST /v1/quick/invoices — registra la factura revisada/confirmada (transacción + factura + imagen). */
  app.post('/invoices', {
    schema: { tags: ['Quick'], summary: 'Registrar factura leída (confirmada)', security: bearerAuth, body: z2j(RegisterInvoiceSchema), response: { 201: objRes, ...stdErrors } },
    preHandler: [requireRole('OPERATIVE')],
  }, async (request, reply) => {
    const parsed = RegisterInvoiceSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    // OPERATIVE queda fijado a SU sucursal (como en compra/venta rápida).
    const branchId = request.user.role === 'OPERATIVE' ? (request.user.branchId ?? parsed.data.branchId ?? null) : (parsed.data.branchId ?? null)
    try {
      const result = await registerInvoice(request.user.tenantId, request.user.userId, branchId, parsed.data)
      return reply.code(201).send({ success: true, data: result })
    } catch (err) { return errReply(reply, err) }
  })

  /** GET /v1/quick/invoices/:id — factura guardada: encabezado + "Información adicional obtenida" (HU-193-B). */
  app.get('/invoices/:id', {
    schema: { tags: ['Quick'], summary: 'Factura guardada (incluye información adicional)', security: bearerAuth, params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, response: { 200: objRes, ...stdErrors } },
    preHandler: [requireRole('OPERATIVE')],
  }, async (request, reply) => {
    try {
      return reply.code(200).send({ success: true, data: await getInvoice(request.user.tenantId, (request.params as { id: string }).id) })
    } catch (err) { return errReply(reply, err) }
  })

  /** GET /v1/quick/invoices/:id/image — sirve la imagen comprimida de la factura (trazabilidad). */
  app.get('/invoices/:id/image', {
    schema: { tags: ['Quick'], summary: 'Imagen de una factura', security: bearerAuth, params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    preHandler: [requireRole('OPERATIVE')],
  }, async (request, reply) => {
    try {
      const { data, mime } = await getInvoiceImage(request.user.tenantId, (request.params as { id: string }).id)
      return reply.header('Content-Type', mime).header('Cache-Control', 'private, max-age=3600').send(data)
    } catch (err) { return errReply(reply, err) }
  })
}
