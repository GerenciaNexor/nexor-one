import type { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import type { CreatePurchaseOrderInput, UpdatePurchaseOrderInput, PurchaseOrderQuery, ReceivePurchaseOrderInput, FromAlertInput } from './schema'

// ─── Estado válido ────────────────────────────────────────────────────────────

const CANCELABLE_STATES  = new Set(['draft', 'pending_approval', 'approved', 'sent', 'partial'])

// ─── Select ───────────────────────────────────────────────────────────────────

const PO_LIST_SELECT = {
  id:              true,
  orderNumber:     true,
  status:          true,
  subtotal:        true,
  tax:             true,
  total:           true,
  expectedDelivery: true,
  createdAt:       true,
  updatedAt:       true,
  supplier: { select: { id: true, name: true } },
  branch:   { select: { id: true, name: true } },
  creator:  { select: { id: true, name: true } },
  approver: { select: { id: true, name: true } },
  _count:   { select: { items: true } },
} as const

const PO_DETAIL_SELECT = {
  id:               true,
  orderNumber:      true,
  status:           true,
  subtotal:         true,
  tax:              true,
  total:            true,
  expectedDelivery: true,
  deliveredAt:      true,
  notes:            true,
  createdAt:        true,
  updatedAt:        true,
  supplier: { select: { id: true, name: true, taxId: true, contactName: true, email: true, phone: true } },
  branch:   { select: { id: true, name: true } },
  creator:  { select: { id: true, name: true } },
  approver: { select: { id: true, name: true } },
  items: {
    select: {
      id:               true,
      quantityOrdered:  true,
      quantityReceived: true,
      unitCost:         true,
      total:            true,
      product: { select: { id: true, sku: true, name: true, unit: true } },
    },
  },
} as const

// ─── Conversión Decimal → number ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toApiPO(po: any) {
  return {
    ...po,
    subtotal: parseFloat(String(po.subtotal)),
    tax:      parseFloat(String(po.tax)),
    total:    parseFloat(String(po.total)),
    items:    po.items?.map((item: Record<string, unknown>) => ({
      ...item,
      quantityOrdered:  parseFloat(String(item['quantityOrdered'])),
      quantityReceived: parseFloat(String(item['quantityReceived'])),
      unitCost:         parseFloat(String(item['unitCost'])),
      total:            parseFloat(String(item['total'])),
    })),
  }
}

// ─── Generación de número de OC — OC-YYYY-NNN ────────────────────────────────

async function generateOrderNumber(tenantId: string): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `OC-${year}-`

  const last = await prisma.purchaseOrder.findFirst({
    where:   { tenantId, orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' },
    select:  { orderNumber: true },
  })

  const seq  = last ? parseInt(last.orderNumber.slice(prefix.length), 10) : 0
  const next = seq + 1
  return `${prefix}${String(next).padStart(3, '0')}`
}

// ─── Cálculo de totales ───────────────────────────────────────────────────────

function calculateTotals(items: { quantityOrdered: number; unitCost: number }[], taxRate: number) {
  const subtotal = items.reduce((acc, i) => acc + i.quantityOrdered * i.unitCost, 0)
  const tax      = subtotal * (taxRate / 100)
  const total    = subtotal + tax
  return { subtotal, tax, total }
}

// ─── Operaciones ──────────────────────────────────────────────────────────────

export async function listPurchaseOrders(tenantId: string, query: PurchaseOrderQuery) {
  const data = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      ...(query.status     ? { status:     query.status }     : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.branchId   ? { branchId:   query.branchId }   : {}),
    },
    select:  PO_LIST_SELECT,
    orderBy: { createdAt: 'desc' },
  })
  return { data: data.map(toApiPO), total: data.length }
}

export async function getPurchaseOrder(tenantId: string, id: string) {
  const po = await prisma.purchaseOrder.findFirst({
    where:  { id, tenantId },
    select: PO_DETAIL_SELECT,
  })
  if (!po) throw { statusCode: 404, message: 'Orden de compra no encontrada', code: 'NOT_FOUND' }
  return toApiPO(po)
}

