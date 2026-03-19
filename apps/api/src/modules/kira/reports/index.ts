import type { FastifyInstance } from 'fastify'
import { reportsRoutes } from './routes'

export default async function reportsModule(app: FastifyInstance): Promise<void> {
  await app.register(reportsRoutes)
}
