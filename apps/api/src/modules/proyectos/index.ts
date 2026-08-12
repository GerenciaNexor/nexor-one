import type { FastifyInstance } from 'fastify'
import { requireFeatureFlag } from '../../lib/guards'
import { proyectosRoutes } from './routes'

export default async function proyectosModule(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireFeatureFlag('PROYECTOS'))
  await app.register(proyectosRoutes)
}
