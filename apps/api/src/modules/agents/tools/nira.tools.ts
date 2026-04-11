/**
 * Tools del agente NIRA — Compras
 */

import { prisma } from '../../../lib/prisma'
import type { AgentTool } from '../types'

// ─── listar_proveedores ───────────────────────────────────────────────────────

const listarProveedores: AgentTool = {
  definition: {
    name:        'listar_proveedores',
    description: 'Lista los proveedores activos del tenant con su puntuación y términos de pago.',
    input_schema: {
      type:       'object',
      properties: {
        search: { type: 'string', description: 'Filtrar por nombre (opcional)' },
      },
    },
  },

  async execute({ search }, tenantId) {
    const suppliers = await prisma.supplier.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(search ? { name: { contains: search as string, mode: 'insensitive' } } : {}),
      },
      include: {
        score: { select: { overallScore: true, priceScore: true, deliveryScore: true, qualityScore: true } },
      },
      orderBy: { name: 'asc' },
      take:    20,
    })

    if (suppliers.length === 0) return { message: 'No se encontraron proveedores activos.' }

    return suppliers.map((s) => ({
      id:         s.id,
      nombre:     s.name,
      contacto:   s.contactName ?? 'N/D',
      email:      s.email ?? 'N/D',
      plazo:      s.paymentTerms != null ? `${s.paymentTerms} días` : 'N/D',
      puntuacion: s.score ? Number(s.score.overallScore).toFixed(1) : 'Sin eval.',
      precio:     s.score ? Number(s.score.priceScore).toFixed(1) : '-',
      entrega:    s.score ? Number(s.score.deliveryScore).toFixed(1) : '-',
      calidad:    s.score ? Number(s.score.qualityScore).toFixed(1) : '-',
    }))
  },
}

// ─── comparar_cotizaciones ────────────────────────────────────────────────────

const compararCotizaciones: AgentTool = {
  definition: {
    name:        'comparar_cotizaciones',
    description: 'Compara el historial de precios de un producto entre distintos proveedores.',
    input_schema: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: 'Nombre o parte del nombre del producto' },
        productId:   { type: 'string', description: 'ID del producto (alternativa)' },
      },
    },
  },

  async execute({ productName, productId }, tenantId) {
    let resolvedProductId = productId as string | undefined

    if (!resolvedProductId && productName) {
      const product = await prisma.product.findFirst({
        where:  { tenantId, name: { contains: productName as string, mode: 'insensitive' } },
        select: { id: true },
      })
      if (!product) return { error: `No se encontró el producto "${productName}"` }
      resolvedProductId = product.id
    }

    if (!resolvedProductId) return { error: 'Debes proporcionar productName o productId' }

    // Buscar líneas de OC con este producto
    const items = await prisma.purchaseOrderItem.findMany({
      where: {
        productId: resolvedProductId,
        purchaseOrder: { tenantId },
      },
      include: {
        purchaseOrder: {
          select: { supplierId: true, createdAt: true, supplier: { select: { name: true } } },
        },
        product: { select: { name: true, unit: true } },
      },
      orderBy: { purchaseOrder: { createdAt: 'desc' } },
      take:    30,
    })

    if (items.length === 0) return { message: 'No hay historial de compras para este producto.' }

    const bySupplier = new Map<string, { nombre: string; precios: number[]; ultimaCompra: string }>()

    for (const item of items) {
      if (!item.purchaseOrder.supplierId || !item.purchaseOrder.supplier) continue
      const sid      = item.purchaseOrder.supplierId
      const price    = Number(item.unitCost)
      const existing = bySupplier.get(sid)
      if (existing) {
        existing.precios.push(price)
      } else {
        bySupplier.set(sid, {
          nombre:      item.purchaseOrder.supplier.name,
          precios:     [price],
          ultimaCompra: item.purchaseOrder.createdAt.toISOString().split('T')[0]!,
        })
      }
    }

    return Array.from(bySupplier.values()).map((s) => {
      const sorted = [...s.precios].sort((a, b) => a - b)
      return {
        proveedor:    s.nombre,
        precioMin:    sorted[0],
        precioMax:    sorted[sorted.length - 1],
        precioMedio:  (s.precios.reduce((a, b) => a + b, 0) / s.precios.length).toFixed(2),
        pedidos:      s.precios.length,
        ultimaCompra: s.ultimaCompra,
      }
    })
  },
}

// ─── crear_borrador_oc ────────────────────────────────────────────────────────

