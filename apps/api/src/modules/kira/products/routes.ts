import type { FastifyInstance } from 'fastify'
import { CreateProductSchema, UpdateProductSchema, ProductQuerySchema } from './schema'
import { listProducts, getProduct, createProduct, updateProduct, deactivateProduct } from './service'
import { requireRoleAndModule } from '../../../lib/guards'
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function productsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/kira/products
   */
  app.get('/', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Listar productos',
      description: 'Lista productos activos del tenant con filtros opcionales. OPERATIVE.KIRA puede consultar.',
      security:    bearerAuth,
      querystring: z2j(ProductQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'KIRA'),
  }, async (request, reply) => {
    const parsed = ProductQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros de consulta inválidos',
        code: 'VALIDATION_ERROR',
      })
    }
    const result = await listProducts(request.user.tenantId, parsed.data)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/kira/products/:id
   */
  app.get('/:id', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Detalle de producto',
      description: 'Devuelve el producto con niveles de stock por sucursal.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'KIRA'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const product = await getProduct(request.user.tenantId, id)
      return reply.code(200).send(product)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * POST /v1/kira/products
   */
  app.post('/', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Crear producto',
      description: 'Crea un nuevo producto. SKU debe ser único en el tenant. Requiere AREA_MANAGER.KIRA o superior.',
      security:    bearerAuth,
      body:        z2j(CreateProductSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'KIRA'),
  }, async (request, reply) => {
    const parsed = CreateProductSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code: 'VALIDATION_ERROR',
      })
    }
    try {
      const product = await createProduct(request.user.tenantId, parsed.data)
      return reply.code(201).send(product)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/kira/products/:id
   */
  app.put('/:id', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Editar producto',
      description: 'Actualiza nombre, categoría o configuración de stock mínimo/máximo. El SKU es inmutable.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(UpdateProductSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'KIRA'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateProductSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code: 'VALIDATION_ERROR',
      })
    }
    try {
      const product = await updateProduct(request.user.tenantId, id, parsed.data)
      return reply.code(200).send(product)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * DELETE /v1/kira/products/:id
   */
  app.delete('/:id', {
    schema: {
      tags:        ['KIRA'],
      summary:     'Desactivar producto',
      description: 'Soft delete — desactiva el producto conservando historial de stock. Requiere AREA_MANAGER.KIRA.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'KIRA'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const product = await deactivateProduct(request.user.tenantId, id)
      return reply.code(200).send(product)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
