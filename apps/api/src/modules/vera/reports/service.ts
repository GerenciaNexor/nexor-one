import { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import type { ReportQuery, TimelineQuery } from './schema'

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildWhere(tenantId: string, q: ReportQuery) {
  return {
    tenantId,
    ...(q.branchId ? { branchId: q.branchId } : {}),
    ...(q.dateFrom || q.dateTo ? {
      date: {
        ...(q.dateFrom ? { gte: new Date(q.dateFrom) } : {}),
        ...(q.dateTo   ? { lte: new Date(q.dateTo)   } : {}),
      },
    } : {}),
  }
}

function kpis(income: number, expense: number) {
  const grossProfit = income - expense
  const margin      = income > 0 ? Math.round((grossProfit / income) * 10000) / 100 : 0
  return { income, expense, grossProfit, margin }
}

// ── Summary ────────────────────────────────────────────────────────────────────

export async function getSummary(tenantId: string, q: ReportQuery) {
  const where = buildWhere(tenantId, q)

  // Global totals
  const [incAgg, expAgg] = await Promise.all([
    prisma.transaction.aggregate({ where: { ...where, type: 'income'  }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { ...where, type: 'expense' }, _sum: { amount: true } }),
  ])
  const totalIncome  = Number(incAgg._sum.amount ?? 0)
  const totalExpense = Number(expAgg._sum.amount ?? 0)

  // By branch
  const branchRows = await prisma.transaction.groupBy({
    by: ['branchId', 'type'],
    where,
    _sum: { amount: true },
  })
  const branchIds = [...new Set(branchRows.map((r) => r.branchId).filter(Boolean))] as string[]
  const branchNames = branchIds.length
    ? await prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } })
    : []
  const branchNameMap = Object.fromEntries(branchNames.map((b) => [b.id, b.name]))

  const branchMap: Record<string, { branchId: string | null; branchName: string; income: number; expense: number }> = {}
  for (const row of branchRows) {
    const key = row.branchId ?? '__none__'
    if (!branchMap[key]) branchMap[key] = {
      branchId:   row.branchId,
      branchName: row.branchId ? (branchNameMap[row.branchId] ?? row.branchId) : 'Sin sucursal',
      income: 0, expense: 0,
    }
    if (row.type === 'income')  branchMap[key].income  = Number(row._sum.amount ?? 0)
    if (row.type === 'expense') branchMap[key].expense = Number(row._sum.amount ?? 0)
  }
  const byBranch = Object.values(branchMap).map((b) => ({ ...b, ...kpis(b.income, b.expense) }))

  // By module (referenceType, null = manual)
  const moduleRows = await prisma.transaction.groupBy({
    by: ['referenceType', 'type'],
    where,
    _sum: { amount: true },
  })
  const moduleMap: Record<string, { module: string; income: number; expense: number }> = {}
  for (const row of moduleRows) {
    const mod = row.referenceType ?? 'manual'
    if (!moduleMap[mod]) moduleMap[mod] = { module: mod, income: 0, expense: 0 }
    if (row.type === 'income')  moduleMap[mod].income  = Number(row._sum.amount ?? 0)
    if (row.type === 'expense') moduleMap[mod].expense = Number(row._sum.amount ?? 0)
  }
  const byModule = Object.values(moduleMap).map((m) => ({ ...m, ...kpis(m.income, m.expense) }))

  return { ...kpis(totalIncome, totalExpense), byBranch, byModule }
}

// ── Timeline ───────────────────────────────────────────────────────────────────

interface TimelineRaw { period: Date; type: string; total: string }

