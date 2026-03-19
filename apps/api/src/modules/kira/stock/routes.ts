import type { FastifyInstance } from 'fastify'
import { StockQuerySchema, CreateMovementSchema, MovementQuerySchema } from './schema'
import { listStock, getCrossBranchStock, createMovement, listMovements } from './service'
import { requireRoleAndModule, requireRole } from '../../../lib/guards'

export async function stockRoutes(app: FastifyInstance): Promise<void> {
  // ─── HU-022: Consulta de stock ───────────────────────────────────────────────

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
   * Sin restricción de módulo — ARI también lo usa antes de cotizar.
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

  // ─── HU-023: Movimientos de inventario ───────────────────────────────────────

  /**
   * POST /v1/kira/stock/movements
   * Registra una entrada, salida o ajuste de stock.
   *
   * OPERATIVE.KIRA → solo puede operar en su propia sucursal
   * AREA_MANAGER.KIRA → puede operar en cualquier sucursal del tenant
   */
  app.post(
    '/movements',
    { preHandler: requireRoleAndModule('OPERATIVE', 'KIRA') },
    async (request, reply) => {
      const parsed = CreateMovementSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
          code: 'VALIDATION_ERROR',
        })
      }

      // OPERATIVE solo puede registrar movimientos en su propia sucursal
      if (
        request.user.role === 'OPERATIVE' &&
        parsed.data.branchId !== request.user.branchId
      ) {
        return reply.code(403).send({
          error: 'Solo puedes registrar movimientos en tu propia sucursal',
          code: 'FORBIDDEN',
        })
      }

      try {
        const movement = await createMovement(
          request.user.tenantId,
          request.user.userId,
          parsed.data,
        )
        return reply.code(201).send(movement)
      } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string; code?: string }
        return reply
          .code(e.statusCode ?? 500)
          .send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
      }
    },
  )

  /**
   * GET /v1/kira/stock/movements
   * Historial de movimientos con filtros y paginación.
   * Query: ?productId=xxx&branchId=xxx&type=salida&from=2024-01-01&to=2024-12-31&page=1&limit=50
   *
   * OPERATIVE.KIRA → historial filtrado a su propia sucursal
   * AREA_MANAGER.KIRA+ → puede ver movimientos de todas las sucursales
   */
  app.get(
    '/movements',
    { preHandler: requireRoleAndModule('OPERATIVE', 'KIRA') },
    async (request, reply) => {
      const parsed = MovementQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
          code: 'VALIDATION_ERROR',
        })
      }

      // OPERATIVE solo puede ver movimientos de su sucursal
      const query =
        request.user.role === 'OPERATIVE'
          ? { ...parsed.data, branchId: request.user.branchId ?? parsed.data.branchId }
          : parsed.data

      const result = await listMovements(request.user.tenantId, query)
      return reply.code(200).send(result)
    },
  )
}
