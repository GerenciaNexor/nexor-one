import type { FastifyInstance, FastifyReply } from 'fastify'
import { QuickPurchaseSchema, QuickSaleSchema } from './schema'
import { quickPurchase, quickSale, listQuickProducts, listQuickSuppliers, listQuickClients, listQuickBranches } from './service'
import { requireRole } from '../../lib/guards'
import { z2j, listRes, objRes, stdErrors, bearerAuth } from '../../lib/openapi'

const errReply = (reply: FastifyReply, err: unknown) => {
  const e = err as { statusCode?: number; message?: string; code?: string }
  return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
}

/**
 * HU-169 — Registro rápido de compra/venta (transacción ya ocurrida, sin aprobación).
 * Es un camino transversal (NIRA/ARI/KIRA/VERA); se protege por ROL (mín. OPERATIVE) + tenant/RLS,
 * sin exigir un módulo específico. El OPERATIVE queda fijado a SU sucursal.
 */
export default async function quickModule(app: FastifyInstance): Promise<void> {
  // Lookups
  app.get('/products',  { schema: { tags: ['Quick'], summary: 'Productos para registro rápido', security: bearerAuth, response: { 200: listRes, ...stdErrors } }, preHandler: [requireRole('OPERATIVE')] },
    async (req, reply) => reply.code(200).send(await listQuickProducts(req.user.tenantId)))
  app.get('/suppliers', { schema: { tags: ['Quick'], summary: 'Proveedores (incluye genérico)', security: bearerAuth, response: { 200: listRes, ...stdErrors } }, preHandler: [requireRole('OPERATIVE')] },
    async (req, reply) => reply.code(200).send(await listQuickSuppliers(req.user.tenantId)))
  app.get('/clients',   { schema: { tags: ['Quick'], summary: 'Clientes (incluye genérico)', security: bearerAuth, response: { 200: listRes, ...stdErrors } }, preHandler: [requireRole('OPERATIVE')] },
    async (req, reply) => reply.code(200).send(await listQuickClients(req.user.tenantId)))
  app.get('/branches',  { schema: { tags: ['Quick'], summary: 'Sucursales', security: bearerAuth, response: { 200: listRes, ...stdErrors } }, preHandler: [requireRole('OPERATIVE')] },
    async (req, reply) => reply.code(200).send(await listQuickBranches(req.user.tenantId)))

  /** POST /v1/quick/purchases — compra rápida (ya completada). */
  app.post('/purchases', {
    schema: { tags: ['Quick'], summary: 'Registrar compra rápida', security: bearerAuth, body: z2j(QuickPurchaseSchema), response: { 201: objRes, ...stdErrors } },
    preHandler: [requireRole('OPERATIVE')],
  }, async (request, reply) => {
    const parsed = QuickPurchaseSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    if (request.user.role === 'OPERATIVE') parsed.data.branchId = request.user.branchId ?? parsed.data.branchId
    try {
      const result = await quickPurchase(request.user.tenantId, request.user.userId, parsed.data)
      return reply.code(201).send({ success: true, data: result })
    } catch (err) { return errReply(reply, err) }
  })

  /** POST /v1/quick/sales — venta rápida (ya completada). */
  app.post('/sales', {
    schema: { tags: ['Quick'], summary: 'Registrar venta rápida', security: bearerAuth, body: z2j(QuickSaleSchema), response: { 201: objRes, ...stdErrors } },
    preHandler: [requireRole('OPERATIVE')],
  }, async (request, reply) => {
    const parsed = QuickSaleSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    if (request.user.role === 'OPERATIVE') parsed.data.branchId = request.user.branchId ?? parsed.data.branchId
    try {
      const result = await quickSale(request.user.tenantId, request.user.userId, parsed.data)
      return reply.code(201).send({ success: true, data: result })
    } catch (err) { return errReply(reply, err) }
  })
}
