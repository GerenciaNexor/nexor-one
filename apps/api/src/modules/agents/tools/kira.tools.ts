/**
 * Tools del agente KIRA — Inventario
 */

import { prisma } from '../../../lib/prisma'
import type { AgentTool } from '../types'

// ─── consultar_stock ──────────────────────────────────────────────────────────

const consultarStock: AgentTool = {
  definition: {
    name:        'consultar_stock',
    description: 'Consulta el stock actual de un producto en una o todas las sucursales del tenant.',
    input_schema: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: 'Nombre o parte del nombre del producto' },
        productId:   { type: 'string', description: 'ID exacto del producto (opcional si usas productName)' },
        branchId:    { type: 'string', description: 'ID de la sucursal. Omitir para ver todas.' },
      },
    },
  },

  async execute({ productName, productId, branchId }, tenantId) {
    let resolvedProductId = productId as string | undefined

    if (!resolvedProductId && productName) {
      const product = await prisma.product.findFirst({
        where:  { tenantId, name: { contains: productName as string, mode: 'insensitive' } },
        select: { id: true, name: true },
      })
      if (!product) return { error: `No se encontró ningún producto con nombre "${productName}"` }
      resolvedProductId = product.id
    }

    if (!resolvedProductId) return { error: 'Debes proporcionar productName o productId' }

    const stocks = await prisma.stock.findMany({
      where: {
        productId: resolvedProductId,
        product:   { tenantId },
        ...(branchId ? { branchId: branchId as string } : {}),
      },
      include: {
        product: { select: { name: true, sku: true, minStock: true, unit: true } },
        branch:  { select: { name: true } },
      },
    })

    if (stocks.length === 0) return { message: 'No hay registros de stock para este producto.' }

    return stocks.map((s) => ({
      producto: s.product.name,
      sku:      s.product.sku,
      sucursal: s.branch.name,
      cantidad: Number(s.quantity),
      unidad:   s.product.unit,
      minStock: s.product.minStock,
      alerta:   s.product.minStock != null && Number(s.quantity) < s.product.minStock,
    }))
  },
}

// ─── listar_alertas_activas ───────────────────────────────────────────────────

const listarAlertasActivas: AgentTool = {
  definition: {
    name:        'listar_alertas_activas',
    description: 'Lista todos los productos por debajo de su stock mínimo en cualquier sucursal.',
    input_schema: { type: 'object', properties: {} },
  },

  async execute(_, tenantId) {
    const stocks = await prisma.stock.findMany({
      where: { product: { tenantId, minStock: { gt: 0 } } },
      include: {
        product: { select: { name: true, sku: true, minStock: true, unit: true } },
        branch:  { select: { name: true } },
      },
    })

    const alertas = stocks.filter(
      (s) => s.product.minStock != null && Number(s.quantity) < s.product.minStock,
    )

    if (alertas.length === 0) return { message: 'No hay productos bajo el mínimo actualmente.' }

    return alertas.map((s) => ({
      producto: s.product.name,
      sku:      s.product.sku,
      sucursal: s.branch.name,
      cantidad: Number(s.quantity),
      minimo:   s.product.minStock,
      deficit:  s.product.minStock! - Number(s.quantity),
      unidad:   s.product.unit,
    }))
  },
}

// ─── registrar_entrada ────────────────────────────────────────────────────────

const registrarEntrada: AgentTool = {
  definition: {
    name:        'registrar_entrada',
    description: 'Registra una entrada de stock para un producto en una sucursal.',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'ID del producto' },
        branchId:  { type: 'string', description: 'ID de la sucursal' },
        quantity:  { type: 'number', description: 'Cantidad a ingresar (positivo)' },
        notes:     { type: 'string', description: 'Nota opcional' },
      },
      required: ['productId', 'branchId', 'quantity'],
    },
  },

  async execute({ productId, branchId, quantity, notes }, tenantId) {
    const qty = Number(quantity)
    if (qty <= 0) return { error: 'La cantidad debe ser mayor que cero.' }

    const product = await prisma.product.findFirst({
      where:  { id: productId as string, tenantId },
      select: { id: true, name: true },
    })
    if (!product) return { error: 'Producto no encontrado en este tenant.' }

    // Stock actual (para quantityBefore / quantityAfter)
    const currentStock = await prisma.stock.findUnique({
      where:  { productId_branchId: { productId: productId as string, branchId: branchId as string } },
      select: { quantity: true },
    })
    const before = Number(currentStock?.quantity ?? 0)
    const after  = before + qty

    await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          tenantId,
          productId:      productId as string,
          branchId:       branchId as string,
          type:           'ENTRADA',
          quantity:       qty,
          quantityBefore: before,
          quantityAfter:  after,
          notes:          notes as string | undefined,
        },
      }),
      prisma.stock.upsert({
        where:  { productId_branchId: { productId: productId as string, branchId: branchId as string } },
        create: { productId: productId as string, branchId: branchId as string, quantity: qty },
        update: { quantity: { increment: qty } },
      }),
    ])

    return { success: true, producto: product.name, cantidad: qty, tipo: 'ENTRADA', stockNuevo: after }
  },
}

