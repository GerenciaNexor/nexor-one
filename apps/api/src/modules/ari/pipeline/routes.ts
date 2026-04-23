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
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function pipelineRoutes(app: FastifyInstance): Promise<void> {

  // ===========================================================================
  // ETAPAS DEL PIPELINE
  // ===========================================================================

  /**
   * GET /v1/ari/pipeline/stages
   */
  app.get('/stages', {
    schema: {
      tags:        ['ARI'],
      summary:     'Listar etapas del pipeline',
      description: 'Lista todas las etapas del tenant ordenadas por `order`, con conteo de deals por etapa.',
      security:    bearerAuth,
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
    const result = await listStages(request.user.tenantId)
    return reply.code(200).send(result)
  })

  /**
   * POST /v1/ari/pipeline/stages
   */
  app.post('/stages', {
    schema: {
      tags:        ['ARI'],
      summary:     'Crear etapa de pipeline',
      description: 'Crea una nueva etapa personalizada al final del orden actual. Requiere AREA_MANAGER.ARI.',
      security:    bearerAuth,
      body:        z2j(CreateStageSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'ARI'),
  }, async (request, reply) => {
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
   */
  app.put('/stages/reorder', {
    schema: {
      tags:        ['ARI'],
      summary:     'Reordenar etapas',
      description: 'Actualiza el `order` de múltiples etapas en una sola operación. Body: `{ stages: [{ id, order }] }`.',
      security:    bearerAuth,
      body:        z2j(ReorderStagesSchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'ARI'),
  }, async (request, reply) => {
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
   */
  app.put('/stages/:id', {
    schema: {
      tags:        ['ARI'],
      summary:     'Editar etapa de pipeline',
      description: 'Actualiza nombre, color, flags o posición de una etapa. Requiere AREA_MANAGER.ARI.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(UpdateStageSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'ARI'),
  }, async (request, reply) => {
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
   */
  app.delete('/stages/:id', {
    schema: {
      tags:        ['ARI'],
      summary:     'Eliminar etapa de pipeline',
      description: 'Elimina una etapa. Falla con 409 si la etapa tiene deals activos o es la única. Requiere AREA_MANAGER.ARI.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'ARI'),
  }, async (request, reply) => {
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
   */
  app.get('/deals', {
    schema: {
      tags:        ['ARI'],
      summary:     'Listar deals',
      description: 'Lista deals del tenant. OPERATIVE ve solo los suyos; AREA_MANAGER+ ve todos.',
      security:    bearerAuth,
      querystring: z2j(DealQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
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
   */
  app.get('/deals/:id', {
    schema: {
      tags:        ['ARI'],
      summary:     'Detalle de deal',
      description: 'Detalle completo del deal incluyendo etapa, cliente y cotizaciones asociadas.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
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
   */
  app.post('/deals', {
    schema: {
      tags:        ['ARI'],
      summary:     'Crear deal',
      description: 'Crea un nuevo deal en la primera etapa del pipeline.',
      security:    bearerAuth,
      body:        z2j(CreateDealSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
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
   */
  app.put('/deals/:id/stage', {
    schema: {
      tags:        ['ARI'],
      summary:     'Mover deal de etapa',
      description: 'Mueve un deal a otra etapa. Si la etapa tiene isFinalWon=true, crea una transacción de ingreso en VERA.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(MoveDealSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'ARI'),
  }, async (request, reply) => {
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
