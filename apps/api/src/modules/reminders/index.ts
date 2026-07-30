import type { FastifyInstance } from 'fastify'
import { remindersRoutes } from './routes'

export default async function remindersModule(app: FastifyInstance): Promise<void> {
  await app.register(remindersRoutes)
}
