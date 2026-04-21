import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { compareSupplierPrices } from './service'
import { requireRoleAndModule } from '../../../lib/guards'
import { stdErrors, bearerAuth } from '../../../lib/openapi'

const QuerySchema = z.object({
  productId: z.string().min(1, 'El productId es requerido'),
})

export async function compareRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/nira/compare
   */
  app.get('/', {
    schema: {
      tags:        ['NIRA'],
      summary:     'Comparar precios por proveedor',
      description: 'Historial de precios de un producto por proveedor. Solo OC en estado received. Ordenado por precio promedio ascendente.',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: { productId: { type: 'string', format: 'uuid', description: 'ID del producto a comparar' } },
        required: ['productId'],
      },
      response: { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'NIRA'),
  }, async (request, reply) => {
    const parsed = QuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const result = await compareSupplierPrices(request.user.tenantId, parsed.data.productId)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
