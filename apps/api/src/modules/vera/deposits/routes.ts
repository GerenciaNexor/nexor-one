import type { FastifyInstance } from 'fastify'
import { requireRoleAndModule } from '../../../lib/guards'
import { getRentalDeposits } from './service'
import { objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function depositsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/vera/rental-deposits — depósitos en RETENCIÓN (pasivo), separado del ingreso real.
   * Total que la empresa guarda y debe devolver, con desglose por cliente y por producto.
   * Filtros opcionales: clientId, productId.
   */
  app.get('/', {
    schema: {
      tags:        ['VERA'],
      summary:     'Depósitos en retención',
      description: 'Total de depósitos retenidos (derivado de alquileres activos), por cliente/producto. No es ingreso.',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: { clientId: { type: 'string' }, productId: { type: 'string' } },
      },
      response: { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'VERA'),
  }, async (request, reply) => {
    const q = request.query as { clientId?: string; productId?: string }
    const result = await getRentalDeposits(request.user.tenantId, { clientId: q.clientId, productId: q.productId })
    return reply.code(200).send(result)
  })
}
