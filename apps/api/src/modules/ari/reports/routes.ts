import type { FastifyInstance } from 'fastify'
import { ReportQuerySchema } from './schema'
import { getSalesReport, getPipelineReport } from './service'
import { requireRoleAndModule } from '../../../lib/guards'
import { z2j, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function reportsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/ari/reports/sales
   */
  app.get('/sales', {
    schema: {
      tags:        ['ARI'],
      summary:     'Reporte de ventas',
      description: 'Deals ganados/perdidos, valor, tasa de conversión y días promedio para cerrar. OPERATIVE ve solo los suyos.',
      security:    bearerAuth,
      querystring: z2j(ReportQuerySchema),
      response:    { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
    const parsed = ReportQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    const result = await getSalesReport(
      request.user.tenantId,
      request.user.userId,
      request.user.role,
      parsed.data,
    )
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/ari/reports/pipeline
   */
  app.get('/pipeline', {
    schema: {
      tags:        ['ARI'],
      summary:     'Reporte de pipeline',
      description: 'Deals y valor por etapa, deals sin actividad > 7 días. OPERATIVE ve solo los suyos.',
      security:    bearerAuth,
      querystring: z2j(ReportQuerySchema),
      response:    { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
    const parsed = ReportQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    const result = await getPipelineReport(
      request.user.tenantId,
      request.user.userId,
      request.user.role,
      parsed.data,
    )
    return reply.code(200).send(result)
  })
}
