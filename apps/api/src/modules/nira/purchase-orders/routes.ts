import type { FastifyInstance } from 'fastify'
import {
  CreatePurchaseOrderSchema,
  UpdatePurchaseOrderSchema,
  PurchaseOrderQuerySchema,
  ReceivePurchaseOrderSchema,
  FromAlertSchema,
} from './schema'
import {
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  submitForApproval,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
  createPurchaseOrderFromAlert,
} from './service'
import { requireRoleAndModule } from '../../../lib/guards'

export async function purchaseOrdersRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/nira/purchase-orders
   * OPERATIVE.NIRA puede listar sus OC.
   * Query: ?status=draft|pending_approval|... &supplierId=xxx &branchId=xxx
   */
  app.get('/', { preHandler: requireRoleAndModule('OPERATIVE', 'NIRA') }, async (request, reply) => {
    const parsed = PurchaseOrderQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros de consulta inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    const result = await listPurchaseOrders(request.user.tenantId, parsed.data)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/nira/purchase-orders/:id
   * Detalle completo con líneas de productos.
   */
  app.get('/:id', { preHandler: requireRoleAndModule('OPERATIVE', 'NIRA') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const po = await getPurchaseOrder(request.user.tenantId, id)
      return reply.code(200).send(po)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * POST /v1/nira/purchase-orders
   * Crea una OC en borrador. OPERATIVE.NIRA o superior.
   */
  app.post('/', { preHandler: requireRoleAndModule('OPERATIVE', 'NIRA') }, async (request, reply) => {
    const parsed = CreatePurchaseOrderSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const po = await createPurchaseOrder(request.user.tenantId, request.user.userId, parsed.data)
      return reply.code(201).send(po)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/nira/purchase-orders/:id
   * Edita una OC en borrador. Solo se permite en estado draft.
   */
  app.put('/:id', { preHandler: requireRoleAndModule('OPERATIVE', 'NIRA') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdatePurchaseOrderSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const po = await updatePurchaseOrder(request.user.tenantId, id, parsed.data)
      return reply.code(200).send(po)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * POST /v1/nira/purchase-orders/:id/submit
   * Envía la OC a aprobación (draft → pending_approval).
   */
  app.post('/:id/submit', { preHandler: requireRoleAndModule('OPERATIVE', 'NIRA') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const po = await submitForApproval(request.user.tenantId, id)
      return reply.code(200).send(po)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/nira/purchase-orders/:id/approve
   * Aprueba la OC (pending_approval → approved).
   * Solo AREA_MANAGER.NIRA o superior.
   * Genera egreso en VERA y notificación al comprador.
   */
  app.put('/:id/approve', { preHandler: requireRoleAndModule('AREA_MANAGER', 'NIRA') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const po = await approvePurchaseOrder(request.user.tenantId, id, request.user.userId)
      return reply.code(200).send(po)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/nira/purchase-orders/:id/cancel
   * Cancela la OC. Si estaba aprobada, revierte el egreso en VERA.
   * AREA_MANAGER.NIRA o superior (previene cancelaciones no autorizadas).
   */
  app.put('/:id/cancel', { preHandler: requireRoleAndModule('AREA_MANAGER', 'NIRA') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const result = await cancelPurchaseOrder(request.user.tenantId, id)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * POST /v1/nira/purchase-orders/from-alert
   * Crea un borrador de OC a partir de una alerta de stock crítico.
   * Selecciona automáticamente el proveedor de mejor score con historial para el producto.
   * Si no hay historial, crea el borrador sin proveedor para que el comprador lo complete.
   * La cantidad sugerida = maxStock - stockActual (o minStock × 2 si no hay maxStock).
   * OPERATIVE.NIRA o superior.
   */
  app.post('/from-alert', { preHandler: requireRoleAndModule('OPERATIVE', 'NIRA') }, async (request, reply) => {
    const parsed = FromAlertSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const po = await createPurchaseOrderFromAlert(request.user.tenantId, request.user.userId, parsed.data)
      return reply.code(201).send(po)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/nira/purchase-orders/:id/receive
   * Registra la recepción de mercancía (total o parcial).
   * Por cada línea recibida:
   *   - Crea stock_movement de tipo 'entrada' en KIRA (referenceType: 'purchase_order')
   *   - Actualiza quantity_received en la línea de la OC
   * Si todas las líneas se recibieron → received. Si parcial → partial.
   * Notifica al AREA_MANAGER de KIRA.
   * OPERATIVE.NIRA o superior puede registrar recepciones.
   */
  app.put('/:id/receive', { preHandler: requireRoleAndModule('OPERATIVE', 'NIRA') }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = ReceivePurchaseOrderSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const po = await receivePurchaseOrder(request.user.tenantId, request.user.userId, id, parsed.data)
      return reply.code(200).send(po)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
