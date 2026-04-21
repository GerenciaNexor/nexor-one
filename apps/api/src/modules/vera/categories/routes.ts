import type { FastifyInstance } from 'fastify'
import { requireRoleAndModule } from '../../../lib/guards'
import { CreateCategorySchema, UpdateCategorySchema } from './schema'
import { listCategories, createCategory, updateCategory } from './service'
import { z2j, idParam, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function categoriesRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/vera/categories
   */
  app.get('/', {
    schema: {
      tags:        ['VERA'],
      summary:     'Listar categorías',
      description: 'Lista categorías del tenant (income/expense). Siembra las categorías por defecto si no existen.',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: { type: { type: 'string', enum: ['income', 'expense'], description: 'Filtrar por tipo' } },
      },
      response:    { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'VERA'),
  }, async (request, reply) => {
    const { type } = request.query as { type?: string }
    const data = await listCategories(request.user.tenantId, type)
    return reply.code(200).send({ data })
  })

  /**
   * POST /v1/vera/categories
   */
  app.post('/', {
    schema: {
      tags:        ['VERA'],
      summary:     'Crear categoría',
      description: 'Crea una nueva categoría de ingreso o egreso. Requiere AREA_MANAGER.VERA.',
      security:    bearerAuth,
      body:        z2j(CreateCategorySchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
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
   */
  app.put('/:id', {
    schema: {
      tags:        ['VERA'],
      summary:     'Editar categoría',
      description: 'Edita nombre, color o estado de una categoría. Las categorías por defecto pueden editarse pero no eliminarse.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(UpdateCategorySchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
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
