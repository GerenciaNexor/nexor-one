import type { FastifyInstance } from 'fastify'
import { ocrRoutes } from './routes'

export default async function ocrModule(app: FastifyInstance): Promise<void> {
  app.register(ocrRoutes)
}
