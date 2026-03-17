import type { FastifyInstance } from 'fastify'
import { getNotifications, getUnreadCount, markRead, markAllRead } from './service'

export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  /** GET /v1/notifications?isRead=false&limit=20 */
  app.get('/', async (request, reply) => {
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
  app.get('/unread-count', async (request, reply) => {
    const result = await getUnreadCount(request.user.userId, request.user.tenantId)
    return reply.code(200).send(result)
  })

  /** PUT /v1/notifications/:id/read */
  app.put('/:id/read', async (request, reply) => {
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
  app.put('/read-all', async (request, reply) => {
    await markAllRead(request.user.userId, request.user.tenantId)
    return reply.code(200).send({ message: 'Todas las notificaciones marcadas como leidas' })
  })
}
