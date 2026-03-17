import type { FastifyInstance } from 'fastify'
import { branchesRoutes } from './routes'

export default async function branchesModule(app: FastifyInstance): Promise<void> {
  await app.register(branchesRoutes)
}