export async function createPurchaseOrder(
  tenantId: string,
  userId: string,
  input: CreatePurchaseOrderInput,
) {
  const orderNumber           = await generateOrderNumber(tenantId)
  const { subtotal, tax, total } = calculateTotals(input.items, input.taxRate)

  const po = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      supplierId:       input.supplierId,
      branchId:         input.branchId,
      createdBy:        userId,
      orderNumber,
      status:           'draft',
      subtotal,
      tax,
      total,
      expectedDelivery: input.expectedDelivery ? new Date(input.expectedDelivery) : undefined,
      notes:            input.notes,
      items: {
        create: input.items.map((item) => ({
          productId:       item.productId,
          quantityOrdered: item.quantityOrdered,
          unitCost:        item.unitCost,
          total:           item.quantityOrdered * item.unitCost,
        })),
      },
    },
    select: PO_DETAIL_SELECT,
  })
  return toApiPO(po)
}

export async function updatePurchaseOrder(
  tenantId: string,
  id: string,
  input: UpdatePurchaseOrderInput,
) {
  const existing = await prisma.purchaseOrder.findFirst({
    where:  { id, tenantId },
    select: { id: true, status: true },
  })
  if (!existing) throw { statusCode: 404, message: 'Orden de compra no encontrada', code: 'NOT_FOUND' }
  if (existing.status !== 'draft') {
    throw { statusCode: 409, message: 'Solo se pueden editar órdenes en borrador', code: 'INVALID_STATUS' }
  }

  const totals = input.items
    ? calculateTotals(input.items, input.taxRate ?? 0)
    : undefined

  const po = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (input.items) {
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } })
    }
    return tx.purchaseOrder.update({
      where: { id },
      data: {
        ...(input.supplierId !== undefined && { supplierId: input.supplierId }),
        ...(input.branchId   !== undefined && { branchId:   input.branchId ?? null }),
        ...(input.expectedDelivery !== undefined && {
          expectedDelivery: input.expectedDelivery ? new Date(input.expectedDelivery) : null,
        }),
        ...(input.notes !== undefined && { notes: input.notes ?? null }),
        ...(totals && { subtotal: totals.subtotal, tax: totals.tax, total: totals.total }),
        ...(input.items && {
          items: {
            create: input.items.map((item) => ({
              productId:       item.productId,
              quantityOrdered: item.quantityOrdered,
              unitCost:        item.unitCost,
              total:           item.quantityOrdered * item.unitCost,
            })),
          },
        }),
      },
      select: PO_DETAIL_SELECT,
    })
  })
  return toApiPO(po)
}

export async function submitForApproval(tenantId: string, id: string) {
  const existing = await prisma.purchaseOrder.findFirst({
    where:  { id, tenantId },
    select: { id: true, status: true, supplierId: true, _count: { select: { items: true } } },
  })
  if (!existing) throw { statusCode: 404, message: 'Orden de compra no encontrada', code: 'NOT_FOUND' }
  if (existing.status !== 'draft') {
    throw { statusCode: 409, message: 'Solo borradores pueden enviarse a aprobación', code: 'INVALID_STATUS' }
  }
  if (!existing.supplierId) {
    throw { statusCode: 400, message: 'Asigna un proveedor antes de enviar la orden a aprobación', code: 'NO_SUPPLIER' }
  }
  if (existing._count.items === 0) {
    throw { statusCode: 400, message: 'La orden no tiene productos', code: 'EMPTY_ORDER' }
  }

  const po = await prisma.purchaseOrder.update({
    where:  { id },
    data:   { status: 'pending_approval' },
    select: PO_DETAIL_SELECT,
  })
  return toApiPO(po)
}

