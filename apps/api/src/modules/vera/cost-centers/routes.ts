import type { FastifyInstance } from 'fastify'
import { requireRoleAndModule } from '../../../lib/guards'
import { CreateCostCenterSchema, UpdateCostCenterSchema } from './schema'
import { listCostCenters, createCostCenter, updateCostCenter } from './service'
import { z2j, idParam, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function costCentersRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/vera/cost-centers
   */
  app.get('/', {
    schema: {
      tags:        ['VERA'],
      summary:     'Listar centros de costo',
      description: 'Lista todos los centros de costo activos del tenant.',
      security:    bearerAuth,
      response:    { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'VERA'),
  }, async (request, reply) => {
    const data = await listCostCenters(request.user.tenantId)
    return reply.code(200).send({ data })
  })

  /**
   * POST /v1/vera/cost-centers
   */
  app.post('/', {
    schema: {
      tags:        ['VERA'],
      summary:     'Crear centro de costo',
      description: 'Crea un nuevo centro de costo. Requiere AREA_MANAGER.VERA.',
      security:    bearerAuth,
      body:        z2j(CreateCostCenterSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
    const parsed = CreateCostCenterSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    }
    try {
      const cc = await createCostCenter(request.user.tenantId, parsed.data)
      return reply.code(201).send(cc)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/vera/cost-centers/:id
   */
  app.put('/:id', {
    schema: {
      tags:        ['VERA'],
      summary:     'Editar centro de costo',
      description: 'Edita nombre, descripción o estado de un centro de costo. Requiere AREA_MANAGER.VERA.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(UpdateCostCenterSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateCostCenterSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    }
    try {
      const cc = await updateCostCenter(request.user.tenantId, id, parsed.data)
      return reply.code(200).send(cc)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
