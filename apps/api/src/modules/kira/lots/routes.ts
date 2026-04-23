import type { FastifyInstance } from 'fastify'
import { LotQuerySchema } from './schema'
import { listLots } from './service'
import { requireRoleAndModule } from '../../../lib/guards'
import { z2j, listRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function lotsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/kira/lots
   */
  app.get('/', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Listar lotes',
      description: 'Lista todos los lotes del tenant con fechas de caducidad. OPERATIVE forzado a su sucursal.',
      security:    bearerAuth,
      querystring: z2j(LotQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'KIRA'),
  }, async (request, reply) => {
    const parsed = LotQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code: 'VALIDATION_ERROR',
      })
    }

    const forcedBranchId =
      request.user.role === 'OPERATIVE' ? (request.user.branchId ?? undefined) : undefined

    const result = await listLots(request.user.tenantId, parsed.data, undefined, forcedBranchId)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/kira/lots/:productId
   */
  app.get('/:productId', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Lotes por producto',
      description: 'Lotes de un producto ordenados FIFO (vencimiento más próximo primero). Incluye isExpired, isExpiringSoon.',
      security:    bearerAuth,
      params: {
        type: 'object',
        properties: { productId: { type: 'string', format: 'uuid' } },
        required: ['productId'],
      },
      querystring: z2j(LotQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'KIRA'),
  }, async (request, reply) => {
    const { productId } = request.params as { productId: string }
    const parsed = LotQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code: 'VALIDATION_ERROR',
      })
    }

    const forcedBranchId =
      request.user.role === 'OPERATIVE' ? (request.user.branchId ?? undefined) : undefined

    const result = await listLots(request.user.tenantId, parsed.data, productId, forcedBranchId)
    return reply.code(200).send(result)
  })
}
