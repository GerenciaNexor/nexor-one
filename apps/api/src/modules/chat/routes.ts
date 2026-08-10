/**
 * Rutas del chat interno del dashboard.
 *
 * HU-057A + HU-183 (múltiples chats por usuario):
 *   POST   /v1/chat/message               — Envía un mensaje (a un chat) y obtiene respuesta
 *   GET    /v1/chat/sessions              — Lista los chats del usuario
 *   POST   /v1/chat/sessions              — Crea un chat nuevo
 *   PATCH  /v1/chat/sessions/:id          — Renombra un chat
 *   DELETE /v1/chat/sessions/:id          — Elimina un chat (y sus mensajes)
 *   GET    /v1/chat/sessions/:id/messages — Historial de un chat (paginado)
 *   GET    /v1/chat/history               — (compat) historial del usuario (todos los chats)
 *   GET    /v1/chat/history/:userId       — Historial de otro usuario (solo TENANT_ADMIN, supervisión)
 */

import type { FastifyInstance } from 'fastify'
import { requireRole } from '../../lib/guards'
import { runAgent } from '../agents/agent.runner'
import {
  allowedModulesForUser,
  scopeAreaLabels,
  saveChatMessage,
  getChatHistory,
  getChatHistoryForUser,
  listChatSessions,
  createChatSession,
  getOwnedSession,
  renameChatSession,
  deleteChatSession,
  getSessionMessages,
  getSessionMemory,
  autoTitleFromFirstMessage,
  touchChatSession,
} from './service'
import { listRes, objRes, stdErrors, bearerAuth } from '../../lib/openapi'

/** Tiempo máximo de espera para el AgentRunner en el canal internal (ms). */
const CHAT_TIMEOUT_MS = 28_000

