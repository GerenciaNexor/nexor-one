import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getSuppliersRanking } from '../suppliers/service'
import { getCostsReport } from './service'
import { requireRoleAndModule } from '../../../lib/guards'

const CostsQuerySchema = z.object({
  from:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido (YYYY-MM-DD)').optional(),
  to:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido (YYYY-MM-DD)').optional(),
  branchId: z.string().optional(),
})

export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/nira/reports/costs
   * Reporte de costos: total gastado en OC por proveedor y categoría.
   * Solo OC en estado approved, sent, partial, received.
   * Query: ?from=YYYY-MM-DD &to=YYYY-MM-DD &branchId=xxx
   * AREA_MANAGER.NIRA o superior puede consultar.
   */
  app.get('/costs', { preHandler: requireRoleAndModule('AREA_MANAGER', 'NIRA') }, async (request, reply) => {
    const parsed = CostsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const result = await getCostsReport(request.user.tenantId, parsed.data)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * GET /v1/nira/reports/suppliers-ranking
   * Devuelve todos los proveedores activos ordenados por overallScore DESC.
   * OPERATIVE.NIRA o superior puede consultar.
   */
  app.get('/suppliers-ranking', { preHandler: requireRoleAndModule('OPERATIVE', 'NIRA') }, async (request, reply) => {
    try {
      const result = await getSuppliersRanking(request.user.tenantId)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
