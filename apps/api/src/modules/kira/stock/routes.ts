import type { FastifyInstance } from 'fastify'
import { StockQuerySchema, CreateMovementSchema, MovementQuerySchema } from './schema'
import { listStock, getCrossBranchStock, createMovement, listMovements } from './service'
import { requireRoleAndModule, requireRole } from '../../../lib/guards'
import { z2j, listRes, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function stockRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/kira/stock
   */
  app.get('/', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Consultar niveles de stock',
      description: 'OPERATIVE forzado a su sucursal; AREA_MANAGER+ puede filtrar por branchId o ver todas.',
      security:    bearerAuth,
      querystring: z2j(StockQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'KIRA'),
  }, async (request, reply) => {
    const parsed = StockQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code: 'VALIDATION_ERROR',
      })
    }

    const forcedBranchId =
      request.user.role === 'OPERATIVE' ? (request.user.branchId ?? undefined) : undefined

    const result = await listStock(request.user.tenantId, parsed.data, forcedBranchId)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/kira/stock/cross-branch/:productId
   */
  app.get('/cross-branch/:productId', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Stock cross-sucursal por producto',
      description: 'Stock de un producto en TODAS las sucursales del tenant. Sin restricción de módulo — ARI también lo usa.',
      security:    bearerAuth,
      params: {
        type: 'object',
        properties: { productId: { type: 'string', format: 'uuid' } },
        required: ['productId'],
      },
      response: { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: [requireRole('OPERATIVE')],
  }, async (request, reply) => {
    const { productId } = request.params as { productId: string }
    try {
      const result = await getCrossBranchStock(request.user.tenantId, productId)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply
        .code(e.statusCode ?? 500)
        .send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * POST /v1/kira/stock/movements
   */
  app.post('/movements', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Registrar movimiento de stock',
      description: 'Registra una entrada, salida o ajuste de stock. OPERATIVE solo puede operar en su propia sucursal.',
      security:    bearerAuth,
      body:        z2j(CreateMovementSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'KIRA'),
  }, async (request, reply) => {
    const parsed = CreateMovementSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code: 'VALIDATION_ERROR',
      })
    }

    if (
      request.user.role === 'OPERATIVE' &&
      parsed.data.branchId !== request.user.branchId
    ) {
      return reply.code(403).send({
        error: 'Solo puedes registrar movimientos en tu propia sucursal',
        code: 'FORBIDDEN',
      })
    }

    try {
      const movement = await createMovement(
        request.user.tenantId,
        request.user.userId,
        parsed.data,
      )
      return reply.code(201).send(movement)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply
        .code(e.statusCode ?? 500)
        .send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * GET /v1/kira/stock/movements
   */
  app.get('/movements', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Historial de movimientos',
      description: 'Historial paginado de movimientos. OPERATIVE forzado a su sucursal; AREA_MANAGER+ puede ver todas.',
      security:    bearerAuth,
      querystring: z2j(MovementQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'KIRA'),
  }, async (request, reply) => {
    const parsed = MovementQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code: 'VALIDATION_ERROR',
      })
    }

    const query =
      request.user.role === 'OPERATIVE'
        ? { ...parsed.data, branchId: request.user.branchId ?? parsed.data.branchId }
        : parsed.data

    const result = await listMovements(request.user.tenantId, query)
    return reply.code(200).send(result)
  })
}
