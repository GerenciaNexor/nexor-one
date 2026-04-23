import type { FastifyInstance } from 'fastify'
import { requireRoleAndModule } from '../../../lib/guards'
import { SlotsQuerySchema } from './schema'
import { getAvailableSlots } from './service'
import { z2j, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function slotsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/agenda/slots
   */
  app.get('/', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Horarios disponibles',
      description: 'Calcula slots disponibles para un servicio en una sucursal y fecha dada. Usado por el agente IA para mostrar horarios en tiempo real.',
      security:    bearerAuth,
      querystring: z2j(SlotsQuerySchema),
      response:    { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'AGENDA'),
  }, async (request, reply) => {
    const parsed = SlotsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code:  'VALIDATION_ERROR',
      })
    }

    try {
      const result = await getAvailableSlots(request.user.tenantId, parsed.data)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
