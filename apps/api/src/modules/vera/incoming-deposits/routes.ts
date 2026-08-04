import type { FastifyInstance } from 'fastify'
import { requireRoleAndModule } from '../../../lib/guards'
import { getIncomingRentalDeposits } from './service'
import { objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function incomingDepositsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/vera/incoming-rental-deposits — HU-177
   * Retención por cobrar (dinero propio afuera, recuperable) del alquiler entrante, SEPARADA del
   * gasto real (costo + depósitos perdidos). Filtros: project, supplierId.
   */
  app.get('/', {
    schema: {
      tags:        ['VERA'],
      summary:     'Retención por cobrar de alquileres entrantes',
      description: 'Total de depósitos propios afuera (recuperable), derivado de alquileres entrantes activos, por proyecto/tercero. Separado del gasto real (costo + depósitos perdidos).',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: { project: { type: 'string' }, supplierId: { type: 'string' } },
      },
      response: { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'VERA'),
  }, async (request, reply) => {
    const q = request.query as { project?: string; supplierId?: string }
    const result = await getIncomingRentalDeposits(request.user.tenantId, { project: q.project, supplierId: q.supplierId })
    return reply.code(200).send(result)
  })
}
