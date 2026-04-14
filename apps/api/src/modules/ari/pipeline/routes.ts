import type { FastifyInstance } from 'fastify'
import {
  CreateStageSchema,
  UpdateStageSchema,
  ReorderStagesSchema,
  CreateDealSchema,
  MoveDealSchema,
  DealQuerySchema,
} from './schema'
import {
  listStages,
  createStage,
  updateStage,
  deleteStage,
  reorderStages,
  listDeals,
  getDeal,
  createDeal,
  moveDeal,
} from './service'
import { requireRoleAndModule } from '../../../lib/guards'

export async function pipelineRoutes(app: FastifyInstance): Promise<void> {

  // ===========================================================================
  // ETAPAS DEL PIPELINE
  // ===========================================================================

  /**
   * GET /v1/ari/pipeline/stages
   * Lista todas las etapas del tenant ordenadas por `order`.
   * Incluye conteo de deals por etapa.
   */
  app.get('/stages', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
    const result = await listStages(request.user.tenantId)
    return reply.code(200).send(result)
  })

  /**
   * POST /v1/ari/pipeline/stages
   * Crea una nueva etapa personalizada. Se inserta al final del orden actual.
   * Requiere: AREA_MANAGER.ARI o superior.
   */
  app.post('/stages', { preHandler: requireRoleAndModule('AREA_MANAGER', 'ARI') }, async (request, reply) => {
    const parsed = CreateStageSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const stage = await createStage(request.user.tenantId, parsed.data)
      return reply.code(201).send(stage)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/ari/pipeline/stages/reorder
   * Reordena múltiples etapas en una sola operación.
   * Body: { stages: [{ id, order }] }
   * Requiere: AREA_MANAGER.ARI o superior.
   */
  app.put('/stages/reorder', { preHandler: requireRoleAndModule('AREA_MANAGER', 'ARI') }, async (request, reply) => {
    const parsed = ReorderStagesSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const result = await reorderStages(request.user.tenantId, parsed.data)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/ari/pipeline/stages/:id
   * Actualiza nombre, color, flags o posición de una etapa.
   * Requiere: AREA_MANAGER.ARI o superior.
   */
  app.put('/stages/:id', { preHandler: requireRoleAndModule('AREA_MANAGER', 'ARI') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateStageSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const stage = await updateStage(request.user.tenantId, id, parsed.data)
      return reply.code(200).send(stage)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * DELETE /v1/ari/pipeline/stages/:id
   * Elimina una etapa. Falla si la etapa tiene deals activos o es la última.
   * Requiere: AREA_MANAGER.ARI o superior.
   */
  app.delete('/stages/:id', { preHandler: requireRoleAndModule('AREA_MANAGER', 'ARI') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const result = await deleteStage(request.user.tenantId, id)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  // ===========================================================================
  // DEALS
  // ===========================================================================

  /**
   * GET /v1/ari/deals
   * Lista deals del tenant.
   * - AREA_MANAGER ve todos los deals.
   * - OPERATIVE solo ve los deals asignados a él.
   * Query: ?stageId=xxx &assignedTo=xxx &clientId=xxx
   */
  app.get('/deals', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
    const parsed = DealQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    const result = await listDeals(
      request.user.tenantId,
      request.user.userId,
      request.user.role,
      parsed.data,
    )
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/ari/deals/:id
   * Detalle completo de un deal.
   */
  app.get('/deals/:id', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const deal = await getDeal(request.user.tenantId, id)
      return reply.code(200).send(deal)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * POST /v1/ari/deals
   * Crea un nuevo deal.
   * Requiere: OPERATIVE.ARI o superior.
   */
  app.post('/deals', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
    const parsed = CreateDealSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const deal = await createDeal(request.user.tenantId, parsed.data)
      return reply.code(201).send(deal)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/ari/deals/:id/stage
   * Mueve un deal a otra etapa del pipeline.
   * Efecto secundario:
   *   - Si la nueva etapa tiene isFinalWon=true → crea transaction de ingreso en VERA.
   *   - Notifica in-app al vendedor asignado si el deal es ganado.
   * Cualquier rol de ARI puede mover deals.
   */
  app.put('/deals/:id/stage', { preHandler: requireRoleAndModule('OPERATIVE', 'ARI') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = MoveDealSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const deal = await moveDeal(
        request.user.tenantId,
        id,
        parsed.data,
        request.user.userId,
      )
      return reply.code(200).send(deal)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
