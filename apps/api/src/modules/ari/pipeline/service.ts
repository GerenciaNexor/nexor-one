import type { Prisma } from '@prisma/client'
import type { Role } from '@nexor/shared'
import { prisma } from '../../../lib/prisma'
import { hasMinRole } from '../../../lib/guards'
import type {
  CreateStageInput,
  UpdateStageInput,
  ReorderStagesInput,
  CreateDealInput,
  MoveDealInput,
  UpdateDealInput,
  DealQuery,
  RateClientInput,
} from './schema'

// ─── Selects ──────────────────────────────────────────────────────────────────

const STAGE_SELECT = {
  id:          true,
  name:        true,
  order:       true,
  color:       true,
  isFinalWon:  true,
  isFinalLost: true,
  createdAt:   true,
  _count: { select: { deals: true } },
} as const

const DEAL_SELECT = {
  id:            true,
  title:         true,
  value:         true,
  probability:   true,
  expectedClose: true,
  lostReason:    true,
  closedAt:      true,
  createdAt:     true,
  updatedAt:     true,
  client:       { select: { id: true, name: true, company: true } },
  stage:        { select: { id: true, name: true, color: true, isFinalWon: true, isFinalLost: true } },
  assignedUser: { select: { id: true, name: true } },
  branch:       { select: { id: true, name: true } },
} as const

// ─── Helper — Decimal → number ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDeal(deal: any) {
  return {
    ...deal,
    value:      deal.value != null ? parseFloat(String(deal.value)) : null,
    // Aliases planos para la ficha de cliente (DealSummary)
    stageName:  deal.stage?.name  ?? null,
    stageColor: deal.stage?.color ?? null,
  }
}

// =============================================================================
// ETAPAS
// =============================================================================

export async function listStages(tenantId: string) {
  const stages = await prisma.pipelineStage.findMany({
    where:   { tenantId },
    orderBy: { order: 'asc' },
    select:  STAGE_SELECT,
  })
  return { data: stages, total: stages.length }
}

export async function createStage(tenantId: string, input: CreateStageInput) {
  const last = await prisma.pipelineStage.findFirst({
    where:   { tenantId },
    orderBy: { order: 'desc' },
    select:  { order: true },
  })
  const order = (last?.order ?? 0) + 1

  return prisma.pipelineStage.create({
    data: {
      tenantId,
      name:        input.name,
      color:       input.color ?? null,
      isFinalWon:  input.isFinalWon,
      isFinalLost: input.isFinalLost,
      order,
    },
    select: STAGE_SELECT,
  })
}

export async function updateStage(tenantId: string, stageId: string, input: UpdateStageInput) {
  const existing = await prisma.pipelineStage.findFirst({
    where:  { id: stageId, tenantId },
    select: { id: true },
  })
  if (!existing) throw { statusCode: 404, message: 'Etapa no encontrada', code: 'NOT_FOUND' }

  return prisma.pipelineStage.update({
    where: { id: stageId },
    data: {
      ...(input.name        !== undefined && { name:        input.name }),
      ...(input.color       !== undefined && { color:       input.color ?? null }),
      ...(input.isFinalWon  !== undefined && { isFinalWon:  input.isFinalWon }),
      ...(input.isFinalLost !== undefined && { isFinalLost: input.isFinalLost }),
      ...(input.order       !== undefined && { order:       input.order }),
    },
    select: STAGE_SELECT,
  })
}

export async function deleteStage(tenantId: string, stageId: string) {
  const count = await prisma.pipelineStage.count({ where: { tenantId } })
  if (count <= 1) {
    throw {
      statusCode: 422,
      message:    'No es posible eliminar la única etapa del pipeline. El pipeline debe tener al menos una etapa.',
      code:       'LAST_STAGE',
    }
  }

  const existing = await prisma.pipelineStage.findFirst({
    where:  { id: stageId, tenantId },
    select: { id: true, _count: { select: { deals: true } } },
  })
  if (!existing) throw { statusCode: 404, message: 'Etapa no encontrada', code: 'NOT_FOUND' }

  if (existing._count.deals > 0) {
    throw {
      statusCode: 409,
      message:    `Esta etapa tiene ${existing._count.deals} deal(s). Muévelos a otra etapa antes de eliminarla.`,
      code:       'STAGE_HAS_DEALS',
    }
  }

  await prisma.pipelineStage.delete({ where: { id: stageId } })
  return { id: stageId, deleted: true }
}

