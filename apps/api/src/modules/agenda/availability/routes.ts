import type { FastifyInstance } from 'fastify'
import { requireRoleAndModule, requireTenantAdmin } from '../../../lib/guards'
import { CreateAvailabilitySchema, UpdateAvailabilitySchema, AvailabilityQuerySchema } from './schema'
import { listAvailability, createAvailability, updateAvailability, deleteAvailability } from './service'

export async function availabilityRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/agenda/availability
   * Lista bloques de disponibilidad del tenant.
   * Query: ?branchId=xxx &userId=xxx
   */
  app.get('/', { preHandler: requireRoleAndModule('OPERATIVE', 'AGENDA') }, async (request, reply) => {
    const parsed = AvailabilityQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message, code: 'VALIDATION_ERROR' })
    }
    const result = await listAvailability(request.user.tenantId, parsed.data)
    return reply.code(200).send(result)
  })

  /**
   * POST /v1/agenda/availability
   * Crea un bloque de disponibilidad para una sucursal/profesional.
   * Múltiples bloques por día son válidos — permiten franjas mañana/tarde.
   * Solo TENANT_ADMIN.
   */
  app.post('/', { preHandler: [requireTenantAdmin()] }, async (request, reply) => {
    const parsed = CreateAvailabilitySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message, code: 'VALIDATION_ERROR' })
    }
    try {
      const row = await createAvailability(request.user.tenantId, parsed.data)
      return reply.code(201).send(row)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message, code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/agenda/availability/:id
   * Edita hora de inicio/fin o activa/desactiva un bloque.
   * Solo TENANT_ADMIN.
   */
  app.put('/:id', { preHandler: [requireTenantAdmin()] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateAvailabilitySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message, code: 'VALIDATION_ERROR' })
    }
    try {
      const row = await updateAvailability(request.user.tenantId, id, parsed.data)
      return reply.code(200).send(row)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message, code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * DELETE /v1/agenda/availability/:id
   * Elimina un bloque de disponibilidad.
   * Solo TENANT_ADMIN.
   */
  app.delete('/:id', { preHandler: [requireTenantAdmin()] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const result = await deleteAvailability(request.user.tenantId, id)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message, code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
