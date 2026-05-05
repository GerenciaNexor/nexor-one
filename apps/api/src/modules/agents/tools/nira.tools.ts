/**
 * Tools del agente NIRA — Compras
 * HU-052: listar_proveedores, comparar_precios, crear_borrador_oc,
 *         consultar_presupuesto, notificar_jefe_compras.
 */

import { prisma } from '../../../lib/prisma'
import type { AgentTool } from '../types'

// ─── listar_proveedores ───────────────────────────────────────────────────────

const listarProveedores: AgentTool = {
  definition: {
    name:        'listar_proveedores',
    description: 'Returns the list of active suppliers for the tenant with their name, overall score and payment terms (credit days). Optionally filter by supplier name.',
    input_schema: {
      type:       'object',
      properties: {
        search: { type: 'string', description: 'Filter by supplier name (optional partial match)' },
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

    if (suppliers.length === 0) return { message: 'No active suppliers found.' }

    return suppliers.map((s) => ({
      id:         s.id,
      nombre:     s.name,
      contacto:   s.contactName ?? 'N/A',
      email:      s.email ?? 'N/A',
      plazo:      s.paymentTerms != null ? `${s.paymentTerms} días` : 'N/A',
      puntuacion: s.score ? Number(s.score.overallScore).toFixed(1) : 'Not rated',
      precio:     s.score ? Number(s.score.priceScore).toFixed(1) : '-',
      entrega:    s.score ? Number(s.score.deliveryScore).toFixed(1) : '-',
      calidad:    s.score ? Number(s.score.qualityScore).toFixed(1) : '-',
    }))
  },
}

// ─── comparar_precios ─────────────────────────────────────────────────────────

const compararPrecios: AgentTool = {
  definition: {
    name:        'comparar_precios',
    description: 'Compares the price history of a product across different suppliers. Returns min, max and average price per supplier.',
    input_schema: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: 'Product name or partial name' },
        productId:   { type: 'string', description: 'Exact product ID (alternative to productName)' },
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
      if (!product) return { error: `Product "${productName}" not found.` }
      resolvedProductId = product.id
    }

    if (!resolvedProductId) return { error: 'Provide productName or productId.' }

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

    if (items.length === 0) return { message: 'No purchase history found for this product.' }

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
          nombre:       item.purchaseOrder.supplier.name,
          precios:      [price],
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
    description: 'Creates a DRAFT purchase order that requires human approval before it is sent to the supplier. Automatically notifies the purchasing team.',
    input_schema: {
      type: 'object',
      properties: {
        supplierId: { type: 'string', description: 'Supplier ID' },
        branchId:   { type: 'string', description: 'Destination branch ID' },
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
          description: 'Products to order',
        },
        notes: { type: 'string', description: 'Optional note for the team' },
      },
      required: ['supplierId', 'branchId', 'items'],
    },
  },

  async execute({ supplierId, branchId, items, notes }, tenantId) {
    const supplier = await prisma.supplier.findFirst({
      where:  { id: supplierId as string, tenantId },
      select: { id: true, name: true },
    })
    if (!supplier) return { error: 'Supplier not found in this tenant.' }

    // Requires a createdBy user — use TENANT_ADMIN
    const admin = await prisma.user.findFirst({
      where:  { tenantId, role: 'TENANT_ADMIN' },
      select: { id: true },
    })
    if (!admin) return { error: 'No tenant admin found to register the purchase order.' }

    const lineItems = items as Array<{ productId: string; quantityOrdered: number; unitCost: number }>
    const subtotal  = lineItems.reduce((sum, i) => sum + i.quantityOrdered * i.unitCost, 0)

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

    // Notify purchasing team — mandatory per business rule
    const managers = await prisma.user.findMany({
      where: {
        tenantId,
        OR: [
          { role: 'AREA_MANAGER', module: 'NIRA' },
          { role: 'TENANT_ADMIN' },
        ],
      },
      select: { id: true },
    })

    await prisma.notification.createMany({
      data: managers.map((u) => ({
        tenantId,
        userId:  u.id,
        module:  'NIRA' as const,
        type:    'borrador_oc',
        title:   `New draft PO — ${supplier.name}`,
        message: `NIRA created PO ${orderNumber} with ${lineItems.length} item(s) for $${subtotal.toLocaleString()}. Requires approval.`,
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
      mensaje:   'Draft PO created. The team must approve it before it is sent.',
    }
  },
}

// ─── consultar_presupuesto ────────────────────────────────────────────────────

const consultarPresupuesto: AgentTool = {
  definition: {
    name:        'consultar_presupuesto',
    description: 'Returns the total amount spent on purchase orders in the current calendar month (excluding drafts and cancelled orders). Includes a breakdown by status.',
    input_schema: { type: 'object', properties: {} },
  },

  async execute(_, tenantId) {
    const now           = new Date()
    const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1)

    const [aggregate, byStatus] = await Promise.all([
      prisma.purchaseOrder.aggregate({
        where: {
          tenantId,
          createdAt: { gte: startOfMonth },
          status:    { notIn: ['draft', 'cancelled'] },
        },
        _sum:   { total: true },
        _count: { id: true },
      }),
      prisma.purchaseOrder.groupBy({
        by:   ['status'],
        where: {
          tenantId,
          createdAt: { gte: startOfMonth },
          status:    { notIn: ['draft', 'cancelled'] },
        },
        _sum:   { total: true },
        _count: { id: true },
      }),
    ])

    return {
      mes:        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      totalGastado: Number(aggregate._sum.total ?? 0).toFixed(2),
      ordenes:      aggregate._count.id,
      porEstado:    byStatus.map((g) => ({
        estado:  g.status,
        total:   Number(g._sum.total ?? 0).toFixed(2),
        ordenes: g._count.id,
      })),
    }
  },
}

// ─── notificar_jefe_compras ───────────────────────────────────────────────────

const notificarJefeCompras: AgentTool = {
  definition: {
    name:        'notificar_jefe_compras',
    description: 'Sends an urgent in-app notification to the NIRA purchasing team (AREA_MANAGERs and admins). Use when you need human intervention or cannot complete a task.',
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
    const managers = await prisma.user.findMany({
      where: {
        tenantId,
        OR: [
          { role: 'AREA_MANAGER', module: 'NIRA' },
          { role: 'TENANT_ADMIN' },
        ],
      },
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

// ─── consultar_ordenes_compra ─────────────────────────────────────────────────

function df(from?: unknown, to?: unknown) {
  const gte = from ? new Date(from as string) : undefined
  const lte = to   ? new Date(new Date(to as string).setHours(23, 59, 59, 999)) : undefined
  return (!gte && !lte) ? undefined : { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) }
}

const consultarOrdenesCompra: AgentTool = {
  definition: {
    name: 'consultar_ordenes_compra',
    description: 'Returns purchase orders with optional filters by status, supplier and date range. Use to review purchasing activity or find a specific order.',
    input_schema: {
      type: 'object',
      properties: {
        estado:      { type: 'string', enum: ['draft', 'sent', 'received', 'cancelled'], description: 'Order status filter' },
        supplierId:  { type: 'string', description: 'Filter by supplier ID' },
        from:        { type: 'string', description: 'Start date YYYY-MM-DD' },
        to:          { type: 'string', description: 'End date YYYY-MM-DD' },
        limit:       { type: 'number', description: 'Max results (default 20, max 50)' },
      },
    },
  },

  async execute({ estado, supplierId, from, to, limit }, tenantId) {
    const take       = Math.min(50, Math.max(1, Number(limit ?? 20)))
    const dateFilter = df(from, to)

    const orders = await prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        ...(estado     ? { status: estado as string }             : {}),
        ...(supplierId ? { supplierId: supplierId as string }     : {}),
        ...(dateFilter ? { createdAt: dateFilter }                : {}),
      },
      include: {
        supplier: { select: { name: true } },
        branch:   { select: { name: true } },
        items:    { select: { quantityOrdered: true, unitCost: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    })

    if (orders.length === 0) return { total: 0, ordenes: [], message: 'No se encontraron órdenes con los filtros indicados.' }

    return {
      total: orders.length,
      ordenes: orders.map((o) => ({
        id:          o.id,
        numero:      o.orderNumber,
        estado:      o.status,
        proveedor:   o.supplier?.name ?? null,
        sucursal:    o.branch?.name   ?? null,
        items:       o.items.length,
        subtotal:    Number(o.subtotal).toFixed(2),
        total:       Number(o.total).toFixed(2),
        fecha:       o.createdAt.toISOString().split('T')[0],
      })),
    }
  },
}

// ─── consultar_ranking_proveedores ────────────────────────────────────────────

const consultarRankingProveedores: AgentTool = {
  definition: {
    name: 'consultar_ranking_proveedores',
    description: 'Returns suppliers ranked by their overall score (price, delivery, quality). Use to identify the best and worst performing suppliers.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of suppliers to return (default 10)' },
      },
    },
  },

  async execute({ limit }, tenantId) {
    const take = Math.min(50, Math.max(1, Number(limit ?? 10)))

    const suppliers = await prisma.supplier.findMany({
      where:   { tenantId, isActive: true, score: { isNot: null } },
      include: { score: true },
      orderBy: { score: { overallScore: 'desc' } },
      take,
    })

    if (suppliers.length === 0) return { total: 0, proveedores: [], message: 'No hay proveedores con puntaje calculado aún.' }

    return {
      total: suppliers.length,
      proveedores: suppliers.map((s, idx) => ({
        posicion:    idx + 1,
        proveedor:   s.name,
        id:          s.id,
        puntuacion:  Number(s.score!.overallScore).toFixed(1),
        precio:      Number(s.score!.priceScore).toFixed(1),
        entrega:     Number(s.score!.deliveryScore).toFixed(1),
        calidad:     Number(s.score!.qualityScore).toFixed(1),
        totalOrdenes: s.score!.totalOrders,
        entregasATiempo: s.score!.onTimeDeliveries,
      })),
    }
  },
}

// ─── consultar_reporte_costos ─────────────────────────────────────────────────

const consultarReporteCostos: AgentTool = {
  definition: {
    name: 'consultar_reporte_costos',
    description: 'Returns total purchasing spend for a period broken down by supplier. Excludes draft and cancelled orders.',
    input_schema: {
      type: 'object',
      properties: {
        from:  { type: 'string', description: 'Start date YYYY-MM-DD (default: first day of current month)' },
        to:    { type: 'string', description: 'End date YYYY-MM-DD (default: today)' },
        limit: { type: 'number', description: 'Top N suppliers (default 10)' },
      },
    },
  },

  async execute({ from, to, limit }, tenantId) {
    const now  = new Date()
    const gte  = from ? new Date(from as string) : new Date(now.getFullYear(), now.getMonth(), 1)
    const lte  = to   ? new Date(new Date(to as string).setHours(23, 59, 59, 999)) : now
    const take = Math.min(50, Math.max(1, Number(limit ?? 10)))

    const [totalAgg, bySup] = await Promise.all([
      prisma.purchaseOrder.aggregate({
        where: { tenantId, createdAt: { gte, lte }, status: { notIn: ['draft', 'cancelled'] } },
        _sum:  { total: true },
        _count: { id: true },
      }),
      prisma.purchaseOrder.groupBy({
        by:    ['supplierId'],
        where: { tenantId, createdAt: { gte, lte }, status: { notIn: ['draft', 'cancelled'] } },
        _sum:  { total: true },
        _count: { id: true },
        orderBy: { _sum: { total: 'desc' } },
        take,
      }),
    ])

    const supIds   = bySup.map((r) => r.supplierId).filter(Boolean) as string[]
    const sups     = supIds.length > 0
      ? await prisma.supplier.findMany({ where: { id: { in: supIds } }, select: { id: true, name: true } })
      : []
    const supMap   = new Map(sups.map((s) => [s.id, s.name]))

    return {
      periodo:       { desde: gte.toISOString().split('T')[0], hasta: lte.toISOString().split('T')[0] },
      totalGastado:  Number(totalAgg._sum.total ?? 0).toFixed(2),
      totalOrdenes:  totalAgg._count.id,
      porProveedor:  bySup.map((r) => ({
        proveedor: r.supplierId ? (supMap.get(r.supplierId) ?? r.supplierId) : 'Sin proveedor',
        total:     Number(r._sum.total ?? 0).toFixed(2),
        ordenes:   r._count.id,
      })),
    }
  },
}

// ─── Catálogo NIRA ────────────────────────────────────────────────────────────

export const NIRA_TOOLS: AgentTool[] = [
  listarProveedores,
  compararPrecios,
  crearBorradorOC,
  consultarPresupuesto,
  notificarJefeCompras,
  consultarOrdenesCompra,
  consultarRankingProveedores,
  consultarReporteCostos,
]
