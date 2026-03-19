import type { FastifyInstance } from 'fastify'
import { listCriticalStock } from './service'
import { checkStockAlertsForTenant } from '../../../jobs/stock-alerts'
import { requireRoleAndModule } from '../../../lib/guards'

export async function alertsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/kira/alerts
   * Stock crítico en tiempo real (sin esperar al job horario).
   *
   * OPERATIVE.KIRA     → solo su sucursal
   * AREA_MANAGER.KIRA+ → solo su sucursal (está asignado a una)
   * BRANCH_ADMIN+      → puede ver todas las sucursales
   */
  app.get('/', { preHandler: requireRoleAndModule('OPERATIVE', 'KIRA') }, async (request, reply) => {
    const forcedBranchId =
      request.user.role === 'OPERATIVE' || request.user.role === 'AREA_MANAGER'
        ? (request.user.branchId ?? undefined)
        : undefined

    const result = await listCriticalStock(request.user.tenantId, forcedBranchId)
    return reply.code(200).send(result)
  })

  /**
   * POST /v1/kira/alerts/check
   * Fuerza una revisión inmediata del stock crítico del tenant
   * y genera las notificaciones que correspondan.
   *
   * Uso principal: revisión manual fuera del ciclo horario.
   * AREA_MANAGER.KIRA o superior puede dispararlo.
   */
  app.post(
    '/check',
    { preHandler: requireRoleAndModule('AREA_MANAGER', 'KIRA') },
    async (request, reply) => {
      try {
        const result = await checkStockAlertsForTenant(request.user.tenantId)
        return reply.code(200).send({
          message:       `Revisión completada`,
          alertsCreated: result.alertsCreated,
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
