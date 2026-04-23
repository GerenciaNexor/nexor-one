import type { FastifyInstance, FastifyReply } from 'fastify'
import { requireRoleAndModule } from '../../../lib/guards'
import {
  CreateManualTransactionSchema,
  UpdateManualTransactionSchema,
  ClassifyTransactionSchema,
  ListTransactionsQuerySchema,
} from './schema'
import {
  listTransactions,
  getTransaction,
  createManualTransaction,
  updateManualTransaction,
  deleteManualTransaction,
  classifyTransaction,
} from './service'
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

function errReply(reply: FastifyReply, err: unknown) {
  const e = err as { statusCode?: number; message?: string; code?: string }
  return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
}

export async function transactionsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/vera/transactions
   */
  app.get('/', {
    schema: {
      tags:        ['VERA'],
      summary:     'Listar transacciones',
      description: 'Lista transacciones con filtros por tipo, categoría, fecha y búsqueda.',
      security:    bearerAuth,
      querystring: z2j(ListTransactionsQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'VERA'),
  }, async (request, reply) => {
    const parsed = ListTransactionsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos', code: 'VALIDATION_ERROR' })
    }
    const result = await listTransactions(request.user.tenantId, parsed.data)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/vera/transactions/:id
   */
  app.get('/:id', {
    schema: {
      tags:        ['VERA'],
      summary:     'Detalle de transacción',
      description: 'Detalle completo incluyendo origen (deal, OC, manual).',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'VERA'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const tx = await getTransaction(request.user.tenantId, id)
      return reply.code(200).send(tx)
    } catch (err) { return errReply(reply, err) }
  })

  /**
   * POST /v1/vera/transactions
   */
  app.post('/', {
    schema: {
      tags:        ['VERA'],
      summary:     'Crear transacción manual',
      description: 'Crea una transacción manual (isManual=true). Solo AREA_MANAGER.VERA y superiores.',
      security:    bearerAuth,
      body:        z2j(CreateManualTransactionSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
    const parsed = CreateManualTransactionSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    }
    try {
      const tx = await createManualTransaction(request.user.tenantId, parsed.data)
      return reply.code(201).send(tx)
    } catch (err) { return errReply(reply, err) }
  })

  /**
   * PUT /v1/vera/transactions/:id
   */
  app.put('/:id', {
    schema: {
      tags:        ['VERA'],
      summary:     'Editar transacción manual',
      description: 'Edita una transacción manual. Las transacciones automáticas son rechazadas con 403.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(UpdateManualTransactionSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateManualTransactionSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    }
    try {
      const tx = await updateManualTransaction(request.user.tenantId, id, parsed.data)
      return reply.code(200).send(tx)
    } catch (err) { return errReply(reply, err) }
  })

  /**
   * DELETE /v1/vera/transactions/:id
   */
  app.delete('/:id', {
    schema: {
      tags:        ['VERA'],
      summary:     'Eliminar transacción manual',
      description: 'Elimina permanentemente una transacción manual. Las automáticas son rechazadas con 403.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 204: { type: 'null' }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await deleteManualTransaction(request.user.tenantId, id)
      return reply.code(204).send()
    } catch (err) { return errReply(reply, err) }
  })

  /**
   * PATCH /v1/vera/transactions/:id/classify
   */
  app.patch('/:id/classify', {
    schema: {
      tags:        ['VERA'],
      summary:     'Clasificar transacción',
      description: 'Asigna o cambia categoría y/o centro de costo. Aplica a transacciones manuales y automáticas.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(ClassifyTransactionSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = ClassifyTransactionSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    }
    try {
      const tx = await classifyTransaction(request.user.tenantId, id, parsed.data)
      return reply.code(200).send(tx)
    } catch (err) { return errReply(reply, err) }
  })
}
