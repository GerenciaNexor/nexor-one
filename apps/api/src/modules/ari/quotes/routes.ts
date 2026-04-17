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

export async function quotesRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/ari/quotes
   * Lista cotizaciones del tenant.
   * OPERATIVE ve solo las que él creó. AREA_MANAGER+ ve todas.
   * Query: ?clientId=xxx &dealId=xxx &status=draft|sent|accepted|rejected|expired
   */
  app.get('/', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
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
   * Detalle completo de una cotización con líneas de productos.
   */
  app.get('/:id', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
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
   * Crea una cotización en estado 'draft'.
   * Genera número automático COT-YYYY-NNN.
   * Calcula automáticamente subtotal, descuento, impuesto y total.
   */
  app.post('/', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
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
   * Cambia el estado de la cotización.
   * Estados válidos: sent, accepted, rejected
   * Efecto secundario: si accepted → genera ingreso en VERA en la misma transacción.
   * Regla: cotización vencida no puede aceptarse.
   */
  app.put('/:id/status', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
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
   * Consulta informativa de stock en KIRA para un producto.
   * Devuelve stock total y por sucursal.
   * No reserva ni bloquea stock — solo informativo.
   */
  app.get('/stock/:productId', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
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
