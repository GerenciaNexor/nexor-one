import type { FastifyInstance } from 'fastify'
import { requireRoleAndModule, requireTenantAdmin } from '../../../lib/guards'
import { CreateBlockedDateSchema, BlockedDateQuerySchema } from './schema'
import { listBlockedDates, createBlockedDate, deleteBlockedDate } from './service'
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function blockedDatesRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/agenda/blocked-dates
   */
  app.get('/', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Listar fechas bloqueadas',
      description: 'Lista festivos y cierres. Query: branchId, from, to.',
      security:    bearerAuth,
      querystring: z2j(BlockedDateQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'AGENDA'),
  }, async (request, reply) => {
    const parsed = BlockedDateQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message, code: 'VALIDATION_ERROR' })
    }
    const result = await listBlockedDates(request.user.tenantId, parsed.data)
    return reply.code(200).send(result)
  })

  /**
   * POST /v1/agenda/blocked-dates
   */
  app.post('/', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Bloquear fecha',
      description: 'Marca una fecha como bloqueada para una sucursal o todo el tenant (festivo/cierre). Solo TENANT_ADMIN.',
      security:    bearerAuth,
      body:        z2j(CreateBlockedDateSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
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
   */
  app.delete('/:id', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Desbloquear fecha',
      description: 'Elimina un bloqueo de fecha. Solo TENANT_ADMIN.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
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
