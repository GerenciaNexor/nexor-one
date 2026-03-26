import type { FastifyInstance } from 'fastify'
import { CreateSupplierSchema, UpdateSupplierSchema, SupplierQuerySchema } from './schema'
import { listSuppliers, getSupplier, createSupplier, updateSupplier, deactivateSupplier } from './service'
import { requireRoleAndModule } from '../../../lib/guards'

export async function suppliersRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/nira/suppliers
   * OPERATIVE.NIRA puede consultar (solo lectura).
   * Query: ?search=nombre_o_nit, ?active=true|false (default: solo activos)
   *
   * Un proveedor desactivado no aparece en la lista por defecto
   * — evita que se asocie a nuevas órdenes de compra.
   */
  app.get('/', { preHandler: requireRoleAndModule('OPERATIVE', 'NIRA') }, async (request, reply) => {
    const parsed = SupplierQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros de consulta inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    const result = await listSuppliers(request.user.tenantId, parsed.data)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/nira/suppliers/:id
   * OPERATIVE.NIRA puede ver el detalle completo incluyendo el score calculado.
   */
  app.get('/:id', { preHandler: requireRoleAndModule('OPERATIVE', 'NIRA') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const supplier = await getSupplier(request.user.tenantId, id)
      return reply.code(200).send(supplier)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * POST /v1/nira/suppliers
   * AREA_MANAGER.NIRA o superior puede crear proveedores.
   * OPERATIVE no puede crear ni editar — solo consultar.
   */
  app.post('/', { preHandler: requireRoleAndModule('AREA_MANAGER', 'NIRA') }, async (request, reply) => {
    const parsed = CreateSupplierSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const supplier = await createSupplier(request.user.tenantId, parsed.data)
      return reply.code(201).send(supplier)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/nira/suppliers/:id
   * AREA_MANAGER.NIRA o superior puede editar cualquier campo.
   */
  app.put('/:id', { preHandler: requireRoleAndModule('AREA_MANAGER', 'NIRA') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateSupplierSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const supplier = await updateSupplier(request.user.tenantId, id, parsed.data)
      return reply.code(200).send(supplier)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * DELETE /v1/nira/suppliers/:id
   * Soft delete — desactiva el proveedor sin borrar órdenes ni score.
   * AREA_MANAGER.NIRA o superior puede desactivar.
   */
  app.delete('/:id', { preHandler: requireRoleAndModule('AREA_MANAGER', 'NIRA') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const supplier = await deactivateSupplier(request.user.tenantId, id)
      return reply.code(200).send(supplier)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
