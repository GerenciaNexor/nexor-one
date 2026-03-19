import type { FastifyInstance } from 'fastify'
import { StockQuerySchema } from './schema'
import { listStock, getCrossBranchStock } from './service'
import { requireRoleAndModule, requireRole } from '../../../lib/guards'

export async function stockRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/kira/stock
   * Query: ?branchId=xxx&belowMin=true
   *
   * OPERATIVE.KIRA     → forzado a su propia sucursal (branchId del query ignorado)
   * AREA_MANAGER.KIRA+ → puede filtrar por branchId o ver todas las sucursales
   * BRANCH_ADMIN+      → ve todas las sucursales, puede filtrar
   */
  app.get('/', { preHandler: requireRoleAndModule('OPERATIVE', 'KIRA') }, async (request, reply) => {
    const parsed = StockQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code: 'VALIDATION_ERROR',
      })
    }

    // OPERATIVE solo puede ver su propia sucursal
    const forcedBranchId =
      request.user.role === 'OPERATIVE' ? (request.user.branchId ?? undefined) : undefined

    const result = await listStock(request.user.tenantId, parsed.data, forcedBranchId)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/kira/stock/cross-branch/:productId
   * Stock de un producto en TODAS las sucursales del tenant.
   *
   * Accesible sin restricción de módulo porque ARI también lo usa
   * para verificar disponibilidad antes de generar una cotización.
   * Es de solo lectura — no modifica nada.
   */
  app.get(
    '/cross-branch/:productId',
    { preHandler: [requireRole('OPERATIVE')] },
    async (request, reply) => {
      const { productId } = request.params as { productId: string }
      try {
        const result = await getCrossBranchStock(request.user.tenantId, productId)
        return reply.code(200).send(result)
      } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string; code?: string }
        return reply
          .code(e.statusCode ?? 500)
          .send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
      }
    },
  )
}
