import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getAbcReport, getRotationReport } from './service'
import { calculateAbcForTenant } from '../../../jobs/abc-classification'
import { requireRoleAndModule, getBranchFilter } from '../../../lib/guards'
import { objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

const AbcQuerySchema = z.object({
  branchId: z.string().optional(),
})

const RotationQuerySchema = z.object({
  from:     z.string().optional(),
  to:       z.string().optional(),
  branchId: z.string().optional(),
})

export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/kira/reports/abc
   */
  app.get('/abc', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Reporte ABC de inventario',
      description: 'Valor de inventario y porcentaje por clase (A/B/C). OPERATIVE/AREA_MANAGER restringidos a su sucursal.',
      security:    bearerAuth,
      querystring: { type: 'object', properties: { branchId: { type: 'string' } } },
      response:    { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'KIRA'),
  }, async (request, reply) => {
    const query        = AbcQuerySchema.parse(request.query)
    const forcedBranch = getBranchFilter(request.user)
    const branchId     = forcedBranch ?? query.branchId
    const result       = await getAbcReport(request.user.tenantId, branchId)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/kira/reports/rotation
   */
  app.get('/rotation', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Reporte de rotación de inventario',
      description: 'Velocidad de movimiento e identificación de deadstock. Período por defecto: últimos 30 días.',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: {
          from:     { type: 'string' },
          to:       { type: 'string' },
          branchId: { type: 'string' },
        },
      },
      response: { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'KIRA'),
  }, async (request, reply) => {
    const query        = RotationQuerySchema.parse(request.query)
    const forcedBranch = getBranchFilter(request.user)
    const branchId     = forcedBranch ?? query.branchId
    const result       = await getRotationReport(request.user.tenantId, { ...query, branchId })
    return reply.code(200).send(result)
  })

  /**
   * POST /v1/kira/reports/abc/calculate
   */
  app.post('/abc/calculate', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Calcular clasificación ABC',
      description: 'Dispara la clasificación ABC manualmente. Uso principal: primera clasificación al activar KIRA. Requiere AREA_MANAGER.KIRA.',
      security:    bearerAuth,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'KIRA'),
  }, async (request, reply) => {
    try {
      const result = await calculateAbcForTenant(request.user.tenantId)
      return reply.code(200).send({
        message:    `Clasificacion ABC completada`,
        classified: result.classified,
        cleared:    result.cleared,
      })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply
        .code(e.statusCode ?? 500)
        .send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
