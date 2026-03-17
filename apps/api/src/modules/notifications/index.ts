import type { FastifyInstance } from 'fastify'
import { notificationsRoutes } from './routes'

export default async function notificationsModule(app: FastifyInstance): Promise<void> {
  await app.register(notificationsRoutes)
}
