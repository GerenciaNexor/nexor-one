import type { FastifyInstance } from 'fastify'
import { requireRoleAndModule, requireTenantAdmin } from '../../../lib/guards'
import { CreateServiceTypeSchema, UpdateServiceTypeSchema, ServiceTypeQuerySchema } from './schema'
import {
  listServiceTypes,
  getServiceType,
  createServiceType,
  updateServiceType,
  deleteServiceType,
} from './service'

export async function serviceTypesRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/agenda/services
   * Lista servicios activos del tenant.
   * OPERATIVE+AGENDA puede ver — TENANT_ADMIN ve todos incluyendo inactivos.
   * Query: ?branchId=xxx &active=true|false
   */
  app.get('/', { preHandler: requireRoleAndModule('OPERATIVE', 'AGENDA') }, async (request, reply) => {
    const parsed = ServiceTypeQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message, code: 'VALIDATION_ERROR' })
    }
    const result = await listServiceTypes(request.user.tenantId, parsed.data)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/agenda/services/:id
   * Detalle de un servicio con sus profesionales.
   */
  app.get('/:id', { preHandler: requireRoleAndModule('OPERATIVE', 'AGENDA') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const s = await getServiceType(request.user.tenantId, id)
      return reply.code(200).send(s)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message, code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * POST /v1/agenda/services
   * Crea un servicio. Solo TENANT_ADMIN.
   */
  app.post('/', { preHandler: [requireTenantAdmin()] }, async (request, reply) => {
    const parsed = CreateServiceTypeSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message, code: 'VALIDATION_ERROR' })
    }
    try {
      const s = await createServiceType(request.user.tenantId, parsed.data)
      return reply.code(201).send(s)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message, code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/agenda/services/:id
   * Edita un servicio (nombre, duración, precio, profesionales, estado).
   * Solo TENANT_ADMIN.
   */
  app.put('/:id', { preHandler: [requireTenantAdmin()] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateServiceTypeSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message, code: 'VALIDATION_ERROR' })
    }
    try {
      const s = await updateServiceType(request.user.tenantId, id, parsed.data)
      return reply.code(200).send(s)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message, code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * DELETE /v1/agenda/services/:id
   * Si tiene citas → desactiva (soft). Si no → elimina definitivamente.
   * Solo TENANT_ADMIN.
   */
  app.delete('/:id', { preHandler: [requireTenantAdmin()] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const result = await deleteServiceType(request.user.tenantId, id)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message, code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
