import type { FastifyInstance } from 'fastify'
import { ReportQuerySchema } from './schema'
import { getSalesReport, getPipelineReport } from './service'
import { requireRoleAndModule } from '../../../lib/guards'

export async function reportsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/ari/reports/sales
   * Reporte de rendimiento de ventas: deals ganados/perdidos, valor, tasa de conversión,
   * días promedio para cerrar y desglose por vendedor.
   *
   * Acceso:
   *   - OPERATIVE.ARI  → solo ve sus propios deals (forzado en servicio)
   *   - AREA_MANAGER+  → ve todos; puede filtrar por assignedTo y branchId
   *
   * Query: ?dateFrom=YYYY-MM-DD &dateTo=YYYY-MM-DD &assignedTo=userId|me &branchId=xxx
   */
  app.get('/sales', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
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
   * Estado del pipeline: deals y valor por etapa, deals sin actividad > 7 días.
   *
   * Acceso:
   *   - OPERATIVE.ARI  → solo sus deals asignados
   *   - AREA_MANAGER+  → todo el tenant
   *
   * Query: ?dateFrom=YYYY-MM-DD &dateTo=YYYY-MM-DD &assignedTo=userId|me &branchId=xxx
   */
  app.get('/pipeline', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
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
