/**
 * Módulo de PLATAFORMA (HU-134) — identidad separada del equipo NEXOR.
 * Registra las rutas públicas de autenticación de plataforma.
 */
import type { FastifyInstance } from 'fastify'
import { platformRoutes } from './routes'

export default async function platformModule(app: FastifyInstance): Promise<void> {
  await app.register(platformRoutes)
}
