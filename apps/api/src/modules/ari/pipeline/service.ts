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
  DealQuery,
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
) {
  const isManager = hasMinRole(role, 'AREA_MANAGER')

  const where: Prisma.DealWhereInput = {
    tenantId,
    // OPERATIVE solo ve los deals que tiene asignados
    ...(!isManager ? { assignedTo: userId } : {}),
    ...(query.stageId    ? { stageId:    query.stageId }    : {}),
    ...(query.clientId   ? { clientId:   query.clientId }   : {}),
    ...(query.assignedTo ? { assignedTo: query.assignedTo } : {}),
  }

  const deals = await prisma.deal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select:  DEAL_SELECT,
  })
  return { data: deals.map(toDeal), total: deals.length }
}

export async function getDeal(tenantId: string, dealId: string) {
  const deal = await prisma.deal.findFirst({
    where:  { id: dealId, tenantId },
    select: DEAL_SELECT,
  })
  if (!deal) throw { statusCode: 404, message: 'Deal no encontrado', code: 'NOT_FOUND' }
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

    // 2. Si la etapa es "Ganado" → generar ingreso en VERA
    if (newStage.isFinalWon) {
      const amount = deal.value ? parseFloat(String(deal.value)) : 0
      if (amount > 0) {
        await tx.transaction.create({
          data: {
            tenantId,
            branchId:      deal.branchId ?? null,
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
