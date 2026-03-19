/**
 * Modulo Users — Gestion de usuarios dentro de un tenant (CRUD, roles, sucursales).
 * Implementado en HU-031.
 *
 * Endpoints:
 *   GET  /v1/users          — listar usuarios del tenant (TENANT_ADMIN)
 *   POST /v1/users          — crear usuario (TENANT_ADMIN)
 *   PUT  /v1/users/:id      — actualizar usuario (TENANT_ADMIN)
 */
import type { FastifyInstance } from 'fastify'
import { usersRoutes } from './routes'

export default async function usersModule(app: FastifyInstance) {
  app.register(usersRoutes)
}
