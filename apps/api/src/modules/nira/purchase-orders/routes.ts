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
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function purchaseOrdersRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/nira/purchase-orders
   */
  app.get('/', {
    schema: {
      tags:        ['NIRA'],
      summary:     'Listar órdenes de compra',
      description: 'Lista OC del tenant con filtros por estado, proveedor y sucursal.',
      security:    bearerAuth,
      querystring: z2j(PurchaseOrderQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'NIRA'),
  }, async (request, reply) => {
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
   */
  app.get('/:id', {
    schema: {
      tags:        ['NIRA'],
      summary:     'Detalle de orden de compra',
      description: 'Detalle completo con líneas de productos y recepciones parciales.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'NIRA'),
  }, async (request, reply) => {
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
   */
  app.post('/', {
    schema: {
      tags:        ['NIRA'],
      summary:     'Crear orden de compra',
      description: 'Crea una OC en estado draft. OPERATIVE.NIRA o superior.',
      security:    bearerAuth,
      body:        z2j(CreatePurchaseOrderSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'NIRA'),
  }, async (request, reply) => {
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
   */
  app.put('/:id', {
    schema: {
      tags:        ['NIRA'],
      summary:     'Editar orden de compra',
      description: 'Edita una OC en estado draft. Rechaza con 409 si no está en draft.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(UpdatePurchaseOrderSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'NIRA'),
  }, async (request, reply) => {
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
   */
  app.post('/:id/submit', {
    schema: {
      tags:        ['NIRA'],
      summary:     'Enviar a aprobación',
      description: 'Cambia el estado de la OC de draft → pending_approval.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'NIRA'),
  }, async (request, reply) => {
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
   */
  app.put('/:id/approve', {
    schema: {
      tags:        ['NIRA'],
      summary:     'Aprobar orden de compra',
      description: 'Aprueba la OC (pending_approval → approved). Genera egreso en VERA y notifica al comprador. Requiere AREA_MANAGER.NIRA.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'NIRA'),
  }, async (request, reply) => {
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
   */
  app.put('/:id/cancel', {
    schema: {
      tags:        ['NIRA'],
      summary:     'Cancelar orden de compra',
      description: 'Cancela la OC. Si estaba aprobada, revierte el egreso en VERA. Requiere AREA_MANAGER.NIRA.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'NIRA'),
  }, async (request, reply) => {
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
   */
  app.post('/from-alert', {
    schema: {
      tags:        ['NIRA'],
      summary:     'Crear OC desde alerta de stock',
      description: 'Crea un borrador de OC a partir de una alerta de stock crítico. Sugiere proveedor por score y cantidad = maxStock − stockActual.',
      security:    bearerAuth,
      body:        z2j(FromAlertSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'NIRA'),
  }, async (request, reply) => {
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
   */
  app.put('/:id/receive', {
    schema: {
      tags:        ['NIRA'],
      summary:     'Registrar recepción de mercancía',
      description: 'Registra recepción total o parcial. Crea stock_movements en KIRA por cada línea recibida. OC → received o partial.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(ReceivePurchaseOrderSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'NIRA'),
  }, async (request, reply) => {
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
