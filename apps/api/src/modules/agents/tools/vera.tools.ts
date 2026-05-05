/**
 * Tools del agente VERA — Finanzas
 * consultar_transacciones, consultar_kpis_financieros.
 * Solo lectura — VERA nunca modifica transacciones desde el agente.
 */

import { prisma } from '../../../lib/prisma'
import type { AgentTool } from '../types'

function df(from?: unknown, to?: unknown) {
  const gte = from ? new Date(from as string) : undefined
  const lte = to   ? new Date(new Date(to as string).setHours(23, 59, 59, 999)) : undefined
  return (!gte && !lte) ? undefined : { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) }
}

// ─── consultar_transacciones ──────────────────────────────────────────────────

const consultarTransacciones: AgentTool = {
  definition: {
    name: 'consultar_transacciones',
    description: 'Returns financial transactions with optional filters by type (income/expense), category, date range and branch. Returns up to 50 records ordered by date descending.',
    input_schema: {
      type: 'object',
      properties: {
        tipo:       { type: 'string', enum: ['income', 'expense'], description: 'Transaction type: income or expense' },
        categoryId: { type: 'string', description: 'Filter by category ID' },
        branchId:   { type: 'string', description: 'Filter by branch ID' },
        from:       { type: 'string', description: 'Start date YYYY-MM-DD (inclusive)' },
        to:         { type: 'string', description: 'End date YYYY-MM-DD (inclusive)' },
        limit:      { type: 'number', description: 'Max results (default 20, max 50)' },
      },
    },
  },

  async execute({ tipo, categoryId, branchId, from, to, limit }, tenantId) {
    const take       = Math.min(50, Math.max(1, Number(limit ?? 20)))
    const dateFilter = df(from, to)

    const transactions = await prisma.transaction.findMany({
      where: {
        tenantId,
        ...(tipo       ? { type: tipo as string }             : {}),
        ...(categoryId ? { categoryId: categoryId as string } : {}),
        ...(branchId   ? { branchId: branchId as string }     : {}),
        ...(dateFilter ? { date: dateFilter }                  : {}),
      },
      include: {
        txCategory: { select: { name: true, type: true } },
        branch:     { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take,
    })

    if (transactions.length === 0) return { total: 0, transacciones: [], message: 'No se encontraron transacciones con los filtros indicados.' }

    return {
      total: transactions.length,
      transacciones: transactions.map((t) => ({
        id:          t.id,
        tipo:        t.type,
        monto:       Number(t.amount).toFixed(2),
        moneda:      t.currency,
        descripcion: t.description,
        categoria:   t.txCategory?.name ?? t.category ?? null,
        sucursal:    t.branch?.name ?? null,
        fecha:       t.date.toISOString().split('T')[0],
        manual:      t.isManual,
      })),
    }
  },
}

// ─── consultar_kpis_financieros ───────────────────────────────────────────────

const consultarKpisFinancieros: AgentTool = {
  definition: {
    name: 'consultar_kpis_financieros',
    description: 'Returns financial KPIs for a period: total income, total expenses, gross profit and margin percentage. Optionally filtered by branch.',
    input_schema: {
      type: 'object',
      properties: {
        from:     { type: 'string', description: 'Start date YYYY-MM-DD (default: first day of current month)' },
        to:       { type: 'string', description: 'End date YYYY-MM-DD (default: today)' },
        branchId: { type: 'string', description: 'Filter by branch (omit for tenant-wide totals)' },
      },
    },
  },

  async execute({ from, to, branchId }, tenantId) {
    const now = new Date()
    const startDefault = new Date(now.getFullYear(), now.getMonth(), 1)
    const gte = from ? new Date(from as string) : startDefault
    const lte = to   ? new Date(new Date(to as string).setHours(23, 59, 59, 999)) : now

    const baseWhere = {
      tenantId,
      date: { gte, lte },
      ...(branchId ? { branchId: branchId as string } : {}),
    }

    const [incomeAgg, expenseAgg, byCategory] = await Promise.all([
      prisma.transaction.aggregate({
        where: { ...baseWhere, type: 'income' },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.transaction.aggregate({
        where: { ...baseWhere, type: 'expense' },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.transaction.groupBy({
        by:    ['categoryId'],
        where: baseWhere,
        _sum:  { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
    ])

    const income  = Number(incomeAgg._sum.amount ?? 0)
    const expense = Number(expenseAgg._sum.amount ?? 0)
    const profit  = income - expense
    const margin  = income > 0 ? Math.round((profit / income) * 10000) / 100 : 0

    // Resolver nombres de categorías
    const catIds = byCategory.map((r) => r.categoryId).filter(Boolean) as string[]
    const cats   = catIds.length > 0
      ? await prisma.transactionCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } })
      : []
    const catMap  = new Map(cats.map((c) => [c.id, c.name]))

    return {
      periodo:         { desde: gte.toISOString().split('T')[0], hasta: lte.toISOString().split('T')[0] },
      ingresos:        { total: income.toFixed(2), transacciones: incomeAgg._count.id },
      egresos:         { total: expense.toFixed(2), transacciones: expenseAgg._count.id },
      utilidadBruta:   profit.toFixed(2),
      margen:          `${margin}%`,
      topCategorias:   byCategory.map((r) => ({
        categoria: r.categoryId ? (catMap.get(r.categoryId) ?? r.categoryId) : 'Sin categoría',
        monto:     Number(r._sum.amount ?? 0).toFixed(2),
        registros: r._count.id,
      })),
    }
  },
}

// ─── Catálogo VERA ────────────────────────────────────────────────────────────

export const VERA_TOOLS: AgentTool[] = [
  consultarTransacciones,
  consultarKpisFinancieros,
]
