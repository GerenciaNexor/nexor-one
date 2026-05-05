import type { FastifyInstance } from 'fastify'
import { bulkUploadRoutes } from './routes'

export default async function bulkUploadModule(app: FastifyInstance): Promise<void> {
  app.register(bulkUploadRoutes)
}
