import type { FastifyInstance } from 'fastify'
import { requireRoleAndModule, requireTenantAdmin } from '../../../lib/guards'
import { CreateBlockedDateSchema, BlockedDateQuerySchema } from './schema'
import { listBlockedDates, createBlockedDate, deleteBlockedDate } from './service'

export async function blockedDatesRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/agenda/blocked-dates
   * Lista fechas bloqueadas (festivos/cierres).
   * Query: ?branchId=xxx &from=YYYY-MM-DD &to=YYYY-MM-DD
   */
  app.get('/', { preHandler: requireRoleAndModule('OPERATIVE', 'AGENDA') }, async (request, reply) => {
    const parsed = BlockedDateQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message, code: 'VALIDATION_ERROR' })
    }
    const result = await listBlockedDates(request.user.tenantId, parsed.data)
    return reply.code(200).send(result)
  })

  /**
   * POST /v1/agenda/blocked-dates
   * Marca una fecha como bloqueada para una sucursal (o todo el tenant).
   * Solo TENANT_ADMIN.
   */
  app.post('/', { preHandler: [requireTenantAdmin()] }, async (request, reply) => {
    const parsed = CreateBlockedDateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message, code: 'VALIDATION_ERROR' })
    }
    try {
      const row = await createBlockedDate(request.user.tenantId, parsed.data)
      return reply.code(201).send(row)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message, code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * DELETE /v1/agenda/blocked-dates/:id
   * Desbloquea una fecha.
   * Solo TENANT_ADMIN.
   */
  app.delete('/:id', { preHandler: [requireTenantAdmin()] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const result = await deleteBlockedDate(request.user.tenantId, id)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message, code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
