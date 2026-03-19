import type { FastifyInstance } from 'fastify'
import { alertsRoutes } from './routes'

export default async function alertsModule(app: FastifyInstance): Promise<void> {
  await app.register(alertsRoutes)
}
