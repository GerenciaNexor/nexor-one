import type { FastifyInstance } from 'fastify'
import { authRoutes } from './routes'

/**
 * Plugin del modulo Auth.
 * Registra las rutas bajo el prefijo que defina app.ts (ej: /v1/auth).
 */
export default async function authModule(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes)
}
