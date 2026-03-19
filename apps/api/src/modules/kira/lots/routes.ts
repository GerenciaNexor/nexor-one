import type { FastifyInstance } from 'fastify'
import { LotQuerySchema } from './schema'
import { listLots } from './service'
import { requireRoleAndModule } from '../../../lib/guards'

export async function lotsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/kira/lots
   * Lista todos los lotes del tenant con sus fechas de caducidad.
   * Query: ?branchId=xxx&expiringSoon=true&expired=true
   *
   * Útil para el panel de alertas de caducidad.
   * OPERATIVE.KIRA → forzado a su propia sucursal.
   */
  app.get('/', { preHandler: requireRoleAndModule('OPERATIVE', 'KIRA') }, async (request, reply) => {
    const parsed = LotQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code: 'VALIDATION_ERROR',
      })
    }

    const forcedBranchId =
      request.user.role === 'OPERATIVE' ? (request.user.branchId ?? undefined) : undefined

    const result = await listLots(request.user.tenantId, parsed.data, undefined, forcedBranchId)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/kira/lots/:productId
   * Lotes de un producto específico, ordenados FIFO (vencimiento más próximo primero).
   *
   * La respuesta incluye:
   *   - isExpired:      el lote ya venció
   *   - isExpiringSoon: vence en los próximos 30 días
   *   - totalQuantity:  total ingresado en ese lote (referencia histórica)
   *
   * Al registrar una salida, usar el primer lote de esta lista (FIFO).
   * OPERATIVE.KIRA → forzado a su propia sucursal.
   */
  app.get('/:productId', { preHandler: requireRoleAndModule('OPERATIVE', 'KIRA') }, async (request, reply) => {
    const { productId } = request.params as { productId: string }
    const parsed = LotQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code: 'VALIDATION_ERROR',
      })
    }

    const forcedBranchId =
      request.user.role === 'OPERATIVE' ? (request.user.branchId ?? undefined) : undefined

    const result = await listLots(request.user.tenantId, parsed.data, productId, forcedBranchId)
    return reply.code(200).send(result)
  })
}