const crearBorradorOC: AgentTool = {
  definition: {
    name:        'crear_borrador_oc',
    description: 'Crea un BORRADOR de orden de compra que requiere aprobación humana.',
    input_schema: {
      type: 'object',
      properties: {
        supplierId: { type: 'string', description: 'ID del proveedor' },
        branchId:   { type: 'string', description: 'ID de la sucursal destino' },
        items: {
          type:  'array',
          items: {
            type: 'object',
            properties: {
              productId:        { type: 'string' },
              quantityOrdered:  { type: 'number' },
              unitCost:         { type: 'number' },
            },
            required: ['productId', 'quantityOrdered', 'unitCost'],
          },
          description: 'Productos a comprar',
        },
        notes: { type: 'string', description: 'Nota opcional para el equipo' },
      },
      required: ['supplierId', 'branchId', 'items'],
    },
  },

  async execute({ supplierId, branchId, items, notes }, tenantId) {
    const supplier = await prisma.supplier.findFirst({
      where:  { id: supplierId as string, tenantId },
      select: { id: true, name: true },
    })
    if (!supplier) return { error: 'Proveedor no encontrado en este tenant.' }

    // Buscar un usuario TENANT_ADMIN para createdBy (requerido por schema)
    const admin = await prisma.user.findFirst({
      where:  { tenantId, role: 'TENANT_ADMIN' },
      select: { id: true },
    })
    if (!admin) return { error: 'No se encontró un administrador del tenant para registrar la OC.' }

    const lineItems = items as Array<{ productId: string; quantityOrdered: number; unitCost: number }>
    const subtotal  = lineItems.reduce((sum, i) => sum + i.quantityOrdered * i.unitCost, 0)

    // Generar número de orden único
    const count       = await prisma.purchaseOrder.count({ where: { tenantId } })
    const orderNumber = `OC-AGENTE-${String(count + 1).padStart(4, '0')}`

    const order = await prisma.purchaseOrder.create({
      data: {
        tenantId,
        supplierId: supplierId as string,
        branchId:   branchId as string,
        createdBy:  admin.id,
        orderNumber,
        status:     'draft',
        subtotal,
        tax:        0,
        total:      subtotal,
        notes:      notes as string | undefined,
        items: {
          create: lineItems.map((i) => ({
            productId:       i.productId,
            quantityOrdered: i.quantityOrdered,
            unitCost:        i.unitCost,
            total:           i.quantityOrdered * i.unitCost,
          })),
        },
      },
      select: { id: true },
    })

    // Notificar al equipo
    const managers = await prisma.user.findMany({
      where:  { tenantId, role: { in: ['AREA_MANAGER', 'TENANT_ADMIN'] } },
      select: { id: true },
    })

    await prisma.notification.createMany({
      data: managers.map((u) => ({
        tenantId,
        userId:  u.id,
        module:  'NIRA' as const,
        type:    'borrador_oc',
        title:   `Nueva OC borrador — ${supplier.name}`,
        message: `NIRA creó la OC ${orderNumber} con ${lineItems.length} producto(s) por $${subtotal.toLocaleString()}. Requiere aprobación.`,
        link:    `/nira/purchase-orders/${order.id}`,
      })),
    })

    return {
      success:   true,
      ordenId:   order.id,
      numero:    orderNumber,
      proveedor: supplier.name,
      total:     subtotal,
      estado:    'draft',
      mensaje:   'OC creada como borrador. El equipo debe aprobarla antes de enviarla.',
    }
  },
}

// ─── notificar_jefe_compras ───────────────────────────────────────────────────

const notificarJefeCompras: AgentTool = {
  definition: {
    name:        'notificar_jefe_compras',
    description: 'Envía una notificación urgente al AREA_MANAGER de NIRA.',
    input_schema: {
      type: 'object',
      properties: {
        title:   { type: 'string', description: 'Título de la notificación' },
        message: { type: 'string', description: 'Contenido del mensaje' },
      },
      required: ['title', 'message'],
    },
  },

  async execute({ title, message }, tenantId) {
    const managers = await prisma.user.findMany({
      where:  { tenantId, role: { in: ['AREA_MANAGER', 'TENANT_ADMIN'] } },
      select: { id: true },
    })

    await prisma.notification.createMany({
      data: managers.map((u) => ({
        tenantId,
        userId:  u.id,
        module:  'NIRA' as const,
        type:    'agente_urgente',
        title:   title as string,
        message: message as string,
      })),
    })

    return { success: true, notificados: managers.length }
  },
}

// ─── Catálogo NIRA ────────────────────────────────────────────────────────────

export const NIRA_TOOLS: AgentTool[] = [
  listarProveedores,
  compararCotizaciones,
  crearBorradorOC,
  notificarJefeCompras,
]
