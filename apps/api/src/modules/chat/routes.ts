/**
 * Rutas del chat interno del dashboard — HU-057A
 *
 * POST   /v1/chat/message         — Envía un mensaje y obtiene respuesta del agente
 * GET    /v1/chat/history         — Historial del usuario autenticado (paginado)
 * GET    /v1/chat/history/:userId — Historial de otro usuario (solo TENANT_ADMIN)
 */

import type { FastifyInstance } from 'fastify'
import { requireRole } from '../../lib/guards'
import { runAgent } from '../agents/agent.runner'
import {
  resolveModuleForChat,
  saveChatMessage,
  getChatHistory,
  getChatHistoryForUser,
} from './service'
import { listRes, objRes, stdErrors, bearerAuth } from '../../lib/openapi'

/** Tiempo máximo de espera para el AgentRunner en el canal internal (ms). */
const CHAT_TIMEOUT_MS = 28_000

/** Mensaje que se devuelve cuando el agente no responde a tiempo. */
const TIMEOUT_REPLY =
  'El agente está procesando tu solicitud. Por favor, espera un momento y recarga el historial para ver la respuesta.'

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /v1/chat/message
   */
  app.post('/message', {
    schema: {
      tags:        ['Chat'],
      summary:     'Enviar mensaje al agente IA',
      description: 'Resuelve el módulo del usuario, ejecuta el agente y guarda la conversación. Responde en < 30 s.',
      security:    bearerAuth,
      body: {
        type: 'object',
        required: ['message'],
        properties: { message: { type: 'string', minLength: 1 } },
      },
      response: { 200: objRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const { userId, tenantId, role, module: userModule } = request.user
    const body = request.body as { message?: unknown }

    if (typeof body.message !== 'string' || body.message.trim() === '') {
      return reply.code(400).send({ error: 'El campo message es requerido', code: 'BAD_REQUEST' })
    }

    const message = body.message.trim()

    const resolution = await resolveModuleForChat(role, userModule, tenantId, message)

    await saveChatMessage({ tenantId, userId, role: 'user', content: message, module: resolution.module })

    if (!resolution.hasAccess) {
      const noAccessReply = `No tienes acceso al módulo ${resolution.module}. Solo puedes consultar información de tu módulo asignado.`
      await saveChatMessage({ tenantId, userId, role: 'assistant', content: noAccessReply })
      return reply.code(200).send({ reply: noAccessReply, module: resolution.module })
    }

    let agentReply = TIMEOUT_REPLY

    const agentPromise = runAgent({
      tenantId,
      module:        resolution.module,
      channel:       'internal',
      message,
      senderId:      userId,
      integrationId: userId,
      userId,
      userRole:      role,
    })

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), CHAT_TIMEOUT_MS),
    )

    const result = await Promise.race([agentPromise, timeoutPromise])

    if (result !== null) {
      agentReply = result.reply
    }

    await saveChatMessage({ tenantId, userId, role: 'assistant', content: agentReply })

    return reply.code(200).send({
      reply:  agentReply,
      module: resolution.module,
    })
  })

  /**
   * GET /v1/chat/history
   */
  app.get('/history', {
    schema: {
      tags:        ['Chat'],
      summary:     'Historial de chat del usuario',
      description: 'Devuelve el historial del usuario autenticado paginado.',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: {
          page:  { type: 'string' },
          limit: { type: 'string' },
          sort:  { type: 'string', enum: ['asc', 'desc'] },
        },
      },
      response: { 200: listRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const { userId, tenantId } = request.user
    const q = request.query as { page?: string; limit?: string; sort?: string }
    const sort = q.sort === 'desc' ? 'desc' : 'asc'

    const result = await getChatHistory(
      userId,
      tenantId,
      q.page  ? Number(q.page)  : 1,
      q.limit ? Number(q.limit) : 20,
      sort,
    )

    return reply.code(200).send(result)
  })

  /**
   * GET /v1/chat/history/:userId
   */
  app.get('/history/:userId', {
    schema: {
      tags:        ['Chat'],
      summary:     'Historial de chat de un usuario',
      description: 'Devuelve el historial de cualquier usuario del tenant. Solo TENANT_ADMIN.',
      security:    bearerAuth,
      params: {
        type: 'object',
        properties: { userId: { type: 'string', format: 'uuid' } },
        required: ['userId'],
      },
      querystring: {
        type: 'object',
        properties: {
          page:  { type: 'string' },
          limit: { type: 'string' },
          sort:  { type: 'string', enum: ['asc', 'desc'] },
        },
      },
      response: { 200: listRes, ...stdErrors },
    },
    preHandler: [requireRole('TENANT_ADMIN')],
  }, async (request, reply) => {
    const { tenantId } = request.user
    const { userId: targetUserId } = request.params as { userId: string }
    const q = request.query as { page?: string; limit?: string; sort?: string }
    const sort = q.sort === 'desc' ? 'desc' : 'asc'

    const result = await getChatHistoryForUser(
      targetUserId,
      tenantId,
      q.page  ? Number(q.page)  : 1,
      q.limit ? Number(q.limit) : 20,
      sort,
    )

    if (!result) {
      return reply.code(404).send({ error: 'Usuario no encontrado en este tenant', code: 'NOT_FOUND' })
    }

    return reply.code(200).send(result)
  })
}
