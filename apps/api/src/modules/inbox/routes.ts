import type { FastifyInstance } from 'fastify'
import {
  InboxQuerySchema,
  ReplySchema,
  UpdateStatusSchema,
  AssignSchema,
} from './schema'
import {
  listConversations,
  getConversation,
  getUnreadCount,
  replyToConversation,
  updateConversationStatus,
  assignConversation,
  listInboxUsers,
} from './service'
import { requireRole } from '../../lib/guards'
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../lib/openapi'

export async function inboxRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/inbox/unread-count
   * Badge del sidebar — conversaciones abiertas sin atender.
   * Registrar ANTES de /:id para que Fastify no interprete "unread-count" como param.
   */
  app.get('/unread-count', {
    schema: {
      tags:     ['Inbox'],
      summary:  'Conteo de conversaciones abiertas',
      security: bearerAuth,
      response: { 200: objRes, ...stdErrors },
    },
    preHandler: [requireRole('AREA_MANAGER')],
  }, async (request, reply) => {
    const result = await getUnreadCount(
      request.user.tenantId,
      request.user.role,
      request.user.module,
    )
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/inbox/users
   * Usuarios activos del tenant para el selector de reasignación.
   * Registrar antes de /:id para evitar colisión de parámetros.
   */
  app.get('/users', {
    schema: {
      tags:     ['Inbox'],
      summary:  'Usuarios disponibles para reasignación',
      security: bearerAuth,
      response: { 200: listRes, ...stdErrors },
    },
    preHandler: [requireRole('AREA_MANAGER')],
  }, async (request, reply) => {
    const result = await listInboxUsers(request.user.tenantId)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/inbox
   * Lista paginada de conversaciones filtradas por módulo, estado y canal.
   */
  app.get('/', {
    schema: {
      tags:        ['Inbox'],
      summary:     'Bandeja de entrada',
      description: 'AREA_MANAGER.ARI ve solo ARI; AREA_MANAGER.NIRA ve solo NIRA; TENANT_ADMIN ve todo.',
      security:    bearerAuth,
      querystring: z2j(InboxQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: [requireRole('AREA_MANAGER')],
  }, async (request, reply) => {
    const parsed = InboxQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    const result = await listConversations(
      request.user.tenantId,
      request.user.role,
      request.user.module,
      parsed.data,
    )
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/inbox/:id
   * Detalle de una conversación con historial completo de mensajes.
   */
  app.get('/:id', {
    schema: {
      tags:     ['Inbox'],
      summary:  'Detalle de conversación',
      security: bearerAuth,
      params:   idParam,
      response: { 200: objRes, ...stdErrors },
    },
    preHandler: [requireRole('AREA_MANAGER')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const conversation = await getConversation(
        request.user.tenantId,
        request.user.role,
        request.user.module,
        id,
      )
      return reply.code(200).send(conversation)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * POST /v1/inbox/:id/reply
   * Envía una respuesta manual por el canal de la conversación (WhatsApp o Gmail)
   * y guarda el mensaje en conversation_messages con isFromAgent: false.
   */
  app.post('/:id/reply', {
    schema: {
      tags:     ['Inbox'],
      summary:  'Responder conversación',
      security: bearerAuth,
      params:   idParam,
      body:     z2j(ReplySchema),
      response: { 201: objRes, ...stdErrors },
    },
    preHandler: [requireRole('AREA_MANAGER')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = ReplySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const message = await replyToConversation(
        request.user.tenantId,
        request.user.userId,
        id,
        parsed.data,
      )
      return reply.code(201).send(message)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/inbox/:id/status
   * Cambia el estado de una conversación: open | replied | resolved.
   */
  app.put('/:id/status', {
    schema: {
      tags:     ['Inbox'],
      summary:  'Actualizar estado de conversación',
      security: bearerAuth,
      params:   idParam,
      body:     z2j(UpdateStatusSchema),
      response: { 200: objRes, ...stdErrors },
    },
    preHandler: [requireRole('AREA_MANAGER')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateStatusSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const updated = await updateConversationStatus(request.user.tenantId, id, parsed.data)
      return reply.code(200).send(updated)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/inbox/:id/assign
   * Reasigna la conversación a otro usuario y envía notificación in-app.
   */
  app.put('/:id/assign', {
    schema: {
      tags:     ['Inbox'],
      summary:  'Reasignar conversación',
      security: bearerAuth,
      params:   idParam,
      body:     z2j(AssignSchema),
      response: { 200: objRes, ...stdErrors },
    },
    preHandler: [requireRole('AREA_MANAGER')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = AssignSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      // Obtener nombre del usuario que reasigna para incluirlo en la notificación
      const assignedByName = (request.user as { name?: string }).name ?? 'Un compañero'
      const updated = await assignConversation(
        request.user.tenantId,
        id,
        assignedByName,
        parsed.data,
      )
      return reply.code(200).send(updated)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
