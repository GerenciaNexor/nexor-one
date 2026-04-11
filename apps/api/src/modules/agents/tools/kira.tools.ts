/**
 * Tools del agente KIRA — Inventario
 * HU-051: consultar_stock, registrar_movimiento, alertar_equipo + helpers.
 */

import { prisma } from '../../../lib/prisma'
import type { AgentTool } from '../types'

// ─── consultar_stock ──────────────────────────────────────────────────────────

const consultarStock: AgentTool = {
  definition: {
    name:        'consultar_stock',
    description: 'Returns the current stock for a product across all branches (or a specific branch). Use productName OR productId.',
    input_schema: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: 'Product name or partial name to search' },
        productId:   { type: 'string', description: 'Exact product ID (alternative to productName)' },
        branchId:    { type: 'string', description: 'Branch ID to filter results (omit to see all branches)' },
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
      if (!product) return { error: `No product found matching "${productName}"` }
      resolvedProductId = product.id
    }

    if (!resolvedProductId) return { error: 'Provide productName or productId' }

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

    if (stocks.length === 0) return { message: 'No stock records found for this product.' }

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
    description: 'Lists all products below their minimum stock level across all branches. Use this to get a full low-stock report.',
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

    if (alertas.length === 0) return { message: 'No products are below their minimum stock.' }

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

// ─── registrar_movimiento ─────────────────────────────────────────────────────

const registrarMovimiento: AgentTool = {
  definition: {
    name:        'registrar_movimiento',
    description: 'Records a stock movement (ENTRADA=add, SALIDA=subtract, AJUSTE=delta adjustment). Stock can never go below zero — returns an error if it would.',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product ID' },
        branchId:  { type: 'string', description: 'Branch ID' },
        tipo:      { type: 'string', enum: ['ENTRADA', 'SALIDA', 'AJUSTE'], description: 'Movement type' },
        cantidad:  { type: 'number', description: 'Units to add or subtract (positive for ENTRADA/AJUSTE-up, negative for AJUSTE-down, always positive for SALIDA)' },
        notas:     { type: 'string', description: 'Optional reason or note' },
      },
      required: ['productId', 'branchId', 'tipo', 'cantidad'],
    },
  },

  async execute({ productId, branchId, tipo, cantidad, notas }, tenantId) {
    const qty     = Number(cantidad)
    const tipo_   = (tipo as string).toUpperCase()

    if (tipo_ === 'SALIDA' && qty <= 0)
      return { error: 'SALIDA requires a positive quantity.' }
    if (tipo_ === 'ENTRADA' && qty <= 0)
      return { error: 'ENTRADA requires a positive quantity.' }

    // Validate product belongs to tenant
    const product = await prisma.product.findFirst({
      where:  { id: productId as string, tenantId },
      select: { id: true, name: true },
    })
    if (!product) return { error: 'Product not found in this tenant.' }

    // Current stock (required for quantityBefore / quantityAfter)
    const currentStock = await prisma.stock.findUnique({
      where:  { productId_branchId: { productId: productId as string, branchId: branchId as string } },
      select: { quantity: true },
    })
    const before = Number(currentStock?.quantity ?? 0)

    // Calculate after based on type
    let after: number
    if (tipo_ === 'ENTRADA') {
      after = before + qty
    } else if (tipo_ === 'SALIDA') {
      if (before < qty) {
        return { error: `Insufficient stock. Current: ${before}. Requested: ${qty}.` }
      }
      after = before - qty
    } else {
      // AJUSTE — qty can be negative for downward adjustment
      after = before + qty
      if (after < 0) {
        return { error: `Adjustment would leave stock at ${after}. Stock cannot be negative.` }
      }
    }

    const absQty = Math.abs(qty)

    await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          tenantId,
          productId:      productId as string,
          branchId:       branchId as string,
          type:           tipo_,
          quantity:       absQty,
          quantityBefore: before,
          quantityAfter:  after,
          notes:          notas as string | undefined,
        },
      }),
      tipo_ === 'SALIDA'
        ? prisma.stock.update({
            where: { productId_branchId: { productId: productId as string, branchId: branchId as string } },
            data:  { quantity: { decrement: absQty } },
          })
        : prisma.stock.upsert({
            where:  { productId_branchId: { productId: productId as string, branchId: branchId as string } },
            create: { productId: productId as string, branchId: branchId as string, quantity: after },
            update: { quantity: after },
          }),
    ])

    // Notificar al equipo de KIRA sobre la acción del agente.
    // La notificación es independiente de la transacción: si falla, el movimiento ya quedó registrado.
    try {
      const recipients = await prisma.user.findMany({
        where: {
          tenantId,
          OR: [
            { role: 'AREA_MANAGER', module: 'KIRA' },
            { role: 'TENANT_ADMIN' },
          ],
        },
        select: { id: true },
      })

      const tipoLabel: Record<string, string> = { ENTRADA: 'entrada', SALIDA: 'salida', AJUSTE: 'ajuste' }
      const notesText = notas ? ` Nota: ${String(notas).slice(0, 100)}.` : ''

      await prisma.notification.createMany({
        data: recipients.map((u) => ({
          tenantId,
          userId:  u.id,
          module:  'KIRA' as const,
          type:    'agente_accion',
          title:   `KIRA registró ${tipoLabel[tipo_] ?? tipo_} — ${product.name}`,
          message: `El agente registró ${absQty} unidades (${tipoLabel[tipo_] ?? tipo_}). Stock nuevo: ${after}.${notesText}`,
          link:    `/kira/stock`,
        })),
      })
    } catch {
      // La falla en notificaciones nunca revierte el movimiento de stock
    }

    return {
      success:    true,
      producto:   product.name,
      tipo:       tipo_,
      cantidad:   absQty,
      stockAntes: before,
      stockNuevo: after,
    }
  },
}

