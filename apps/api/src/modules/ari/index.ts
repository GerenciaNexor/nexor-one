import type { FastifyInstance } from 'fastify'
import { requireFeatureFlag } from '../../lib/guards'
import { pipelineRoutes } from './pipeline/routes'
import { clientsRoutes } from './clients/routes'
import { quotesRoutes } from './quotes/routes'
import { reportsRoutes } from './reports/routes'

export default async function ariModule(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireFeatureFlag('ARI'))
  app.register(clientsRoutes, { prefix: '/clients' })
  app.register(pipelineRoutes)
  app.register(quotesRoutes,  { prefix: '/quotes' })
  app.register(reportsRoutes, { prefix: '/reports' })
}