export async function approvePurchaseOrder(
  tenantId: string,
  id: string,
  approverId: string,
) {
  const existing = await prisma.purchaseOrder.findFirst({
    where:  { id, tenantId },
    select: {
      id: true, status: true, orderNumber: true,
      total: true, branchId: true, createdBy: true,
      supplier: { select: { name: true } },
    },
  })
  if (!existing) throw { statusCode: 404, message: 'Orden de compra no encontrada', code: 'NOT_FOUND' }
  if (existing.status !== 'pending_approval') {
    throw { statusCode: 409, message: 'Solo OC pendientes de aprobación pueden aprobarse', code: 'INVALID_STATUS' }
  }

  const approver = await prisma.user.findFirst({
    where:  { id: approverId },
    select: { name: true },
  })

  const po = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. Aprobar la OC
    const updated = await tx.purchaseOrder.update({
      where:  { id },
      data:   { status: 'approved', approvedBy: approverId },
      select: PO_DETAIL_SELECT,
    })

    // 2. Generar egreso en VERA
    await tx.transaction.create({
      data: {
        tenantId,
        branchId:      existing.branchId ?? null,
        type:          'expense',
        amount:        existing.total,
        currency:      'COP',
        description:   `Orden de compra ${existing.orderNumber}${existing.supplier ? ` — ${existing.supplier.name}` : ''}`,
        category:      'Compras',
        referenceType: 'purchase_order',
        referenceId:   id,
        date:          new Date(),
      },
    })

    // 3. Notificar al comprador que creó la OC
    await tx.notification.create({
      data: {
        tenantId,
        userId:  existing.createdBy,
        module:  'NIRA',
        type:    'OC_APROBADA',
        title:   `Orden ${existing.orderNumber} aprobada`,
        message: `Tu orden de compra ${existing.orderNumber} fue aprobada${approver ? ` por ${approver.name}` : ''}.`,
        link:    `/nira/purchase-orders/${id}`,
      },
    })

    return updated
  })
  return toApiPO(po)
}

export async function cancelPurchaseOrder(tenantId: string, id: string) {
  const existing = await prisma.purchaseOrder.findFirst({
    where:  { id, tenantId },
    select: { id: true, status: true, orderNumber: true },
  })
  if (!existing) throw { statusCode: 404, message: 'Orden de compra no encontrada', code: 'NOT_FOUND' }
  if (!CANCELABLE_STATES.has(existing.status)) {
    throw { statusCode: 409, message: 'Esta orden no puede cancelarse en su estado actual', code: 'INVALID_STATUS' }
  }

  const wasApproved = ['approved', 'sent', 'partial'].includes(existing.status)

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.purchaseOrder.update({
      where: { id },
      data:  { status: 'cancelled' },
    })

    // Revertir egreso en VERA si ya había sido aprobada
    if (wasApproved) {
      await tx.transaction.deleteMany({
        where: { referenceType: 'purchase_order', referenceId: id },
      })
    }
  })

  return { id: existing.id, orderNumber: existing.orderNumber, status: 'cancelled' }
}

// ─── HU-041: Recepción de mercancía ──────────────────────────────────────────

const RECEIVABLE_STATES = new Set(['approved', 'sent', 'partial'])

