import type { FastifyInstance } from 'fastify'
import { CreateBranchSchema, UpdateBranchSchema } from './schema'
import { listBranches, createBranch, updateBranch, deactivateBranch } from './service'
import { requireTenantAdmin, requireBranchAdmin, getBranchFilter, canAccessBranch } from '../../lib/guards'
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../lib/openapi'

export async function branchesRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/branches
   */
  app.get('/', {
    schema: {
      tags:        ['Branches'],
      summary:     'Listar sucursales',
      description: 'TENANT_ADMIN ve todas; BRANCH_ADMIN y roles menores ven solo la suya.',
      security:    bearerAuth,
      response:    { 200: listRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const branchIdFilter = getBranchFilter(request.user)
    const result = await listBranches(request.user.tenantId, branchIdFilter)
    return reply.code(200).send(result)
  })

  /**
   * POST /v1/branches
   */
  app.post('/', {
    schema: {
      tags:        ['Branches'],
      summary:     'Crear sucursal',
      description: 'Crea una nueva sucursal. Solo TENANT_ADMIN.',
      security:    bearerAuth,
      body:        z2j(CreateBranchSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
    const parsed = CreateBranchSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada invalidos',
        code: 'VALIDATION_ERROR',
      })
    }
    try {
      const branch = await createBranch(request.user.tenantId, parsed.data)
      return reply.code(201).send(branch)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/branches/:id
   */
  app.put('/:id', {
    schema: {
      tags:        ['Branches'],
      summary:     'Editar sucursal',
      description: 'TENANT_ADMIN puede editar cualquier sucursal; BRANCH_ADMIN solo la suya.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(UpdateBranchSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: [requireBranchAdmin()],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    if (!canAccessBranch(request.user, id)) {
      return reply.code(403).send({
        error: 'No tienes permisos para modificar esta sucursal',
        code: 'FORBIDDEN',
      })
    }

    const parsed = UpdateBranchSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada invalidos',
        code: 'VALIDATION_ERROR',
      })
    }
    try {
      const branch = await updateBranch(request.user.tenantId, id, parsed.data)
      return reply.code(200).send(branch)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * DELETE /v1/branches/:id
   */
  app.delete('/:id', {
    schema: {
      tags:        ['Branches'],
      summary:     'Desactivar sucursal',
      description: 'Soft delete — desactiva la sucursal conservando todos sus datos. Solo TENANT_ADMIN.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const branch = await deactivateBranch(request.user.tenantId, id)
      return reply.code(200).send(branch)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