/** Mensaje que se devuelve cuando el agente no responde a tiempo. */
const TIMEOUT_REPLY =
  'El agente está procesando tu solicitud. Por favor, espera un momento y recarga el historial para ver la respuesta.'

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /v1/chat/message — envía un mensaje a un chat (o crea uno nuevo si no se indica).
   */
  app.post('/message', {
    schema: {
      tags:        ['Chat'],
      summary:     'Enviar mensaje al agente IA',
      description: 'Resuelve el módulo, ejecuta el agente con la memoria del chat y guarda la conversación. Responde en < 30 s.',
      security:    bearerAuth,
      body: {
        type: 'object',
        required: ['message'],
        properties: {
          message:       { type: 'string', minLength: 1 },
          chatSessionId: { type: 'string' },
        },
      },
      response: { 200: objRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const { userId, tenantId, role, module: userModule } = request.user
    const body = request.body as { message?: unknown; chatSessionId?: unknown }

    if (typeof body.message !== 'string' || body.message.trim() === '') {
      return reply.code(400).send({ error: 'El campo message es requerido', code: 'BAD_REQUEST' })
    }
    const message = body.message.trim()

    // ── Resolver/crear el chat ────────────────────────────────────────────────
    let sessionId: string
    if (typeof body.chatSessionId === 'string' && body.chatSessionId.trim() !== '') {
      const owned = await getOwnedSession(body.chatSessionId.trim(), tenantId, userId)
      if (!owned) return reply.code(404).send({ error: 'Chat no encontrado', code: 'NOT_FOUND' })
      sessionId = owned.id
    } else {
      const created = await createChatSession(tenantId, userId, message)
      sessionId = created.id
    }

    // HU-187 — agente interno UNIFICADO gobernado por el ROL: el alcance (áreas que puede consultar)
    // se deriva del rol + módulo del usuario. No se enruta a un solo módulo.
    const scope = await allowedModulesForUser(role, userModule, tenantId)
    const areas = scopeAreaLabels(scope)

    // Memoria del chat (mensajes previos) ANTES de guardar el mensaje actual.
    const history = await getSessionMemory(sessionId, tenantId)
    // Si el chat aún tiene el título por defecto, ponerle el primer mensaje.
    await autoTitleFromFirstMessage(sessionId, message)

    await saveChatMessage({ tenantId, userId, chatSessionId: sessionId, role: 'user', content: message, module: 'INTERNO' })

    let agentReply = TIMEOUT_REPLY

    const agentPromise = runAgent({
      tenantId,
      module:        'INTERNO',
      channel:       'internal',
      message,
      senderId:      userId,
      integrationId: userId,
      userId,
      userRole:      role,
      history,
      internalFull:  scope.full,
      internalRead:  scope.read,
      internalAreas: areas,
    })

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), CHAT_TIMEOUT_MS))
    const result = await Promise.race([agentPromise, timeoutPromise])
    if (result !== null) agentReply = result.reply

    await saveChatMessage({ tenantId, userId, chatSessionId: sessionId, role: 'assistant', content: agentReply })
    await touchChatSession(sessionId)

    return reply.code(200).send({ reply: agentReply, module: 'INTERNO', chatSessionId: sessionId })
  })

  // ─── Sesiones / chats (HU-183) ──────────────────────────────────────────────

  /** GET /v1/chat/sessions — lista los chats del usuario. */
  app.get('/sessions', {
    schema: { tags: ['Chat'], summary: 'Listar chats del usuario', security: bearerAuth, response: { 200: listRes, ...stdErrors } },
  }, async (request, reply) => {
    const { userId, tenantId } = request.user
    const data = await listChatSessions(tenantId, userId)
    return reply.code(200).send({ success: true, data })
  })

  /** POST /v1/chat/sessions — crea un chat nuevo (título opcional). */
  app.post('/sessions', {
    schema: {
      tags: ['Chat'], summary: 'Crear un chat', security: bearerAuth,
      body: { type: 'object', properties: { title: { type: 'string' } } },
      response: { 200: objRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const { userId, tenantId } = request.user
    const { title } = (request.body ?? {}) as { title?: string }
    const session = await createChatSession(tenantId, userId, title)
    return reply.code(200).send({ success: true, data: session })
  })

  /** PATCH /v1/chat/sessions/:id — renombra un chat. */
  app.patch('/sessions/:id', {
    schema: {
      tags: ['Chat'], summary: 'Renombrar un chat', security: bearerAuth,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body:   { type: 'object', required: ['title'], properties: { title: { type: 'string', minLength: 1 } } },
      response: { 200: objRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const { userId, tenantId } = request.user
    const { id } = request.params as { id: string }
    const { title } = request.body as { title: string }
    const updated = await renameChatSession(id, tenantId, userId, title)
    if (!updated) return reply.code(404).send({ error: 'Chat no encontrado', code: 'NOT_FOUND' })
    return reply.code(200).send({ success: true, data: updated })
  })

  /** DELETE /v1/chat/sessions/:id — elimina un chat y sus mensajes. */
  app.delete('/sessions/:id', {
    schema: {
      tags: ['Chat'], summary: 'Eliminar un chat', security: bearerAuth,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: objRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const { userId, tenantId } = request.user
    const { id } = request.params as { id: string }
    const ok = await deleteChatSession(id, tenantId, userId)
    if (!ok) return reply.code(404).send({ error: 'Chat no encontrado', code: 'NOT_FOUND' })
    return reply.code(200).send({ success: true, data: { removed: true } })
  })

  /** GET /v1/chat/sessions/:id/messages — historial de un chat (paginado). */
  app.get('/sessions/:id/messages', {
    schema: {
      tags: ['Chat'], summary: 'Historial de un chat', security: bearerAuth,
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      querystring: { type: 'object', properties: { page: { type: 'string' }, limit: { type: 'string' }, sort: { type: 'string', enum: ['asc', 'desc'] } } },
      response: { 200: listRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const { userId, tenantId } = request.user
    const { id } = request.params as { id: string }
    const q = request.query as { page?: string; limit?: string; sort?: string }
    const sort = q.sort === 'desc' ? 'desc' : 'asc'
    const result = await getSessionMessages(id, tenantId, userId, q.page ? Number(q.page) : 1, q.limit ? Number(q.limit) : 50, sort)
    if (!result) return reply.code(404).send({ error: 'Chat no encontrado', code: 'NOT_FOUND' })
    return reply.code(200).send(result)
  })

  // ─── Historial (compat / supervisión) ───────────────────────────────────────

  /** GET /v1/chat/history — historial del usuario (todos sus chats). Compatibilidad. */
  app.get('/history', {
    schema: {
      tags: ['Chat'], summary: 'Historial de chat del usuario', security: bearerAuth,
      querystring: { type: 'object', properties: { page: { type: 'string' }, limit: { type: 'string' }, sort: { type: 'string', enum: ['asc', 'desc'] } } },
      response: { 200: listRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const { userId, tenantId } = request.user
    const q = request.query as { page?: string; limit?: string; sort?: string }
    const sort = q.sort === 'desc' ? 'desc' : 'asc'
    const result = await getChatHistory(userId, tenantId, q.page ? Number(q.page) : 1, q.limit ? Number(q.limit) : 20, sort)
    return reply.code(200).send(result)
  })

  /** GET /v1/chat/history/:userId — historial de otro usuario (solo TENANT_ADMIN, supervisión). */
  app.get('/history/:userId', {
    schema: {
      tags: ['Chat'], summary: 'Historial de chat de un usuario', security: bearerAuth,
      params: { type: 'object', properties: { userId: { type: 'string', format: 'uuid' } }, required: ['userId'] },
      querystring: { type: 'object', properties: { page: { type: 'string' }, limit: { type: 'string' }, sort: { type: 'string', enum: ['asc', 'desc'] } } },
      response: { 200: listRes, ...stdErrors },
    },
    preHandler: [requireRole('TENANT_ADMIN')],
  }, async (request, reply) => {
    const { tenantId } = request.user
    const { userId: targetUserId } = request.params as { userId: string }
    const q = request.query as { page?: string; limit?: string; sort?: string }
    const sort = q.sort === 'desc' ? 'desc' : 'asc'
    const result = await getChatHistoryForUser(targetUserId, tenantId, q.page ? Number(q.page) : 1, q.limit ? Number(q.limit) : 20, sort)
    if (!result) return reply.code(404).send({ error: 'Usuario no encontrado en este tenant', code: 'NOT_FOUND' })
    return reply.code(200).send(result)
  })
}
