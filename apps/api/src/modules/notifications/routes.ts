import type { FastifyInstance } from 'fastify'
import { getNotifications, getUnreadCount, markRead, markAllRead } from './service'
import { idParam, objRes, stdErrors, bearerAuth } from '../../lib/openapi'

export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  /** GET /v1/notifications */
  app.get('/', {
    schema: {
      tags:        ['Notifications'],
      summary:     'Listar notificaciones',
      description: 'Devuelve notificaciones del usuario autenticado con filtro de leídas/no leídas.',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: {
          isRead: { type: 'string', enum: ['true', 'false'] },
          limit:  { type: 'string' },
        },
      },
      response: { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
  }, async (request, reply) => {
    const query = request.query as { isRead?: string; limit?: string }
    const isRead = query.isRead !== undefined ? query.isRead === 'true' : undefined
    const limit = query.limit ? Number(query.limit) : 20
    const result = await getNotifications(
      request.user.userId,
      request.user.tenantId,
      isRead,
      limit,
    )
    return reply.code(200).send(result)
  })

  /** GET /v1/notifications/unread-count */
  app.get('/unread-count', {
    schema: {
      tags:     ['Notifications'],
      summary:  'Conteo de no leídas',
      security: bearerAuth,
      response: { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
  }, async (request, reply) => {
    const result = await getUnreadCount(request.user.userId, request.user.tenantId)
    return reply.code(200).send(result)
  })

  /** PUT /v1/notifications/:id/read */
  app.put('/:id/read', {
    schema: {
      tags:     ['Notifications'],
      summary:  'Marcar notificación como leída',
      security: bearerAuth,
      params:   idParam,
      response: { 200: objRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const notification = await markRead(request.user.userId, request.user.tenantId, id)
      return reply.code(200).send(notification)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /** PUT /v1/notifications/read-all */
  app.put('/read-all', {
    schema: {
      tags:     ['Notifications'],
      summary:  'Marcar todas como leídas',
      security: bearerAuth,
      response: { 200: { type: 'object', properties: { message: { type: 'string' } } }, ...stdErrors },
    },
  }, async (request, reply) => {
    await markAllRead(request.user.userId, request.user.tenantId)
    return reply.code(200).send({ message: 'Todas las notificaciones marcadas como leidas' })
  })
}
