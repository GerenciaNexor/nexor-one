import { prisma } from '../../../lib/prisma'
import type { UpsertBudgetInput, UpdateBudgetInput } from './schema'

const SELECT = {
  id: true, tenantId: true, branchId: true,
  year: true, month: true, amount: true, currency: true,
  createdAt: true, updatedAt: true,
  branch: { select: { id: true, name: true } },
} as const

// ── Helpers ────────────────────────────────────────────────────────────────────

export async function calcMonthExpenses(
  tenantId: string,
  year: number,
  month: number,
  branchId?: string | null,
): Promise<number> {
  const from = new Date(year, month - 1, 1)
  const to   = new Date(year, month, 1)

  const agg = await prisma.transaction.aggregate({
    where: {
      tenantId,
      type: 'expense',
      date: { gte: from, lt: to },
      ...(branchId ? { branchId } : {}),
    },
    _sum: { amount: true },
  })

  return Number(agg._sum.amount ?? 0)
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export async function listBudgets(tenantId: string) {
  return prisma.monthlyBudget.findMany({
    where:   { tenantId },
    select:  SELECT,
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })
}

export async function getBudgetStatus(tenantId: string, year: number, month: number, branchId?: string | null) {
  const budget = await prisma.monthlyBudget.findFirst({
    where: { tenantId, year, month, branchId: branchId ?? null },
    select: SELECT,
  })

  if (!budget) return null

  const spent      = await calcMonthExpenses(tenantId, year, month, branchId)
  const total      = Number(budget.amount)
  const percentage = total > 0 ? Math.round((spent / total) * 100) : 0

  return { ...budget, spent, percentage }
}

export async function upsertBudget(tenantId: string, input: UpsertBudgetInput) {
  const branchId = input.branchId ?? null

  return prisma.monthlyBudget.upsert({
    where:  { tenantId_branchId_year_month: { tenantId, branchId: branchId as string, year: input.year, month: input.month } },
    create: { tenantId, branchId, year: input.year, month: input.month, amount: input.amount, currency: input.currency },
    update: { amount: input.amount, currency: input.currency },
    select: SELECT,
  })
}

export async function updateBudget(tenantId: string, id: string, input: UpdateBudgetInput) {
  const b = await prisma.monthlyBudget.findFirst({ where: { id, tenantId } })
  if (!b) throw { statusCode: 404, message: 'Presupuesto no encontrado', code: 'NOT_FOUND' }

  return prisma.monthlyBudget.update({ where: { id }, data: input, select: SELECT })
}

export async function deleteBudget(tenantId: string, id: string) {
  const b = await prisma.monthlyBudget.findFirst({ where: { id, tenantId } })
  if (!b) throw { statusCode: 404, message: 'Presupuesto no encontrado', code: 'NOT_FOUND' }

  await prisma.monthlyBudget.delete({ where: { id } })
}
