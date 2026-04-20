import type { FastifyInstance } from 'fastify'
import { requireRoleAndModule } from '../../../lib/guards'
import { CreateCategorySchema, UpdateCategorySchema } from './schema'
import { listCategories, createCategory, updateCategory } from './service'

export async function categoriesRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/vera/categories?type=income|expense
   * Lista categorias del tenant. Auto-siembra las por defecto si no existen.
   */
  app.get('/', { preHandler: requireRoleAndModule('OPERATIVE', 'VERA') }, async (request, reply) => {
    const { type } = request.query as { type?: string }
    const data = await listCategories(request.user.tenantId, type)
    return reply.code(200).send({ data })
  })

  /**
   * POST /v1/vera/categories
   * Crea una nueva categoria. Solo AREA_MANAGER.VERA y superiores.
   */
  app.post('/', { preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA') }, async (request, reply) => {
    const parsed = CreateCategorySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    }
    try {
      const cat = await createCategory(request.user.tenantId, parsed.data)
      return reply.code(201).send(cat)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/vera/categories/:id
   * Edita nombre, color o estado de una categoria.
   * Las categorias por defecto pueden editarse pero no eliminarse.
   */
  app.put('/:id', { preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateCategorySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    }
    try {
      const cat = await updateCategory(request.user.tenantId, id, parsed.data)
      return reply.code(200).send(cat)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
