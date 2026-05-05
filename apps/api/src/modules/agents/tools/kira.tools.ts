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

// ─── consultar_movimientos ────────────────────────────────────────────────────

function df(from?: unknown, to?: unknown) {
  const gte = from ? new Date(from as string) : undefined
  const lte = to   ? new Date(new Date(to as string).setHours(23, 59, 59, 999)) : undefined
  return (!gte && !lte) ? undefined : { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) }
}

const consultarMovimientos: AgentTool = {
  definition: {
    name: 'consultar_movimientos',
    description: 'Returns stock movement history with optional filters by product, movement type and date range. Use to audit what happened with a product.',
    input_schema: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: 'Product name or partial match' },
        productId:   { type: 'string', description: 'Exact product ID (alternative to productName)' },
        tipo:        { type: 'string', enum: ['ENTRADA', 'SALIDA', 'AJUSTE'], description: 'Movement type filter' },
        branchId:    { type: 'string', description: 'Filter by branch ID' },
        from:        { type: 'string', description: 'Start date YYYY-MM-DD (inclusive)' },
        to:          { type: 'string', description: 'End date YYYY-MM-DD (inclusive)' },
        limit:       { type: 'number', description: 'Max results (default 20, max 50)' },
      },
    },
  },

  async execute({ productName, productId, tipo, branchId, from, to, limit }, tenantId) {
    let resolvedProductId = productId as string | undefined

    if (!resolvedProductId && productName) {
      const p = await prisma.product.findFirst({
        where:  { tenantId, name: { contains: productName as string, mode: 'insensitive' } },
        select: { id: true },
      })
      if (!p) return { error: `No se encontró producto que coincida con "${String(productName)}".` }
      resolvedProductId = p.id
    }

    const take       = Math.min(50, Math.max(1, Number(limit ?? 20)))
    const dateFilter = df(from, to)

    const movements = await prisma.stockMovement.findMany({
      where: {
        product: { tenantId },
        ...(resolvedProductId ? { productId: resolvedProductId }          : {}),
        ...(tipo              ? { type: (tipo as string).toUpperCase() }   : {}),
        ...(branchId          ? { branchId: branchId as string }           : {}),
        ...(dateFilter        ? { createdAt: dateFilter }                  : {}),
      },
      include: {
        product: { select: { name: true, sku: true, unit: true } },
        branch:  { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    })

    if (movements.length === 0) return { total: 0, movimientos: [], message: 'No se encontraron movimientos con los filtros indicados.' }

    return {
      total: movements.length,
      movimientos: movements.map((m) => ({
        id:          m.id,
        producto:    m.product.name,
        sku:         m.product.sku,
        tipo:        m.type,
        cantidad:    Number(m.quantity),
        stockAntes:  Number(m.quantityBefore),
        stockDespues: Number(m.quantityAfter),
        sucursal:    m.branch.name,
        lote:        m.lotNumber ?? null,
        caducidad:   m.expiryDate ? m.expiryDate.toISOString().split('T')[0] : null,
        notas:       m.notes ?? null,
        fecha:       m.createdAt.toISOString(),
      })),
    }
  },
}

// ─── consultar_rotacion_productos ─────────────────────────────────────────────

const consultarRotacionProductos: AgentTool = {
  definition: {
    name: 'consultar_rotacion_productos',
    description: 'Returns products ranked by units moved in a date range. High rotation = high demand. Defaults to SALIDA movements as proxy for demand. Use to identify fast vs slow movers.',
    input_schema: {
      type: 'object',
      properties: {
        from:     { type: 'string', description: 'Start date YYYY-MM-DD (default: first day of current month)' },
        to:       { type: 'string', description: 'End date YYYY-MM-DD (default: today)' },
        tipo:     { type: 'string', enum: ['ENTRADA', 'SALIDA', 'AJUSTE'], description: 'Movement type to measure (default: SALIDA)' },
        branchId: { type: 'string', description: 'Filter by branch' },
        limit:    { type: 'number', description: 'Top N products (default 10, max 50)' },
      },
    },
  },

  async execute({ from, to, tipo, branchId, limit }, tenantId) {
    const now = new Date()
    const gte = from ? new Date(from as string) : new Date(now.getFullYear(), now.getMonth(), 1)
    const lte = to   ? new Date(new Date(to as string).setHours(23, 59, 59, 999)) : now
    const take = Math.min(50, Math.max(1, Number(limit ?? 10)))
    const tipoFinal = tipo ? (tipo as string).toUpperCase() : 'SALIDA'

    const grouped = await prisma.stockMovement.groupBy({
      by:    ['productId'],
      where: {
        product: { tenantId },
        type:    tipoFinal,
        createdAt: { gte, lte },
        ...(branchId ? { branchId: branchId as string } : {}),
      },
      _sum:    { quantity: true },
      _count:  { id: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take,
    })

    if (grouped.length === 0) return { total: 0, productos: [], message: 'Sin movimientos en el período indicado.' }

    const productIds = grouped.map((r) => r.productId)
    const products   = await prisma.product.findMany({
      where:  { id: { in: productIds } },
      select: { id: true, name: true, sku: true, unit: true },
    })
    const prodMap = new Map(products.map((p) => [p.id, p]))

    return {
      periodo:  { desde: gte.toISOString().split('T')[0], hasta: lte.toISOString().split('T')[0] },
      tipo:     tipoFinal,
      total:    grouped.length,
      productos: grouped.map((r, idx) => {
        const p = prodMap.get(r.productId)
        return {
          posicion:   idx + 1,
          producto:   p?.name   ?? r.productId,
          sku:        p?.sku    ?? null,
          unidades:   Number(r._sum.quantity ?? 0),
          movimientos: r._count.id,
          unidad:     p?.unit   ?? null,
        }
      }),
    }
  },
}

// ─── consultar_lotes ──────────────────────────────────────────────────────────

const consultarLotes: AgentTool = {
  definition: {
    name: 'consultar_lotes',
    description: 'Returns batches (lots) that have an expiry date within the next N days. Use to detect near-expiry inventory before it becomes a problem.',
    input_schema: {
      type: 'object',
      properties: {
        expiringInDays: { type: 'number', description: 'Show batches expiring within N days (default 30). Use 0 to see already-expired lots.' },
        branchId:       { type: 'string', description: 'Filter by branch' },
      },
    },
  },

  async execute({ expiringInDays, branchId }, tenantId) {
    const days      = expiringInDays !== undefined ? Number(expiringInDays) : 30
    const cutoff    = new Date()
    cutoff.setDate(cutoff.getDate() + days)

    const movements = await prisma.stockMovement.findMany({
      where: {
        product:    { tenantId },
        type:       'ENTRADA',
        lotNumber:  { not: null },
        expiryDate: { not: null, lte: cutoff },
        ...(branchId ? { branchId: branchId as string } : {}),
      },
      include: {
        product: { select: { name: true, sku: true, unit: true } },
        branch:  { select: { name: true } },
      },
      orderBy: { expiryDate: 'asc' },
      take: 50,
    })

    if (movements.length === 0) {
      return { total: 0, lotes: [], message: `No hay lotes con vencimiento en los próximos ${days} días.` }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return {
      total: movements.length,
      consultadoHasta: cutoff.toISOString().split('T')[0],
      lotes: movements.map((m) => {
        const expiry      = m.expiryDate!
        const diasRestantes = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000)
        return {
          producto:       m.product.name,
          sku:            m.product.sku,
          lote:           m.lotNumber!,
          caducidad:      expiry.toISOString().split('T')[0],
          diasRestantes,
          estado:         diasRestantes < 0 ? 'VENCIDO' : diasRestantes <= 7 ? 'CRÍTICO' : 'PRÓXIMO',
          cantidadEntrada: Number(m.quantity),
          unidad:         m.product.unit,
          sucursal:       m.branch.name,
        }
      }),
    }
  },
}

// ─── consultar_reporte_abc ────────────────────────────────────────────────────

const consultarReporteAbc: AgentTool = {
  definition: {
    name: 'consultar_reporte_abc',
    description: 'Returns ABC inventory classification based on stock value (quantity × sale price). A = top 80% of value, B = next 15%, C = remaining 5%. Use to prioritize management effort.',
    input_schema: {
      type: 'object',
      properties: {
        branchId: { type: 'string', description: 'Filter by branch (omit for all branches combined)' },
        limit:    { type: 'number', description: 'Max products to include (default 50)' },
      },
    },
  },

  async execute({ branchId, limit }, tenantId) {
    const take = Math.min(200, Math.max(1, Number(limit ?? 50)))

    const stocks = await prisma.stock.findMany({
      where: {
        product: { tenantId, salePrice: { gt: 0 } },
        quantity: { gt: 0 },
        ...(branchId ? { branchId: branchId as string } : {}),
      },
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true, salePrice: true } },
      },
    })

    if (stocks.length === 0) return { message: 'No hay productos con stock y precio de venta configurados.' }

    // Agrupar por producto (suma de sucursales si no se filtra)
    const byProduct = new Map<string, { name: string; sku: string; unit: string; valor: number; cantidad: number }>()
    for (const s of stocks) {
      const qty   = Number(s.quantity)
      const price = Number(s.product.salePrice ?? 0)
      const valor = qty * price
      const existing = byProduct.get(s.product.id)
      if (existing) {
        existing.valor    += valor
        existing.cantidad += qty
      } else {
        byProduct.set(s.product.id, { name: s.product.name, sku: s.product.sku, unit: s.product.unit, valor, cantidad: qty })
      }
    }

    const sorted    = [...byProduct.values()].sort((a, b) => b.valor - a.valor).slice(0, take)
    const totalValor = sorted.reduce((sum, p) => sum + p.valor, 0)

    let cumulative = 0
    const result = sorted.map((p, idx) => {
      cumulative += p.valor
      const pct        = totalValor > 0 ? (cumulative / totalValor) * 100 : 0
      const clase: 'A' | 'B' | 'C' = pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C'
      return {
        posicion:   idx + 1,
        clase,
        producto:   p.name,
        sku:        p.sku,
        cantidad:   p.cantidad,
        unidad:     p.unit,
        valorTotal: p.valor.toFixed(2),
        pctAcumulado: pct.toFixed(1) + '%',
      }
    })

    const resumen = { A: 0, B: 0, C: 0 }
    result.forEach((r) => resumen[r.clase]++)

    return {
      totalProductos: result.length,
      valorTotalInventario: totalValor.toFixed(2),
      resumen,
      productos: result,
    }
  },
}

// ─── Catálogo KIRA ────────────────────────────────────────────────────────────

export const KIRA_TOOLS: AgentTool[] = [
  consultarStock,
  listarAlertasActivas,
  registrarMovimiento,
  alertarEquipo,
  crearSolicitudCompra,
  consultarMovimientos,
  consultarRotacionProductos,
  consultarLotes,
  consultarReporteAbc,
]
