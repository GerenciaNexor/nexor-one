import type { FastifyInstance } from 'fastify'
import { CreateProductSchema, UpdateProductSchema, ProductQuerySchema } from './schema'
import { listProducts, getProduct, createProduct, updateProduct, deactivateProduct } from './service'
import { requireRoleAndModule } from '../../../lib/guards'

export async function productsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/kira/products
   * OPERATIVE.KIRA puede consultar (solo lectura).
   * Query params: ?search=, ?category=, ?active=true|false (default: activos)
   */
  app.get('/', { preHandler: requireRoleAndModule('OPERATIVE', 'KIRA') }, async (request, reply) => {
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
   * OPERATIVE.KIRA puede consultar el detalle completo.
   */
  app.get('/:id', { preHandler: requireRoleAndModule('OPERATIVE', 'KIRA') }, async (request, reply) => {
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
   * AREA_MANAGER.KIRA o superior puede crear productos.
   * OPERATIVE no puede crear.
   */
  app.post('/', { preHandler: requireRoleAndModule('AREA_MANAGER', 'KIRA') }, async (request, reply) => {
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
   * AREA_MANAGER.KIRA o superior puede editar.
   * El SKU es inmutable — no se acepta en el body.
   */
  app.put('/:id', { preHandler: requireRoleAndModule('AREA_MANAGER', 'KIRA') }, async (request, reply) => {
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
   * Soft delete — desactiva el producto, conserva datos e historial.
   * AREA_MANAGER.KIRA o superior puede desactivar.
   */
  app.delete('/:id', { preHandler: requireRoleAndModule('AREA_MANAGER', 'KIRA') }, async (request, reply) => {
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
