import type { FastifyInstance } from 'fastify'
import { inboxRoutes } from './routes'

export default async function inboxModule(app: FastifyInstance): Promise<void> {
  app.register(inboxRoutes)
}
