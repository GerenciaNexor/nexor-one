import type { FastifyInstance } from 'fastify'
import {
  CreateClientSchema,
  UpdateClientSchema,
  ClientQuerySchema,
  CreateInteractionSchema,
} from './schema'
import {
  listClients,
  getClient,
  createClient,
  updateClient,
  deactivateClient,
  listInteractions,
  createInteraction,
} from './service'
import { requireRoleAndModule } from '../../../lib/guards'
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function clientsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/ari/clients
   */
  app.get('/', {
    schema: {
      tags:        ['ARI'],
      summary:     'Listar clientes',
      description: 'Lista clientes del tenant. OPERATIVE ve solo sus asignados; AREA_MANAGER+ ve todos.',
      security:    bearerAuth,
      querystring: z2j(ClientQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
    const parsed = ClientQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    const result = await listClients(
      request.user.tenantId,
      request.user.userId,
      request.user.role,
      parsed.data,
    )
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/ari/clients/:id
   */
  app.get('/:id', {
    schema: {
      tags:        ['ARI'],
      summary:     'Detalle de cliente',
      description: 'Detalle completo del cliente incluyendo deals activos e historial.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const client = await getClient(request.user.tenantId, id)
      return reply.code(200).send(client)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * POST /v1/ari/clients
   */
  app.post('/', {
    schema: {
      tags:        ['ARI'],
      summary:     'Crear cliente',
      description: 'Crea un nuevo cliente o lead. El creador queda como vendedor asignado por defecto.',
      security:    bearerAuth,
      body:        z2j(CreateClientSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
    const parsed = CreateClientSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const client = await createClient(request.user.tenantId, request.user.userId, parsed.data)
      return reply.code(201).send(client)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/ari/clients/:id
   */
  app.put('/:id', {
    schema: {
      tags:        ['ARI'],
      summary:     'Editar cliente',
      description: 'Actualiza datos del cliente. OPERATIVE puede editar sus propios asignados.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(UpdateClientSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateClientSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const client = await updateClient(request.user.tenantId, id, parsed.data)
      return reply.code(200).send(client)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * DELETE /v1/ari/clients/:id
   */
  app.delete('/:id', {
    schema: {
      tags:        ['ARI'],
      summary:     'Desactivar cliente',
      description: 'Soft delete — desactiva el cliente conservando deals, cotizaciones e historial. Requiere AREA_MANAGER.ARI.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'ARI'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const client = await deactivateClient(request.user.tenantId, id)
      return reply.code(200).send(client)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  // ─── Interacciones ────────────────────────────────────────────────────────

  /**
   * GET /v1/ari/clients/:id/interactions
   */
  app.get('/:id/interactions', {
    schema: {
      tags:        ['ARI'],
      summary:     'Historial de interacciones',
      description: 'Lista todas las interacciones registradas con el cliente.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const result = await listInteractions(request.user.tenantId, id)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * POST /v1/ari/clients/:id/interactions
   */
  app.post('/:id/interactions', {
    schema: {
      tags:        ['ARI'],
      summary:     'Registrar interacción',
      description: 'Registra una nueva interacción (llamada, email, reunión, etc.) con el cliente.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(CreateInteractionSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = CreateInteractionSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const interaction = await createInteraction(
        request.user.tenantId,
        id,
        request.user.userId,
        parsed.data,
      )
      return reply.code(201).send(interaction)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