// ─── alertar_equipo ───────────────────────────────────────────────────────────

const alertarEquipo: AgentTool = {
  definition: {
    name:        'alertar_equipo',
    description: 'Sends an in-app notification to all AREA_MANAGERs and admins of the tenant. Use this when you detect a critical situation or cannot complete a task automatically.',
    input_schema: {
      type: 'object',
      properties: {
        title:   { type: 'string', description: 'Short notification title' },
        message: { type: 'string', description: 'Notification body' },
      },
      required: ['title', 'message'],
    },
  },

  async execute({ title, message }, tenantId) {
    const recipients = await prisma.user.findMany({
      where:  { tenantId, role: { in: ['AREA_MANAGER', 'TENANT_ADMIN'] } },
      select: { id: true },
    })

    await prisma.notification.createMany({
      data: recipients.map((u) => ({
        tenantId,
        userId:  u.id,
        module:  'KIRA' as const,
        type:    'agente_alerta',
        title:   title as string,
        message: message as string,
      })),
    })

    return { success: true, notificados: recipients.length }
  },
}

// ─── crear_solicitud_compra ───────────────────────────────────────────────────

const crearSolicitudCompra: AgentTool = {
  definition: {
    name:        'crear_solicitud_compra',
    description: 'Creates an urgent purchase request notification in NIRA so the purchasing team can restock a product.',
    input_schema: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: 'Name of the product to restock' },
        quantity:    { type: 'number', description: 'Suggested quantity to purchase' },
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
        title:   `Purchase request: ${productName}`,
        message: `KIRA detected critical stock. Suggested purchase: ${quantity} units of ${productName}.`,
        link:    '/nira/purchase-orders',
      })),
    })

    return { success: true, notificados: recipients.length, producto: productName, cantidadSugerida: quantity }
  },
}

// ─── Catálogo KIRA ────────────────────────────────────────────────────────────

export const KIRA_TOOLS: AgentTool[] = [
  consultarStock,
  listarAlertasActivas,
  registrarMovimiento,
  alertarEquipo,
  crearSolicitudCompra,
]
