import type { FastifyInstance } from 'fastify'
import { CreateUserSchema, UpdateUserSchema } from './schema'
import { listUsers, createUser, updateUser } from './service'
import { requireTenantAdmin } from '../../lib/guards'
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../lib/openapi'

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/users
   */
  app.get('/', {
    schema: {
      tags:        ['Users'],
      summary:     'Listar usuarios del tenant',
      description: 'Lista todos los usuarios del tenant (excluye SUPER_ADMIN). Solo TENANT_ADMIN.',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          page:   { type: 'string' },
          limit:  { type: 'string' },
        },
      },
      response: { 200: listRes, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
    const q = request.query as { search?: string; page?: string; limit?: string }
    const page  = Math.max(1, Number(q.page  ?? 1))
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)))
    const result = await listUsers(request.user.tenantId, { search: q.search, page, limit })
    return reply.code(200).send(result)
  })

  /**
   * POST /v1/users
   */
  app.post('/', {
    schema: {
      tags:        ['Users'],
      summary:     'Crear usuario',
      description: 'Crea un nuevo usuario en el tenant. Solo TENANT_ADMIN.',
      security:    bearerAuth,
      body:        z2j(CreateUserSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
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
   */
  app.put('/:id', {
    schema: {
      tags:        ['Users'],
      summary:     'Actualizar usuario',
      description: 'Actualiza rol, sucursal, nombre, estado o contraseña. No puede modificarse a sí mismo ni a SUPER_ADMIN.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(UpdateUserSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
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
