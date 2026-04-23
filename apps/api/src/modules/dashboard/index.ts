import type { FastifyInstance } from 'fastify'
import { dashboardRoutes } from './routes'

export default async function dashboardModule(app: FastifyInstance): Promise<void> {
  app.register(dashboardRoutes)
}
