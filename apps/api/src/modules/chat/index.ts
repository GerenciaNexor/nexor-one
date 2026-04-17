/**
 * Módulo Chat interno del dashboard — HU-057A
 *
 * Rutas montadas bajo /v1/chat dentro del scope protegido por tenantHook.
 */

import type { FastifyInstance } from 'fastify'
import { chatRoutes } from './routes'

export default async function chatModule(app: FastifyInstance): Promise<void> {
  await app.register(chatRoutes)
}
