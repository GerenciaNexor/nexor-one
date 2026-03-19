import type { FastifyInstance } from 'fastify'
import { stockRoutes } from './routes'

export default async function stockModule(app: FastifyInstance): Promise<void> {
  await app.register(stockRoutes)
}