export async function reorderStages(tenantId: string, input: ReorderStagesInput) {
  const stageIds  = input.stages.map((s) => s.id)
  const existing  = await prisma.pipelineStage.findMany({
    where:  { tenantId, id: { in: stageIds } },
    select: { id: true },
  })
  if (existing.length !== stageIds.length) {
    throw { statusCode: 400, message: 'Alguna etapa no pertenece a este tenant', code: 'INVALID_STAGE' }
  }

  await prisma.$transaction(
    input.stages.map((s) =>
      prisma.pipelineStage.update({
        where: { id: s.id },
        data:  { order: s.order },
      }),
    ),
  )

  return listStages(tenantId)
}

// =============================================================================
// DEALS
// =============================================================================

export async function listDeals(
  tenantId: string,
  userId:   string,
  role:     Role,
  query:    DealQuery,
  branchFilter?: string,
) {
  const isManager = hasMinRole(role, 'AREA_MANAGER')

  // HU-133 — rango inclusivo sobre createdAt a partir de fechas YYYY-MM-DD.
  const createdAt = (query.from || query.to)
    ? {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00`) } : {}),
        ...(query.to   ? { lte: new Date(`${query.to}T23:59:59.999`) } : {}),
      }
    : undefined

  const where: Prisma.DealWhereInput = {
    tenantId,
    // OPERATIVE solo ve los deals que tiene asignados
    ...(!isManager ? { assignedTo: userId } : {}),
    // HU-133 — respeta sucursal (getBranchFilter): admin = todas; los demás su sucursal.
    ...(branchFilter ? { branchId: branchFilter } : {}),
    ...(query.stageId    ? { stageId:    query.stageId }    : {}),
    ...(query.clientId   ? { clientId:   query.clientId }   : {}),
    ...(query.assignedTo ? { assignedTo: query.assignedTo } : {}),
    ...(createdAt ? { createdAt } : {}),
  }

  const deals = await prisma.deal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select:  DEAL_SELECT,
  })
  return { data: deals.map(toDeal), total: deals.length }
}

// HU-155 — detalle completo del negocio/venta. Respeta rol y sucursal: un no-manager solo abre
// sus deals asignados, y el filtro de sucursal acota igual que el listado (si no cumple → 404).
export async function getDeal(
  tenantId: string,
  dealId:   string,
  userId:   string,
  role:     Role,
  branchFilter?: string,
) {
  const isManager = hasMinRole(role, 'AREA_MANAGER')
  const deal = await prisma.deal.findFirst({
    where: {
      id: dealId,
      tenantId,
      ...(!isManager ? { assignedTo: userId } : {}),
      ...(branchFilter ? { branchId: branchFilter } : {}),
    },
    select: {
      ...DEAL_SELECT,
      lostReason: true,
      // Cliente enriquecido (para enlazar a su ficha con contacto básico)
      client: { select: { id: true, name: true, company: true, email: true, phone: true } },
      // Cotizaciones vinculadas al negocio
      quotes: {
        select: { id: true, quoteNumber: true, status: true, total: true, validUntil: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
      // Interacciones / notas del negocio (las más recientes)
      interactions: {
        select: { id: true, type: true, direction: true, content: true, createdAt: true, user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      },
    },
  })
  if (!deal) throw { statusCode: 404, message: 'Deal no encontrado', code: 'NOT_FOUND' }

  return {
    ...toDeal(deal),
    quotes: (deal as { quotes: { total: unknown }[] }).quotes.map((q) => ({
      ...q,
      total: q.total != null ? parseFloat(String(q.total)) : null,
    })),
  }
}

// HU-155 — edición de los datos del negocio (no la etapa). Respeta rol/sucursal como getDeal.
export async function updateDeal(
  tenantId: string,
  dealId:   string,
  input:    UpdateDealInput,
  userId:   string,
  role:     Role,
  branchFilter?: string,
) {
  const isManager = hasMinRole(role, 'AREA_MANAGER')
  const existing = await prisma.deal.findFirst({
    where: {
      id: dealId,
      tenantId,
      ...(!isManager ? { assignedTo: userId } : {}),
      ...(branchFilter ? { branchId: branchFilter } : {}),
    },
    select: { id: true },
  })
  if (!existing) throw { statusCode: 404, message: 'Deal no encontrado', code: 'NOT_FOUND' }

  // Si cambia el cliente, validar que sea del tenant.
  if (input.clientId) {
    const client = await prisma.client.findFirst({ where: { id: input.clientId, tenantId }, select: { id: true } })
    if (!client) throw { statusCode: 404, message: 'Cliente no encontrado', code: 'NOT_FOUND' }
  }

  const deal = await prisma.deal.update({
    where: { id: dealId },
    data: {
      ...(input.clientId      !== undefined && { clientId:      input.clientId }),
      ...(input.title         !== undefined && { title:         input.title }),
      ...(input.assignedTo    !== undefined && { assignedTo:    input.assignedTo }),
      ...(input.branchId      !== undefined && { branchId:      input.branchId }),
      ...(input.value         !== undefined && { value:         input.value }),
      ...(input.probability   !== undefined && { probability:   input.probability }),
      ...(input.expectedClose !== undefined && { expectedClose: input.expectedClose ? new Date(input.expectedClose) : null }),
    },
    select: DEAL_SELECT,
  })
  return toDeal(deal)
}

export async function createDeal(tenantId: string, input: CreateDealInput) {
  const client = await prisma.client.findFirst({
    where:  { id: input.clientId, tenantId },
    select: { id: true },
  })
  if (!client) throw { statusCode: 404, message: 'Cliente no encontrado', code: 'NOT_FOUND' }

  const stage = await prisma.pipelineStage.findFirst({
    where:  { id: input.stageId, tenantId },
    select: { id: true },
  })
  if (!stage) throw { statusCode: 404, message: 'Etapa no encontrada', code: 'NOT_FOUND' }

  const deal = await prisma.deal.create({
    data: {
      tenantId,
      clientId:      input.clientId,
      stageId:       input.stageId,
      title:         input.title,
      assignedTo:    input.assignedTo    ?? null,
      branchId:      input.branchId      ?? null,
      value:         input.value         ?? null,
      probability:   input.probability   ?? null,
      expectedClose: input.expectedClose ? new Date(input.expectedClose) : null,
    },
    select: DEAL_SELECT,
  })
  return toDeal(deal)
}

// ─── HU-128: descuento de inventario al cerrar una venta (deal ganado) ────────
// Toma las líneas con producto de la cotización ACEPTADA vinculada al deal y crea un
// stock_movement de salida (motivo='venta') por cada una, congelando precio de venta
// (de la línea) y costo (del producto). BLOQUEA si falta stock — no se vende sin existencias.
// Si el deal ganado no tiene cotización itemizada, no hay impacto de inventario (venta sin itemizar).
async function fulfillSaleInventory(
  tx:       Prisma.TransactionClient,
  tenantId: string,
  dealId:   string,
  branchId: string | null,
  userId:   string,
): Promise<void> {
  const quote = await tx.quote.findFirst({
    where:   { tenantId, dealId, status: 'accepted' },
    orderBy: { updatedAt: 'desc' },
    select:  { items: { where: { productId: { not: null } }, select: { productId: true, quantity: true, unitPrice: true } } },
  })
  const items = quote?.items ?? []
  if (items.length === 0) return

  if (!branchId) {
    throw { statusCode: 400, message: 'Asigna una sucursal al negocio para descontar inventario al cerrar la venta.', code: 'BRANCH_REQUIRED' }
  }

  // Pasada 1 — VALIDAR todo el stock (solo lecturas). Si falta para cualquier línea → 409
  // y no se escribe NADA (importante por la reutilización de la tx por-request).
  const plan: { productId: string; qty: number; before: number; after: number; salePrice: number; costPrice: number | null }[] = []
  for (const item of items) {
    const productId = item.productId as string
    const qty       = parseFloat(String(item.quantity))
    const product   = await tx.product.findFirst({ where: { id: productId, tenantId }, select: { name: true, costPrice: true } })
    if (!product) continue

    // HU-158 — la venta toma del DISPONIBLE (total − alquilado), nunca de unidades alquiladas.
    // El descuento reduce el TOTAL (salida definitiva); el disponible resultante sigue ≥ 0
    // porque disponible = total − alquilado ≥ qty ⇒ total − qty ≥ alquilado.
    const stock     = await tx.stock.findUnique({ where: { productId_branchId: { productId, branchId } }, select: { quantity: true, rentedQuantity: true } })
    const before    = stock ? parseFloat(String(stock.quantity)) : 0
    const rented    = stock ? parseFloat(String(stock.rentedQuantity)) : 0
    const available = Math.max(0, before - rented)
    if (available < qty) {
      throw {
        statusCode: 409,
        message:    `Stock insuficiente para "${product.name}": disponible ${available}${rented > 0 ? ` (de ${before}, ${rented} alquilado)` : ''}, requerido ${qty}. No se puede cerrar la venta sin existencias disponibles.`,
        code:       'INSUFFICIENT_STOCK',
      }
    }
    plan.push({ productId, qty, before, after: before - qty, salePrice: parseFloat(String(item.unitPrice)), costPrice: product.costPrice != null ? parseFloat(String(product.costPrice)) : null })
  }

  // Pasada 2 — APLICAR (descontar + movimiento de salida con motivo y precios congelados).
  for (const p of plan) {
    await tx.stock.update({ where: { productId_branchId: { productId: p.productId, branchId } }, data: { quantity: p.after } })
    await tx.stockMovement.create({
      data: {
        tenantId, productId: p.productId, branchId, userId,
        type:            'salida',
        reason:          'venta',
        quantity:        p.qty,
        quantityBefore:  p.before,
        quantityAfter:   p.after,
        referenceType:   'deal',
        referenceId:     dealId,
        salePriceFrozen: p.salePrice,
        costPriceFrozen: p.costPrice,
        notes:           'Venta — deal ganado',
      },
    })
  }
}

export async function moveDeal(
  tenantId:    string,
  dealId:      string,
  input:       MoveDealInput,
  actorUserId: string,
) {
  const deal = await prisma.deal.findFirst({
    where:  { id: dealId, tenantId },
    select: {
      id:         true,
      title:      true,
      value:      true,
      branchId:   true,
      assignedTo: true,
      stage:      { select: { isFinalWon: true } },   // HU-128 — para detectar la transición a ganado
    },
  })
  if (!deal) throw { statusCode: 404, message: 'Deal no encontrado', code: 'NOT_FOUND' }

  const newStage = await prisma.pipelineStage.findFirst({
    where:  { id: input.stageId, tenantId },
    select: { id: true, name: true, isFinalWon: true, isFinalLost: true },
  })
  if (!newStage) throw { statusCode: 404, message: 'Etapa no encontrada', code: 'NOT_FOUND' }

  const isClosed = newStage.isFinalWon || newStage.isFinalLost

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // HU-128 — inventario ANTES de cambiar la etapa: fulfillSaleInventory VALIDA todo el stock
    // primero y solo entonces escribe; si falta, lanza 409 sin haber escrito nada (clave bajo el
    // wrapper de tx por-request, que comitearía writes parciales si el 409 se captura en la ruta).
    // Solo al ENTRAR a ganado (no si ya estaba) → evita doble descuento. No se vende sin existencias.
    if (newStage.isFinalWon && !deal.stage?.isFinalWon) {
      await fulfillSaleInventory(tx, tenantId, dealId, deal.branchId, actorUserId)
    }

    // 1. Actualizar etapa del deal
    const updated = await tx.deal.update({
      where: { id: dealId },
      data: {
        stageId:    input.stageId,
        lostReason: newStage.isFinalLost ? (input.lostReason ?? null) : null,
        closedAt:   isClosed ? new Date() : null,
      },
      select: DEAL_SELECT,
    })

    // 2. Si la etapa es "Ganado" → ingreso en VERA
    if (newStage.isFinalWon) {
      const amount = deal.value ? parseFloat(String(deal.value)) : 0
      if (amount > 0) {
        const ventasCat = await tx.transactionCategory.findFirst({
          where:  { tenantId, name: 'Ventas', isActive: true },
          select: { id: true },
        })
        await tx.transaction.create({
          data: {
            tenantId,
            branchId:      deal.branchId ?? null,
            categoryId:    ventasCat?.id ?? null,
            type:          'income',
            amount,
            currency:      'COP',
            description:   `Deal ganado: ${deal.title}`,
            category:      'Ventas',
            referenceType: 'deal',
            referenceId:   dealId,
            date:          new Date(),
          },
        })
      }

      // 3. Notificación in-app al vendedor asignado
      if (deal.assignedTo) {
        await tx.notification.create({
          data: {
            tenantId,
            userId:  deal.assignedTo,
            module:  'ARI',
            type:    'DEAL_GANADO',
            title:   '¡Deal ganado!',
            message: `El deal "${deal.title}" avanzó a la etapa "${newStage.name}".`,
            link:    '/ari/pipeline',
          },
        })
      }
    }

    return toDeal(updated)
  })
}

// ─── HU-126: calificación interna del cliente al cerrar la venta (deal ganado) ─
// Disparador: deal en etapa GANADA (isFinalWon). Opcional — no bloquea el cierre.
// Una calificación por deal (upsert). Calificación INTERNA del equipo, NO es CSAT.

export async function rateClientForDeal(
  tenantId: string,
  userId:   string,
  dealId:   string,
  input:    RateClientInput,
) {
  const deal = await prisma.deal.findFirst({
    where:  { id: dealId, tenantId },
    select: { id: true, clientId: true, stage: { select: { isFinalWon: true } } },
  })
  if (!deal) throw { statusCode: 404, message: 'Deal no encontrado', code: 'NOT_FOUND' }
  if (!deal.stage.isFinalWon) {
    throw { statusCode: 400, message: 'Solo se califica al cliente de una venta ganada (deal en etapa ganada)', code: 'INVALID_STATE' }
  }

  const rating = await prisma.clientRating.upsert({
    where:  { dealId },
    create: { tenantId, clientId: deal.clientId, dealId, rating: input.rating, notes: input.notes ?? null, ratedBy: userId },
    update: { rating: input.rating, notes: input.notes ?? null, ratedBy: userId },
    select: { id: true, rating: true, notes: true, createdAt: true },
  })

  return { success: true, rating, mensaje: 'Calificación interna del cliente registrada.' }
}

// =============================================================================
// BOOTSTRAP — etapas por defecto al activar ARI
// =============================================================================

const DEFAULT_STAGES = [
  { name: 'Lead',         order: 1, color: '#6366f1', isFinalWon: false, isFinalLost: false },
  { name: 'Contactado',   order: 2, color: '#8b5cf6', isFinalWon: false, isFinalLost: false },
  { name: 'Negociación',  order: 3, color: '#f59e0b', isFinalWon: false, isFinalLost: false },
  { name: 'Ganado',       order: 4, color: '#10b981', isFinalWon: true,  isFinalLost: false },
  { name: 'Facturado',    order: 5, color: '#059669', isFinalWon: false, isFinalLost: false },
  { name: 'Perdido',      order: 6, color: '#ef4444', isFinalWon: false, isFinalLost: true  },
] as const

/**
 * Crea las 6 etapas por defecto del pipeline para un tenant.
 * Idempotente — skipDuplicates evita duplicados si se llama más de una vez.
 * Usar dentro de una transacción Prisma si se desea atomicidad con la operación padre.
 */
export async function createDefaultPipelineStages(
  tenantId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prisma
  await client.pipelineStage.createMany({
    data: DEFAULT_STAGES.map((s) => ({ tenantId, ...s })),
    skipDuplicates: true,
  })
}
