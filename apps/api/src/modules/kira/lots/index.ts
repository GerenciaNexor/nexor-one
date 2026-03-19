import type { FastifyInstance } from 'fastify'
import { lotsRoutes } from './routes'

export default async function lotsModule(app: FastifyInstance): Promise<void> {
  await app.register(lotsRoutes)
}