// ─── registrar_salida ─────────────────────────────────────────────────────────

const registrarSalida: AgentTool = {
  definition: {
    name:        'registrar_salida',
    description: 'Registra una salida de stock. El stock NUNCA puede quedar negativo.',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'ID del producto' },
        branchId:  { type: 'string', description: 'ID de la sucursal' },
        quantity:  { type: 'number', description: 'Cantidad a retirar (positivo)' },
        notes:     { type: 'string', description: 'Motivo de la salida' },
      },
      required: ['productId', 'branchId', 'quantity'],
    },
  },

  async execute({ productId, branchId, quantity, notes }, tenantId) {
    const qty = Number(quantity)
    if (qty <= 0) return { error: 'La cantidad debe ser mayor que cero.' }

    const product = await prisma.product.findFirst({
      where:  { id: productId as string, tenantId },
      select: { id: true, name: true },
    })
    if (!product) return { error: 'Producto no encontrado en este tenant.' }

    const stock = await prisma.stock.findUnique({
      where:  { productId_branchId: { productId: productId as string, branchId: branchId as string } },
      select: { quantity: true },
    })

    const before = Number(stock?.quantity ?? 0)
    if (before < qty) {
      return { error: `Stock insuficiente. Stock actual: ${before}. Solicitado: ${qty}.` }
    }
    const after = before - qty

    await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          tenantId,
          productId:      productId as string,
          branchId:       branchId as string,
          type:           'SALIDA',
          quantity:       qty,
          quantityBefore: before,
          quantityAfter:  after,
          notes:          notes as string | undefined,
        },
      }),
      prisma.stock.update({
        where: { productId_branchId: { productId: productId as string, branchId: branchId as string } },
        data:  { quantity: { decrement: qty } },
      }),
    ])

    return { success: true, producto: product.name, cantidad: qty, tipo: 'SALIDA', stockRestante: after }
  },
}

// ─── crear_solicitud_compra ───────────────────────────────────────────────────

const crearSolicitudCompra: AgentTool = {
  definition: {
    name:        'crear_solicitud_compra',
    description: 'Crea una notificación urgente en NIRA para que el equipo de compras reabastezca un producto.',
    input_schema: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: 'Nombre del producto a reabastecer' },
        quantity:    { type: 'number', description: 'Cantidad sugerida a comprar' },
      },
      required: ['productName', 'quantity'],
    },
  },

  async execute({ productName, quantity }, tenantId) {
    const recipients = await prisma.user.findMany({
      where:  { tenantId, role: { in: ['AREA_MANAGER', 'TENANT_ADMIN'] } },
      select: { id: true },
    })

    await prisma.notification.createMany({
      data: recipients.map((u) => ({
        tenantId,
        userId:  u.id,
        module:  'NIRA' as const,
        type:    'stock_critico',
        title:   `Solicitud de compra: ${productName}`,
        message: `KIRA detectó stock crítico. Se sugiere comprar ${quantity} unidades de ${productName}.`,
        link:    '/nira/purchase-orders',
      })),
    })

    return { success: true, notificados: recipients.length, producto: productName, cantidadSugerida: quantity }
  },
}

// ─── notificar_equipo ─────────────────────────────────────────────────────────

const notificarEquipo: AgentTool = {
  definition: {
    name:        'notificar_equipo',
    description: 'Envía una notificación in-app al equipo del módulo indicado.',
    input_schema: {
      type: 'object',
      properties: {
        title:   { type: 'string', description: 'Título corto' },
        message: { type: 'string', description: 'Contenido de la notificación' },
        module:  { type: 'string', description: 'Módulo: KIRA o NIRA' },
      },
      required: ['title', 'message', 'module'],
    },
  },

  async execute({ title, message, module }, tenantId) {
    const recipients = await prisma.user.findMany({
      where:  { tenantId, role: { in: ['AREA_MANAGER', 'TENANT_ADMIN'] } },
      select: { id: true },
    })

    await prisma.notification.createMany({
      data: recipients.map((u) => ({
        tenantId,
        userId:  u.id,
        module:  (module as string).toUpperCase() as 'KIRA' | 'NIRA',
        type:    'agente_alerta',
        title:   title as string,
        message: message as string,
      })),
    })

    return { success: true, notificados: recipients.length }
  },
}

// ─── Catálogo KIRA ────────────────────────────────────────────────────────────

export const KIRA_TOOLS: AgentTool[] = [
  consultarStock,
  listarAlertasActivas,
  registrarEntrada,
  registrarSalida,
  crearSolicitudCompra,
  notificarEquipo,
]
