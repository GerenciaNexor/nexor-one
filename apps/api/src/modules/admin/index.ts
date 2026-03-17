import type { FastifyInstance } from 'fastify'
import { adminRoutes } from './routes'

export default async function adminModule(app: FastifyInstance): Promise<void> {
  await app.register(adminRoutes)
}
