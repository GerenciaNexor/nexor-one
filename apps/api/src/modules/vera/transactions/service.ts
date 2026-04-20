import { prisma } from '../../../lib/prisma'
import type {
  CreateManualTransactionInput,
  UpdateManualTransactionInput,
  ClassifyTransactionInput,
  ListTransactionsQuery,
} from './schema'

const TX_SELECT = {
  id: true, tenantId: true, branchId: true, categoryId: true, costCenterId: true,
  isManual: true, type: true, amount: true, currency: true, description: true,
  externalReference: true, referenceType: true, referenceId: true,
  date: true, createdAt: true, updatedAt: true,
  branch:     { select: { id: true, name: true } },
  txCategory: { select: { id: true, name: true, type: true, color: true } },
  costCenter: { select: { id: true, name: true } },
} as const

// ── Helpers ────────────────────────────────────────────────────────────────────

async function validateClassification(
  tenantId: string,
  type: string,
  categoryId?: string | null,
  costCenterId?: string | null,
) {
  if (categoryId) {
    const cat = await prisma.transactionCategory.findFirst({
      where: { id: categoryId, tenantId, isActive: true },
    })
    if (!cat) throw { statusCode: 400, message: 'Categoría no válida o inactiva', code: 'INVALID_CATEGORY' }
    if (cat.type !== 'both' && cat.type !== type) {
      throw {
        statusCode: 400,
        message: `La categoría es de tipo ${cat.type} pero la transacción es ${type}`,
        code: 'TYPE_MISMATCH',
      }
    }
  }
  if (costCenterId) {
    const cc = await prisma.costCenter.findFirst({
      where: { id: costCenterId, tenantId, isActive: true },
    })
    if (!cc) throw { statusCode: 400, message: 'Centro de costo no válido o inactivo', code: 'INVALID_COST_CENTER' }
  }
}

// ── List ───────────────────────────────────────────────────────────────────────

export async function listTransactions(tenantId: string, q: ListTransactionsQuery) {
  const where = {
    tenantId,
    ...(q.branchId     ? { branchId:     q.branchId }                : {}),
    ...(q.type         ? { type:         q.type }                    : {}),
    ...(q.isManual     ? { isManual:     q.isManual === 'true' }     : {}),
    ...(q.categoryId   ? { categoryId:   q.categoryId }              : {}),
    ...(q.costCenterId ? { costCenterId: q.costCenterId }            : {}),
    ...(q.search?.trim() ? {
      OR: [
        { description:       { contains: q.search, mode: 'insensitive' as const } },
        { externalReference: { contains: q.search, mode: 'insensitive' as const } },
      ],
    } : {}),
    ...(q.dateFrom || q.dateTo ? {
      date: {
        ...(q.dateFrom ? { gte: new Date(q.dateFrom) } : {}),
        ...(q.dateTo   ? { lte: new Date(q.dateTo) }   : {}),
      },
    } : {}),
  }

  const [data, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      select:  TX_SELECT,
      orderBy: { date: 'desc' },
      skip:    (q.page - 1) * q.limit,
      take:    q.limit,
    }),
    prisma.transaction.count({ where }),
  ])

  return { data, total, page: q.page, limit: q.limit }
}

// ── Detail ─────────────────────────────────────────────────────────────────────

export async function getTransaction(tenantId: string, id: string) {
  const tx = await prisma.transaction.findFirst({ where: { id, tenantId }, select: TX_SELECT })
  if (!tx) throw { statusCode: 404, message: 'Transacción no encontrada', code: 'NOT_FOUND' }
  return tx
}

// ── Create (manual only) ───────────────────────────────────────────────────────

export async function createManualTransaction(tenantId: string, input: CreateManualTransactionInput) {
  await validateClassification(tenantId, input.type, input.categoryId, input.costCenterId)

  return prisma.transaction.create({
    data: {
      tenantId,
      isManual:          true,
      type:              input.type,
      amount:            input.amount,
      currency:          input.currency,
      description:       input.description,
      date:              new Date(input.date),
      branchId:          input.branchId          ?? null,
      categoryId:        input.categoryId        ?? null,
      costCenterId:      input.costCenterId      ?? null,
      externalReference: input.externalReference ?? null,
    },
    select: TX_SELECT,
  })
}

// ── Update (manual only) ───────────────────────────────────────────────────────

export async function updateManualTransaction(
  tenantId: string,
  id: string,
  input: UpdateManualTransactionInput,
) {
  const tx = await prisma.transaction.findFirst({ where: { id, tenantId } })
  if (!tx)          throw { statusCode: 404, message: 'Transacción no encontrada', code: 'NOT_FOUND' }
  if (!tx.isManual) throw { statusCode: 403, message: 'Las transacciones automáticas no pueden editarse', code: 'NOT_MANUAL' }

  const newType = input.type ?? tx.type
  await validateClassification(
    tenantId,
    newType,
    input.categoryId !== undefined ? input.categoryId : tx.categoryId,
    input.costCenterId !== undefined ? input.costCenterId : tx.costCenterId,
  )

  return prisma.transaction.update({
    where:  { id },
    data:   {
      ...input,
      ...(input.date ? { date: new Date(input.date) } : {}),
    },
    select: TX_SELECT,
  })
}

// ── Delete (manual only) ───────────────────────────────────────────────────────

export async function deleteManualTransaction(tenantId: string, id: string) {
  const tx = await prisma.transaction.findFirst({ where: { id, tenantId } })
  if (!tx)          throw { statusCode: 404, message: 'Transacción no encontrada', code: 'NOT_FOUND' }
  if (!tx.isManual) throw { statusCode: 403, message: 'Las transacciones automáticas no pueden eliminarse', code: 'NOT_MANUAL' }

  await prisma.transaction.delete({ where: { id } })
}

// ── Classify ───────────────────────────────────────────────────────────────────

export async function classifyTransaction(tenantId: string, id: string, input: ClassifyTransactionInput) {
  const tx = await prisma.transaction.findFirst({ where: { id, tenantId } })
  if (!tx) throw { statusCode: 404, message: 'Transacción no encontrada', code: 'NOT_FOUND' }

  await validateClassification(tenantId, tx.type, input.categoryId, input.costCenterId)

  return prisma.transaction.update({ where: { id }, data: input, select: TX_SELECT })
}
