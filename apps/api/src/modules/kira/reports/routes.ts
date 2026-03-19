import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getAbcReport, getRotationReport } from './service'
import { calculateAbcForTenant } from '../../../jobs/abc-classification'
import { requireRoleAndModule, getBranchFilter } from '../../../lib/guards'

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
   * GET /v1/kira/reports/abc?branchId=
   * Reporte ABC: valor de inventario y % por clase (A/B/C/Sin clasificar).
   *
   * OPERATIVE.KIRA / AREA_MANAGER.KIRA → restringidos a su sucursal.
   * BRANCH_ADMIN+                       → pueden filtrar por sucursal o ver total.
   */
  app.get(
    '/abc',
    { preHandler: requireRoleAndModule('OPERATIVE', 'KIRA') },
    async (request, reply) => {
      const query        = AbcQuerySchema.parse(request.query)
      const forcedBranch = getBranchFilter(request.user)
      const branchId     = forcedBranch ?? query.branchId
      const result       = await getAbcReport(request.user.tenantId, branchId)
      return reply.code(200).send(result)
    },
  )

  /**
   * GET /v1/kira/reports/rotation?from=&to=&branchId=
   * Reporte de rotacion: velocidad de movimiento e identificacion de deadstock.
   * Periodo por defecto: ultimos 30 dias.
   *
   * OPERATIVE.KIRA / AREA_MANAGER.KIRA → restringidos a su sucursal.
   * BRANCH_ADMIN+                       → pueden filtrar por sucursal o ver total.
   */
  app.get(
    '/rotation',
    { preHandler: requireRoleAndModule('OPERATIVE', 'KIRA') },
    async (request, reply) => {
      const query        = RotationQuerySchema.parse(request.query)
      const forcedBranch = getBranchFilter(request.user)
      const branchId     = forcedBranch ?? query.branchId
      const result       = await getRotationReport(request.user.tenantId, { ...query, branchId })
      return reply.code(200).send(result)
    },
  )

  /**
   * POST /v1/kira/reports/abc/calculate
   * Dispara la clasificacion ABC manualmente para este tenant.
   * Uso principal: primera clasificacion al activar KIRA para un tenant nuevo.
   * Restringido a AREA_MANAGER.KIRA o superior.
   */
  app.post(
    '/abc/calculate',
    { preHandler: requireRoleAndModule('AREA_MANAGER', 'KIRA') },
    async (request, reply) => {
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
    },
  )
}