export async function receivePurchaseOrder(
  tenantId: string,
  userId:   string,
  id:       string,
  input:    ReceivePurchaseOrderInput,
) {
  // 1. Cargar OC con sus líneas
  const po = await prisma.purchaseOrder.findFirst({
    where:  { id, tenantId },
    select: {
      id: true, status: true, orderNumber: true, branchId: true,
      items: {
        select: {
          id:               true,
          productId:        true,
          quantityOrdered:  true,
          quantityReceived: true,
        },
      },
    },
  })
  if (!po) throw { statusCode: 404, message: 'Orden de compra no encontrada', code: 'NOT_FOUND' }
  if (!RECEIVABLE_STATES.has(po.status)) {
    throw {
      statusCode: 409,
      message:    'Solo se puede registrar recepción en OC aprobadas, enviadas o con recepción parcial',
      code:       'INVALID_STATUS',
    }
  }
  if (!po.branchId) {
    throw {
      statusCode: 400,
      message:    'La OC no tiene sucursal asignada. Edita la OC y asigna una sucursal antes de registrar recepción.',
      code:       'NO_BRANCH',
    }
  }

  // Tipo local para los ítems de la OC cargados antes de la transacción
  type POItemRow = { id: string; productId: string; quantityOrdered: unknown; quantityReceived: unknown }
  const poItems = po.items as POItemRow[]

  // 2. Validar cada línea del input
  for (const incoming of input.items) {
    const line = poItems.find((i: POItemRow) => i.id === incoming.purchaseOrderItemId)
    if (!line) {
      throw { statusCode: 400, message: `Línea ${incoming.purchaseOrderItemId} no pertenece a esta OC`, code: 'ITEM_NOT_FOUND' }
    }
    const ordered     = parseFloat(String(line.quantityOrdered))
    const alreadyRecv = parseFloat(String(line.quantityReceived))
    const maxPending  = ordered - alreadyRecv
    if (incoming.quantityReceived > maxPending + 0.0001) { // margen de float
      throw {
        statusCode: 400,
        message:    `La cantidad recibida (${incoming.quantityReceived}) supera la cantidad pendiente (${maxPending.toFixed(2)})`,
        code:       'EXCEEDS_ORDERED',
      }
    }
  }

  const branchId = po.branchId

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 3. Por cada línea: upsert stock + crear stock_movement + actualizar quantity_received
    for (const incoming of input.items) {
      const line = poItems.find((i: POItemRow) => i.id === incoming.purchaseOrderItemId)!

      // Leer stock actual
      const stockRecord = await tx.stock.findUnique({
        where:  { productId_branchId: { productId: line.productId, branchId } },
        select: { quantity: true },
      })
      const qtyBefore = stockRecord ? parseFloat(String(stockRecord.quantity)) : 0
      const qtyAfter  = qtyBefore + incoming.quantityReceived

      // Actualizar stock
      await tx.stock.upsert({
        where:  { productId_branchId: { productId: line.productId, branchId } },
        create: { productId: line.productId, branchId, quantity: qtyAfter },
        update: { quantity: qtyAfter },
      })

      // Movimiento inmutable (APPEND-ONLY, igual que createMovement en KIRA)
      await tx.stockMovement.create({
        data: {
          tenantId,
          productId:      line.productId,
          branchId,
          userId,
          type:           'entrada',
          quantity:       incoming.quantityReceived,
          quantityBefore: qtyBefore,
          quantityAfter:  qtyAfter,
          referenceType:  'purchase_order',
          referenceId:    id,
          notes:          `Recepción OC ${po.orderNumber}`,
        },
      })

      // Actualizar cantidad recibida en la línea de la OC
      const newQtyReceived = parseFloat(String(line.quantityReceived)) + incoming.quantityReceived
      await tx.purchaseOrderItem.update({
        where: { id: incoming.purchaseOrderItemId },
        data:  { quantityReceived: newQtyReceived },
      })
    }

    // 4. Determinar nuevo estado leyendo las líneas actualizadas
    const updatedItems = await tx.purchaseOrderItem.findMany({
      where:  { purchaseOrderId: id },
      select: { quantityOrdered: true, quantityReceived: true },
    })
    const allReceived = updatedItems.every((item: { quantityOrdered: unknown; quantityReceived: unknown }) => {
      const ordered  = parseFloat(String(item.quantityOrdered))
      const received = parseFloat(String(item.quantityReceived))
      return received >= ordered - 0.0001
    })
    const newStatus = allReceived ? 'received' : 'partial'

    // 5. Actualizar OC
    const updated = await tx.purchaseOrder.update({
      where:  { id },
      data:   { status: newStatus, ...(allReceived ? { deliveredAt: new Date() } : {}) },
      select: PO_DETAIL_SELECT,
    })

    // 6. Notificar al AREA_MANAGER del módulo KIRA
    const kiraManagers = await tx.user.findMany({
      where:  { tenantId, role: 'AREA_MANAGER', module: 'KIRA', isActive: true },
      select: { id: true },
    })
    if (kiraManagers.length > 0) {
      await tx.notification.createMany({
        data: kiraManagers.map((u: { id: string }) => ({
          tenantId,
          userId:  u.id,
          module:  'KIRA' as const,
          type:    'STOCK_RECIBIDO',
          title:   'Nueva entrada de stock',
          message: `Se recibió mercancía de la OC ${po.orderNumber}. El inventario ha sido actualizado.`,
          link:    `/nira/purchase-orders/${id}`,
        })),
      })
    }

    return toApiPO(updated)
  })
}

