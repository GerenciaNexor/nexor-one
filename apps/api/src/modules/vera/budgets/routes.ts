import type { FastifyInstance, FastifyReply } from 'fastify'
import { requireRoleAndModule } from '../../../lib/guards'
import { UpsertBudgetSchema, UpdateBudgetSchema } from './schema'
import { listBudgets, getBudgetStatus, upsertBudget, updateBudget, deleteBudget } from './service'

function errReply(reply: FastifyReply, err: unknown) {
  const e = err as { statusCode?: number; message?: string; code?: string }
  return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
}

export async function budgetsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/vera/budgets
   * Lista todos los presupuestos del tenant.
   */
  app.get('/', { preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA') }, async (request, reply) => {
    const data = await listBudgets(request.user.tenantId)
    return reply.code(200).send({ data })
  })

  /**
   * GET /v1/vera/budgets/current?branchId=
   * Presupuesto del mes actual con porcentaje consumido.
   * Usado por el dashboard de VERA para la barra de progreso.
   */
  app.get('/current', { preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA') }, async (request, reply) => {
    const { branchId } = request.query as { branchId?: string }
    const now          = new Date()
    const status = await getBudgetStatus(request.user.tenantId, now.getFullYear(), now.getMonth() + 1, branchId)
    return reply.code(200).send(status ?? { budget: null, spent: 0, percentage: 0 })
  })

  /**
   * POST /v1/vera/budgets
   * Crea o actualiza (upsert) el presupuesto para un mes/sucursal específico.
   */
  app.post('/', { preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA') }, async (request, reply) => {
    const parsed = UpsertBudgetSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    }
    try {
      const budget = await upsertBudget(request.user.tenantId, parsed.data)
      return reply.code(200).send(budget)
    } catch (err) { return errReply(reply, err) }
  })

  /**
   * PUT /v1/vera/budgets/:id
   * Edita el monto o moneda de un presupuesto existente.
   */
  app.put('/:id', { preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateBudgetSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    }
    try {
      const budget = await updateBudget(request.user.tenantId, id, parsed.data)
      return reply.code(200).send(budget)
    } catch (err) { return errReply(reply, err) }
  })

  /**
   * DELETE /v1/vera/budgets/:id
   * Elimina un presupuesto. Los egresos no se ven afectados.
   */
  app.delete('/:id', { preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await deleteBudget(request.user.tenantId, id)
      return reply.code(204).send()
    } catch (err) { return errReply(reply, err) }
  })
}
