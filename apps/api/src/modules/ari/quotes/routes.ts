import type { FastifyInstance } from 'fastify'
import {
  CreateQuoteSchema,
  UpdateQuoteStatusSchema,
  QuoteQuerySchema,
} from './schema'
import {
  listQuotes,
  getQuote,
  createQuote,
  updateQuoteStatus,
  getProductStockForQuote,
} from './service'
import { requireRoleAndModule } from '../../../lib/guards'
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function quotesRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/ari/quotes
   */
  app.get('/', {
    schema: {
      tags:        ['ARI'],
      summary:     'Listar cotizaciones',
      description: 'Lista cotizaciones del tenant. OPERATIVE ve solo las que creó; AREA_MANAGER+ ve todas.',
      security:    bearerAuth,
      querystring: z2j(QuoteQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
    const parsed = QuoteQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    const result = await listQuotes(
      request.user.tenantId,
      request.user.userId,
      request.user.role,
      parsed.data,
    )
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/ari/quotes/:id
   */
  app.get('/:id', {
    schema: {
      tags:        ['ARI'],
      summary:     'Detalle de cotización',
      description: 'Detalle completo con líneas de productos, totales y estado actual.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const quote = await getQuote(request.user.tenantId, id)
      return reply.code(200).send(quote)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * POST /v1/ari/quotes
   */
  app.post('/', {
    schema: {
      tags:        ['ARI'],
      summary:     'Crear cotización',
      description: 'Crea una cotización en estado draft. Genera número automático COT-YYYY-NNN. Calcula subtotal, descuento, impuesto y total.',
      security:    bearerAuth,
      body:        z2j(CreateQuoteSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
    const parsed = CreateQuoteSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const quote = await createQuote(request.user.tenantId, request.user.userId, parsed.data)
      return reply.code(201).send(quote)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/ari/quotes/:id/status
   */
  app.put('/:id/status', {
    schema: {
      tags:        ['ARI'],
      summary:     'Cambiar estado de cotización',
      description: 'Transición de estado: sent, accepted, rejected. Si accepted → genera ingreso en VERA. Cotización vencida no puede aceptarse.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(UpdateQuoteStatusSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateQuoteStatusSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Estado inválido',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const quote = await updateQuoteStatus(request.user.tenantId, id, parsed.data)
      return reply.code(200).send(quote)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * GET /v1/ari/quotes/stock/:productId
   */
  app.get('/stock/:productId', {
    schema: {
      tags:        ['ARI'],
      summary:     'Consultar stock para cotización',
      description: 'Stock total y por sucursal de un producto. Solo informativo — no reserva stock.',
      security:    bearerAuth,
      params: {
        type: 'object',
        properties: { productId: { type: 'string', format: 'uuid' } },
        required: ['productId'],
      },
      response: { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
    const { productId } = request.params as { productId: string }
    try {
      const stock = await getProductStockForQuote(request.user.tenantId, productId)
      return reply.code(200).send(stock)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
