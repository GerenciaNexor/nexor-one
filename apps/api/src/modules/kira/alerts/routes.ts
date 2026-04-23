import type { FastifyInstance } from 'fastify'
import { listCriticalStock } from './service'
import { checkStockAlertsForTenant } from '../../../jobs/stock-alerts'
import { requireRoleAndModule } from '../../../lib/guards'
import { listRes, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function alertsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/kira/alerts
   */
  app.get('/', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Alertas de stock crítico',
      description: 'Stock crítico en tiempo real. OPERATIVE/AREA_MANAGER ven su sucursal; BRANCH_ADMIN+ ve todas.',
      security:    bearerAuth,
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'KIRA'),
  }, async (request, reply) => {
    const forcedBranchId =
      request.user.role === 'OPERATIVE' || request.user.role === 'AREA_MANAGER'
        ? (request.user.branchId ?? undefined)
        : undefined

    const result = await listCriticalStock(request.user.tenantId, forcedBranchId)
    return reply.code(200).send(result)
  })

  /**
   * POST /v1/kira/alerts/check
   */
  app.post('/check', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Forzar revisión de stock crítico',
      description: 'Fuerza una revisión inmediata del stock y genera notificaciones. Útil fuera del ciclo horario. Requiere AREA_MANAGER.KIRA.',
      security:    bearerAuth,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'KIRA'),
  }, async (request, reply) => {
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
  })
}
