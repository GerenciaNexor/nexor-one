import type { FastifyInstance } from 'fastify'
import { rentalsRoutes } from './routes'

export default async function rentalsModule(app: FastifyInstance): Promise<void> {
  await rentalsRoutes(app)
}