// ─── HU-044: Borrador automático desde alerta de stock crítico ────────────────

export async function createPurchaseOrderFromAlert(
  tenantId: string,
  userId:   string,
  input:    FromAlertInput,
) {
  const { productId, branchId } = input

  // 1. Cargar producto (debe pertenecer al tenant y estar activo)
  const product = await prisma.product.findFirst({
    where:  { id: productId, tenantId, isActive: true },
    select: { id: true, name: true, sku: true, minStock: true, maxStock: true, costPrice: true },
  })
  if (!product) {
    throw { statusCode: 404, message: 'Producto no encontrado', code: 'NOT_FOUND' }
  }

  // 2. Stock actual en la sucursal
  const stockRecord = await prisma.stock.findUnique({
    where:  { productId_branchId: { productId, branchId } },
    select: { quantity: true },
  })
  const currentQty = stockRecord ? parseFloat(String(stockRecord.quantity)) : 0

  // 3. Cantidad sugerida: maxStock - currentQty  |  fallback: minStock * 2
  const rawSuggested = product.maxStock != null
    ? product.maxStock - currentQty
    : product.minStock * 2
  const suggestedQty = Math.max(1, Math.ceil(rawSuggested))

  // 4. Mejor proveedor con historial para este producto en el tenant
  //    Ordena por overallScore DESC; si no hay score, va al final.
  const pastOrders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      status:    'received',
      supplierId: { not: null },
      items:     { some: { productId } },
    },
    select: {
      supplierId: true,
      supplier: {
        select: {
          id:      true,
          isActive: true,
          score:   { select: { overallScore: true } },
        },
      },
    },
    distinct: ['supplierId'],
  })

  // Ordenar por score DESC (activos primero, luego los sin score)
  const candidates = pastOrders
    .filter((po) => po.supplier?.isActive)
    .sort((a, b) => {
      const aScore = a.supplier?.score?.overallScore != null
        ? parseFloat(String(a.supplier.score.overallScore)) : -1
      const bScore = b.supplier?.score?.overallScore != null
        ? parseFloat(String(b.supplier.score.overallScore)) : -1
      return bScore - aScore
    })

  const bestSupplierId = candidates[0]?.supplierId ?? null

  // 5. Último precio de compra del mejor proveedor para este producto
  let unitCost = product.costPrice ? parseFloat(String(product.costPrice)) : 0
  if (bestSupplierId) {
    const lastItem = await prisma.purchaseOrderItem.findFirst({
      where:   { productId, purchaseOrder: { supplierId: bestSupplierId, tenantId, status: 'received' } },
      orderBy: { purchaseOrder: { createdAt: 'desc' } },
      select:  { unitCost: true },
    })
    if (lastItem) unitCost = parseFloat(String(lastItem.unitCost))
  }

  // 6. Crear el borrador
  const orderNumber = await generateOrderNumber(tenantId)
  const lineTotal   = suggestedQty * unitCost

  const po = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      supplierId: bestSupplierId,
      branchId,
      createdBy:  userId,
      orderNumber,
      status:     'draft',
      subtotal:   lineTotal,
      tax:        0,
      total:      lineTotal,
      notes:      `Borrador automático — reabastecimiento de ${product.name}. Stock actual: ${currentQty}.`,
      items: {
        create: [{
          productId,
          quantityOrdered: suggestedQty,
          unitCost,
          total: lineTotal,
        }],
      },
    },
    select: PO_DETAIL_SELECT,
  })

  return {
    ...toApiPO(po),
    suggestedSupplierFound: bestSupplierId !== null,
  }
}
