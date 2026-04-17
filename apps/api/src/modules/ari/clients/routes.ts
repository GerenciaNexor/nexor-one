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

export async function clientsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/ari/clients
   * Lista clientes del tenant con búsqueda y filtros.
   * OPERATIVE ve solo sus asignados. AREA_MANAGER+ ve todos.
   * Query: ?search=xxx &source=whatsapp &assignedTo=me|userId
   */
  app.get('/', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
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
   * Detalle completo del cliente.
   */
  app.get('/:id', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
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
   * Crea un nuevo cliente o lead.
   * El creador queda como vendedor asignado si no se especifica otro.
   */
  app.post('/', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
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
   * Actualiza datos del cliente.
   */
  app.put('/:id', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
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
   * Soft-delete: desactiva el cliente (isActive = false).
   * Historial, deals y cotizaciones se conservan.
   * Requiere AREA_MANAGER.ARI o superior.
   */
  app.delete('/:id', { preHandler: requireRoleAndModule('AREA_MANAGER', 'ARI') }, async (request, reply) => {
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
   * Historial de interacciones del cliente.
   */
  app.get('/:id/interactions', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
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
   * Registra una nueva interacción con el cliente.
   */
  app.post('/:id/interactions', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
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
