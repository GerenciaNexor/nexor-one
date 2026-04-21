import type { FastifyInstance, FastifyReply } from 'fastify'
import { requireRoleAndModule } from '../../../lib/guards'
import { UpsertBudgetSchema, UpdateBudgetSchema } from './schema'
import { listBudgets, getBudgetStatus, upsertBudget, updateBudget, deleteBudget } from './service'
import { z2j, idParam, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

function errReply(reply: FastifyReply, err: unknown) {
  const e = err as { statusCode?: number; message?: string; code?: string }
  return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
}

export async function budgetsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/vera/budgets
   */
  app.get('/', {
    schema: {
      tags:        ['VERA'],
      summary:     'Listar presupuestos',
      description: 'Lista todos los presupuestos del tenant. Requiere AREA_MANAGER.VERA.',
      security:    bearerAuth,
      response:    { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
    const data = await listBudgets(request.user.tenantId)
    return reply.code(200).send({ data })
  })

  /**
   * GET /v1/vera/budgets/current
   */
  app.get('/current', {
    schema: {
      tags:        ['VERA'],
      summary:     'Presupuesto del mes actual',
      description: 'Devuelve el presupuesto del mes en curso con porcentaje consumido. Usado por el dashboard de VERA.',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: { branchId: { type: 'string', format: 'uuid', description: 'Filtrar por sucursal' } },
      },
      response:    { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
    const { branchId } = request.query as { branchId?: string }
    const now          = new Date()
    const status = await getBudgetStatus(request.user.tenantId, now.getFullYear(), now.getMonth() + 1, branchId)
    return reply.code(200).send(status ?? { budget: null, spent: 0, percentage: 0 })
  })

  /**
   * POST /v1/vera/budgets
   */
  app.post('/', {
    schema: {
      tags:        ['VERA'],
      summary:     'Crear o actualizar presupuesto',
      description: 'Upsert del presupuesto para un mes/año y sucursal específicos. Requiere AREA_MANAGER.VERA.',
      security:    bearerAuth,
      body:        z2j(UpsertBudgetSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
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
   */
  app.put('/:id', {
    schema: {
      tags:        ['VERA'],
      summary:     'Editar presupuesto',
      description: 'Edita el monto o moneda de un presupuesto existente. Requiere AREA_MANAGER.VERA.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(UpdateBudgetSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
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
   */
  app.delete('/:id', {
    schema: {
      tags:        ['VERA'],
      summary:     'Eliminar presupuesto',
      description: 'Elimina un presupuesto. Los egresos asociados no se ven afectados. Requiere AREA_MANAGER.VERA.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 204: { type: 'null' }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await deleteBudget(request.user.tenantId, id)
      return reply.code(204).send()
    } catch (err) { return errReply(reply, err) }
  })
}
