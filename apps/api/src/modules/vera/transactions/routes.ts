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

function errReply(reply: FastifyReply, err: unknown) {
  const e = err as { statusCode?: number; message?: string; code?: string }
  return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
}

export async function transactionsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/vera/transactions
   * Lista transacciones con filtros y búsqueda por descripción/referencia.
   */
  app.get('/', { preHandler: requireRoleAndModule('OPERATIVE', 'VERA') }, async (request, reply) => {
    const parsed = ListTransactionsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos', code: 'VALIDATION_ERROR' })
    }
    const result = await listTransactions(request.user.tenantId, parsed.data)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/vera/transactions/:id
   * Detalle completo de una transacción — muestra origen para las automáticas.
   */
  app.get('/:id', { preHandler: requireRoleAndModule('OPERATIVE', 'VERA') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const tx = await getTransaction(request.user.tenantId, id)
      return reply.code(200).send(tx)
    } catch (err) { return errReply(reply, err) }
  })

  /**
   * POST /v1/vera/transactions
   * Crea una transacción manual (isManual=true). Solo AREA_MANAGER.VERA y superiores.
   */
  app.post('/', { preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA') }, async (request, reply) => {
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
   * Edita una transacción manual. Rechaza automáticas con 403.
   */
  app.put('/:id', { preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA') }, async (request, reply) => {
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
   * Elimina permanentemente una transacción manual. Rechaza automáticas con 403.
   */
  app.delete('/:id', { preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await deleteManualTransaction(request.user.tenantId, id)
      return reply.code(204).send()
    } catch (err) { return errReply(reply, err) }
  })

  /**
   * PATCH /v1/vera/transactions/:id/classify
   * Asigna o cambia categoría y/o centro de costo (manual y automáticas).
   */
  app.patch('/:id/classify', { preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA') }, async (request, reply) => {
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
