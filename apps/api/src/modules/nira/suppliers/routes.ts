import type { FastifyInstance } from 'fastify'
import { CreateSupplierSchema, UpdateSupplierSchema, SupplierQuerySchema } from './schema'
import { listSuppliers, getSupplier, createSupplier, updateSupplier, deactivateSupplier } from './service'
import { requireRoleAndModule } from '../../../lib/guards'
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function suppliersRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/nira/suppliers
   */
  app.get('/', {
    schema: {
      tags:        ['NIRA'],
      summary:     'Listar proveedores',
      description: 'Lista proveedores activos del tenant. OPERATIVE.NIRA puede consultar. Query: search, active.',
      security:    bearerAuth,
      querystring: z2j(SupplierQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'NIRA'),
  }, async (request, reply) => {
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
   */
  app.get('/:id', {
    schema: {
      tags:        ['NIRA'],
      summary:     'Detalle de proveedor',
      description: 'Detalle completo incluyendo score calculado e historial de OC.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'NIRA'),
  }, async (request, reply) => {
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
   */
  app.post('/', {
    schema: {
      tags:        ['NIRA'],
      summary:     'Crear proveedor',
      description: 'Crea un nuevo proveedor. Requiere AREA_MANAGER.NIRA o superior.',
      security:    bearerAuth,
      body:        z2j(CreateSupplierSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'NIRA'),
  }, async (request, reply) => {
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
   */
  app.put('/:id', {
    schema: {
      tags:        ['NIRA'],
      summary:     'Editar proveedor',
      description: 'Actualiza cualquier campo del proveedor. Requiere AREA_MANAGER.NIRA o superior.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(UpdateSupplierSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'NIRA'),
  }, async (request, reply) => {
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
   */
  app.delete('/:id', {
    schema: {
      tags:        ['NIRA'],
      summary:     'Desactivar proveedor',
      description: 'Soft delete — desactiva el proveedor conservando órdenes y score. Requiere AREA_MANAGER.NIRA.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'NIRA'),
  }, async (request, reply) => {
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
