/**
 * Tools del agente NIRA — Compras
 * HU-052: listar_proveedores, comparar_precios, crear_borrador_oc,
 *         consultar_presupuesto, notificar_jefe_compras.
 */

import { prisma } from '../../../lib/prisma'
import type { AgentTool } from '../types'

// ─── Resolución del proveedor preferido (HU-123) ──────────────────────────────
// Prioridad: preferido del producto → preferido global del tenant → ninguno.
// Solo cuenta un proveedor preferido si sigue ACTIVO.
type PreferredSupplier = { id: string; nombre: string; origen: 'producto' | 'global' }

async function resolvePreferredSupplier(
  productId: string,
  tenantId: string,
): Promise<PreferredSupplier | null> {
  const product = await prisma.product.findFirst({
    where:  { id: productId, tenantId },
    select: { preferredSupplier: { select: { id: true, name: true, isActive: true } } },
  })
  if (product?.preferredSupplier?.isActive) {
    return { id: product.preferredSupplier.id, nombre: product.preferredSupplier.name, origen: 'producto' }
  }
  const tenant = await prisma.tenant.findUnique({
    where:  { id: tenantId },
    select: { defaultSupplier: { select: { id: true, name: true, isActive: true } } },
  })
  if (tenant?.defaultSupplier?.isActive) {
    return { id: tenant.defaultSupplier.id, nombre: tenant.defaultSupplier.name, origen: 'global' }
  }
  return null
}

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
    description: 'Compares the price history of a product across different suppliers. Returns min, max and average price per supplier. The product\'s PREFERRED supplier (or the tenant global fallback) is flagged with preferido=true and listed FIRST — recommend it first.',
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

    // HU-123 — proveedor preferido (producto → global). Se marca y se ordena primero.
    const preferido = await resolvePreferredSupplier(resolvedProductId, tenantId)

    if (items.length === 0) {
      return preferido
        ? {
            message:   'Sin historial de compras para este producto, pero hay un proveedor preferido: consúltalo primero.',
            preferido: { proveedor: preferido.nombre, origen: preferido.origen },
          }
        : { message: 'No purchase history found for this product.' }
    }

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

    const comparacion = Array.from(bySupplier.entries()).map(([sid, s]) => {
      const sorted = [...s.precios].sort((a, b) => a - b)
      return {
        proveedorId:  sid,
        proveedor:    s.nombre,
        preferido:    preferido?.id === sid,
        precioMin:    sorted[0],
        precioMax:    sorted[sorted.length - 1],
        precioMedio:  (s.precios.reduce((a, b) => a + b, 0) / s.precios.length).toFixed(2),
        pedidos:      s.precios.length,
        ultimaCompra: s.ultimaCompra,
      }
    })
    // El proveedor preferido va PRIMERO (HU-123).
    comparacion.sort((a, b) => Number(b.preferido) - Number(a.preferido))

    return {
      preferido: preferido ? { proveedor: preferido.nombre, origen: preferido.origen } : null,
      comparacion,
    }
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
        supplierId: { type: 'string', description: 'Supplier ID. OPTIONAL: if omitted, NIRA uses the preferred supplier of the first product (or the tenant global fallback).' },
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
      required: ['branchId', 'items'],
    },
  },

  async execute({ supplierId, branchId, items, notes }, tenantId) {
    const lineItems = items as Array<{ productId: string; quantityOrdered: number; unitCost: number }>
    if (lineItems.length === 0) return { error: 'La orden no tiene productos.' }

    // HU-123 — proveedor preferido del primer producto (producto → global del tenant).
    const preferido = await resolvePreferredSupplier(lineItems[0]!.productId, tenantId)

    // Si el agente no indicó proveedor, se propone el preferido por defecto.
    const resolvedSupplierId = (supplierId as string | undefined) ?? preferido?.id
    if (!resolvedSupplierId) {
      return { error: 'Indica un proveedor (supplierId) o define un proveedor preferido para el producto.' }
    }

    const supplier = await prisma.supplier.findFirst({
      where:  { id: resolvedSupplierId, tenantId },
      select: { id: true, name: true },
    })
    if (!supplier) return { error: 'Supplier not found in this tenant.' }

    // Constancia de la preferencia en el borrador (HU-123).
    let preferidoNota: string | undefined
    if (preferido && preferido.id === supplier.id) {
      preferidoNota = `Proveedor preferido (${preferido.origen}) propuesto por NIRA.`
    } else if (preferido && preferido.id !== supplier.id) {
      preferidoNota = `El preferido del producto es ${preferido.nombre} (${preferido.origen}); se eligió otro proveedor.`
    }
    const notasFinales = [notes as string | undefined, preferidoNota].filter(Boolean).join(' · ') || undefined

    // Requires a createdBy user — use TENANT_ADMIN
    const admin = await prisma.user.findFirst({
      where:  { tenantId, role: 'TENANT_ADMIN' },
      select: { id: true },
    })
    if (!admin) return { error: 'No tenant admin found to register the purchase order.' }

    const subtotal = lineItems.reduce((sum, i) => sum + i.quantityOrdered * i.unitCost, 0)

    const count       = await prisma.purchaseOrder.count({ where: { tenantId } })
    const orderNumber = `OC-AGENTE-${String(count + 1).padStart(4, '0')}`

    const order = await prisma.purchaseOrder.create({
      data: {
        tenantId,
        supplierId: supplier.id,
        branchId:   branchId as string,
        createdBy:  admin.id,
        orderNumber,
        status:     'draft',
        subtotal,
        tax:        0,
        total:      subtotal,
        notes:      notasFinales,
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
      esPreferido: preferido?.id === supplier.id,
      preferido:   preferido ? { proveedor: preferido.nombre, origen: preferido.origen } : null,
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
      orderBy: { score: { overallScore: { sort: 'desc', nulls: 'last' } } },
      take,
    })

    if (suppliers.length === 0) return { total: 0, proveedores: [], message: 'No hay proveedores con puntaje calculado aún.' }

    // HU-125 — un eje NULL es "sin datos" (no 0). Entrega/Calidad salen de calificaciones; Precio del histórico.
    const eje = (v: unknown): string => (v == null ? 'sin datos' : Number(v).toFixed(1))

    return {
      total: suppliers.length,
      nota:  'Escala 0-10. Entrega y Calidad provienen de las calificaciones al recibir la OC; Precio es objetivo del histórico. "sin datos" = aún no hay calificaciones/compras para ese eje.',
      proveedores: suppliers.map((s, idx) => ({
        posicion:    idx + 1,
        proveedor:   s.name,
        id:          s.id,
        puntuacion:  eje(s.score!.overallScore),
        precio:      eje(s.score!.priceScore),
        entrega:     eje(s.score!.deliveryScore),
        calidad:     eje(s.score!.qualityScore),
        calificaciones:  s.score!.ratingsCount,
        totalOrdenes:    s.score!.totalOrders,
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

// ─── consultar_alquileres_entrantes (HU-190) ──────────────────────────────────
// Compras → Alquileres entrantes (HU-175-178): lo que NEXOR alquiló DE un tercero.
// Distinto de los alquileres SALIENTES de KIRA (lo que NEXOR presta a sus clientes).

const consultarAlquileresEntrantes: AgentTool = {
  definition: {
    name:        'consultar_alquileres_entrantes',
    description: 'Lista los alquileres ENTRANTES (lo que la empresa ha alquilado/rentado DE un tercero o proveedor externo): qué se rentó, cantidad, a quién, costo, fecha de devolución y estado. Úsala para "¿qué he alquilado de un externo?", "¿qué le rentamos a un proveedor?" o "¿qué alquileres entrantes están por vencer?". NO confundir con consultar_alquileres (lo que NOSOTROS prestamos a clientes).',
    input_schema: {
      type: 'object',
      properties: {
        soloActivos: { type: 'boolean', description: 'Si es true, solo los alquileres activos (aún no devueltos). Por defecto trae todos.' },
        busqueda:    { type: 'string',  description: 'Filtrar por proyecto o nombre del tercero/proveedor (opcional)' },
      },
    },
  },

  async execute({ soloActivos, busqueda }, tenantId) {
    const now = new Date()
    const q = busqueda ? String(busqueda) : undefined
    const rentals = await prisma.incomingRental.findMany({
      where: {
        tenantId,
        ...(soloActivos ? { status: 'active' } : {}),
        ...(q ? { OR: [
          { project:        { contains: q, mode: 'insensitive' } },
          { thirdPartyName: { contains: q, mode: 'insensitive' } },
          { description:    { contains: q, mode: 'insensitive' } },
          { supplier: { name: { contains: q, mode: 'insensitive' } } },
        ] } : {}),
      },
      select: {
        description: true, quantity: true, project: true, returnDate: true,
        rentalCost: true, deposit: true, status: true, thirdPartyName: true,
        supplier: { select: { name: true } },
        branch:   { select: { name: true } },
      },
      orderBy: [{ status: 'asc' }, { returnDate: 'asc' }],
      take:    100,
    })

    if (rentals.length === 0) {
      return { total: 0, alquileresEntrantes: [], mensaje: 'No hay alquileres entrantes registrados.' }
    }

    return {
      total: rentals.length,
      alquileresEntrantes: rentals.map((r) => ({
        descripcion: r.description,
        cantidad:    Number(r.quantity),
        tercero:     r.supplier?.name ?? r.thirdPartyName ?? 'Sin registrar',
        proyecto:    r.project,
        costo:       Number(r.rentalCost),
        deposito:    Number(r.deposit),
        sucursal:    r.branch?.name ?? null,
        devolucion:  r.returnDate.toISOString().slice(0, 10),
        estado:      r.status === 'returned' ? 'devuelto' : 'activo',
        vencido:     r.status === 'active' && r.returnDate < now,
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
  consultarAlquileresEntrantes,
]