export async function getTimeline(tenantId: string, q: TimelineQuery) {
  const trunc = Prisma.raw(q.granularity)   // enum-validated → safe

  const conditions: Prisma.Sql[] = [Prisma.sql`tenant_id = ${tenantId}`]
  if (q.dateFrom) conditions.push(Prisma.sql`date >= CAST(${q.dateFrom} AS date)`)
  if (q.dateTo)   conditions.push(Prisma.sql`date <= CAST(${q.dateTo}   AS date)`)
  if (q.branchId) conditions.push(Prisma.sql`branch_id = ${q.branchId}`)

  const whereClause = Prisma.join(conditions, ' AND ')

  const rows = await prisma.$queryRaw<TimelineRaw[]>(Prisma.sql`
    SELECT
      DATE_TRUNC(${trunc}, date)  AS period,
      type,
      SUM(amount)                 AS total
    FROM   transactions
    WHERE  ${whereClause}
    GROUP  BY 1, 2
    ORDER  BY 1 ASC
  `)

  const periodMap: Record<string, { period: string; income: number; expense: number }> = {}
  for (const row of rows) {
    const key = new Date(row.period).toISOString().slice(0, 10)
    if (!periodMap[key]) periodMap[key] = { period: key, income: 0, expense: 0 }
    if (row.type === 'income')  periodMap[key].income  = Number(row.total)
    if (row.type === 'expense') periodMap[key].expense = Number(row.total)
  }

  return Object.values(periodMap)
}

// ── Categories breakdown ───────────────────────────────────────────────────────

export async function getCategoryBreakdown(tenantId: string, q: ReportQuery) {
  const where = buildWhere(tenantId, q)

  const rows = await prisma.transaction.groupBy({
    by:    ['categoryId', 'type'],
    where,
    _sum:  { amount: true },
  })

  const catIds = [...new Set(rows.map((r) => r.categoryId).filter(Boolean))] as string[]
  const cats   = catIds.length
    ? await prisma.transactionCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true, color: true } })
    : []
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]))

  const totalIncome  = rows.filter((r) => r.type === 'income' ).reduce((s, r) => s + Number(r._sum.amount ?? 0), 0)
  const totalExpense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + Number(r._sum.amount ?? 0), 0)

  return rows
    .map((row) => {
      const cat    = row.categoryId ? catMap[row.categoryId] : null
      const amount = Number(row._sum.amount ?? 0)
      const total  = row.type === 'income' ? totalIncome : totalExpense
      return {
        categoryId:   row.categoryId,
        categoryName: cat?.name  ?? 'Sin categoría',
        color:        cat?.color ?? null,
        type:         row.type,
        amount,
        percentage:   total > 0 ? Math.round((amount / total) * 10000) / 100 : 0,
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

// ── CSV export ─────────────────────────────────────────────────────────────────

export async function exportCsv(tenantId: string, q: ReportQuery): Promise<string> {
  const rows = await prisma.transaction.findMany({
    where:   buildWhere(tenantId, q),
    select: {
      id: true, type: true, amount: true, currency: true, description: true,
      externalReference: true, referenceType: true, referenceId: true,
      isManual: true, date: true, createdAt: true,
      branch:     { select: { name: true } },
      txCategory: { select: { name: true } },
      costCenter: { select: { name: true } },
    },
    orderBy: { date: 'desc' },
  })

  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }

  const headers = [
    'ID', 'Tipo', 'Monto', 'Moneda', 'Descripción', 'Categoría', 'Centro de costo',
    'Sucursal', 'Referencia externa', 'Módulo origen', 'ID origen', 'Manual', 'Fecha', 'Registrada',
  ]

  const csvRows = rows.map((r) => [
    r.id, r.type, r.amount.toString(), r.currency, r.description,
    r.txCategory?.name ?? '', r.costCenter?.name ?? '', r.branch?.name ?? '',
    r.externalReference ?? '', r.referenceType ?? '', r.referenceId ?? '',
    r.isManual ? 'Sí' : 'No',
    new Date(r.date).toISOString().slice(0, 10),
    new Date(r.createdAt).toISOString(),
  ].map(esc).join(','))

  return [headers.join(','), ...csvRows].join('\n')
}
