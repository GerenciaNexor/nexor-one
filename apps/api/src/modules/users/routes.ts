import type { FastifyInstance } from 'fastify'
import { CreateUserSchema, UpdateUserSchema } from './schema'
import { listUsers, createUser, updateUser } from './service'
import { requireTenantAdmin } from '../../lib/guards'

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/users?search=&page=1&limit=20
   * Lista todos los usuarios del tenant (excluye SUPER_ADMIN).
   * Solo TENANT_ADMIN puede consultar.
   */
  app.get('/', { preHandler: [requireTenantAdmin()] }, async (request, reply) => {
    const q = request.query as { search?: string; page?: string; limit?: string }
    const page  = Math.max(1, Number(q.page  ?? 1))
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)))
    const result = await listUsers(request.user.tenantId, { search: q.search, page, limit })
    return reply.code(200).send(result)
  })

  /**
   * POST /v1/users
   * Crea un nuevo usuario en el tenant. Solo TENANT_ADMIN.
   */
  app.post('/', { preHandler: [requireTenantAdmin()] }, async (request, reply) => {
    const parsed = CreateUserSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada invalidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const user = await createUser(request.user.tenantId, parsed.data)
      return reply.code(201).send(user)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/users/:id
   * Actualiza role, sucursal, nombre, estado o contrasena de un usuario.
   * No puede modificar a sí mismo ni a SUPER_ADMIN.
   */
  app.put('/:id', { preHandler: [requireTenantAdmin()] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateUserSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada invalidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const user = await updateUser(request.user.tenantId, id, request.user.userId, parsed.data)
      return reply.code(200).send(user)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
