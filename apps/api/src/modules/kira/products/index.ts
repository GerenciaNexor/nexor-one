import type { FastifyInstance } from 'fastify'
import { productsRoutes } from './routes'

export default async function productsModule(app: FastifyInstance): Promise<void> {
  await app.register(productsRoutes)
}
