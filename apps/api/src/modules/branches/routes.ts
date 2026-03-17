import type { FastifyInstance } from 'fastify'
import { CreateBranchSchema, UpdateBranchSchema } from './schema'
import { listBranches, createBranch, updateBranch, deactivateBranch } from './service'
import { requireTenantAdmin, requireBranchAdmin, getBranchFilter, canAccessBranch } from '../../lib/guards'

export async function branchesRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/branches
   * TENANT_ADMIN ve todas las sucursales.
   * BRANCH_ADMIN y roles menores ven solo la suya (filtrada por getBranchFilter).
   */
  app.get('/', async (request, reply) => {
    const branchIdFilter = getBranchFilter(request.user)
    const result = await listBranches(request.user.tenantId, branchIdFilter)
    return reply.code(200).send(result)
  })

  /**
   * POST /v1/branches
   * Solo TENANT_ADMIN puede crear sucursales.
   */
  app.post('/', { preHandler: [requireTenantAdmin()] }, async (request, reply) => {
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
   * TENANT_ADMIN puede editar cualquier sucursal.
   * BRANCH_ADMIN solo puede editar su propia sucursal.
   */
  app.put('/:id', { preHandler: [requireBranchAdmin()] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    // BRANCH_ADMIN no puede modificar una sucursal que no sea la suya
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
   * Soft delete — solo desactiva la sucursal, conserva todos sus datos.
   * Solo TENANT_ADMIN puede desactivar sucursales.
   */
  app.delete('/:id', { preHandler: [requireTenantAdmin()] }, async (request, reply) => {
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
