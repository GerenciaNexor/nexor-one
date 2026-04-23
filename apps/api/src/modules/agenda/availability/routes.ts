import type { FastifyInstance } from 'fastify'
import { requireRoleAndModule, requireTenantAdmin } from '../../../lib/guards'
import { CreateAvailabilitySchema, UpdateAvailabilitySchema, AvailabilityQuerySchema } from './schema'
import { listAvailability, createAvailability, updateAvailability, deleteAvailability } from './service'
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function availabilityRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/agenda/availability
   */
  app.get('/', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Listar bloques de disponibilidad',
      description: 'Lista bloques de disponibilidad del tenant filtrados por sucursal o profesional.',
      security:    bearerAuth,
      querystring: z2j(AvailabilityQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'AGENDA'),
  }, async (request, reply) => {
    const parsed = AvailabilityQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message, code: 'VALIDATION_ERROR' })
    }
    const result = await listAvailability(request.user.tenantId, parsed.data)
    return reply.code(200).send(result)
  })

  /**
   * POST /v1/agenda/availability
   */
  app.post('/', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Crear bloque de disponibilidad',
      description: 'Crea un bloque horario para una sucursal o profesional. Múltiples bloques por día son válidos. Solo TENANT_ADMIN.',
      security:    bearerAuth,
      body:        z2j(CreateAvailabilitySchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
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
   */
  app.put('/:id', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Editar bloque de disponibilidad',
      description: 'Edita hora de inicio/fin o activa/desactiva un bloque de disponibilidad. Solo TENANT_ADMIN.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(UpdateAvailabilitySchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
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
   */
  app.delete('/:id', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Eliminar bloque de disponibilidad',
      description: 'Elimina un bloque de disponibilidad. Solo TENANT_ADMIN.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
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
