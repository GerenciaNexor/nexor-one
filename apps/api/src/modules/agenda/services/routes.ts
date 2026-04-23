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
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function serviceTypesRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/agenda/services
   */
  app.get('/', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Listar tipos de servicio',
      description: 'Lista servicios activos del tenant. OPERATIVE+AGENDA puede consultar.',
      security:    bearerAuth,
      querystring: z2j(ServiceTypeQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'AGENDA'),
  }, async (request, reply) => {
    const parsed = ServiceTypeQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message, code: 'VALIDATION_ERROR' })
    }
    const result = await listServiceTypes(request.user.tenantId, parsed.data)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/agenda/services/:id
   */
  app.get('/:id', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Detalle de tipo de servicio',
      description: 'Detalle de un servicio con sus profesionales asignados.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'AGENDA'),
  }, async (request, reply) => {
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
   */
  app.post('/', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Crear tipo de servicio',
      description: 'Crea un nuevo tipo de servicio. Solo TENANT_ADMIN.',
      security:    bearerAuth,
      body:        z2j(CreateServiceTypeSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
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
   */
  app.put('/:id', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Editar tipo de servicio',
      description: 'Edita nombre, duración, precio, profesionales o estado de un servicio. Solo TENANT_ADMIN.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(UpdateServiceTypeSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
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
   */
  app.delete('/:id', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Eliminar tipo de servicio',
      description: 'Si tiene citas → desactiva (soft delete). Si no → elimina definitivamente. Solo TENANT_ADMIN.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
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
