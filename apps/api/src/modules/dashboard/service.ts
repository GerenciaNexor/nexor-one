import { prisma } from '../../lib/prisma'

const TIMEOUT_MS = 800

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ])
}

function todayStart(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function monthStart(): Date {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

// ── Per-module KPI functions ───────────────────────────────────────────────────

async function kiraKpis(tenantId: string): Promise<Record<string, unknown>> {
  const [products, movimientosHoy, stocksWithProducts] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, isActive: true, minStock: { gt: 0 } },
      select: { minStock: true, stocks: { select: { quantity: true } } },
    }),
    prisma.stockMovement.count({
      where: { tenantId, createdAt: { gte: todayStart() } },
    }),
    prisma.stock.findMany({
      where: { product: { tenantId, isActive: true, costPrice: { not: null } } },
      select: { quantity: true, product: { select: { costPrice: true } } },
    }),
  ])

  const productosCriticos = products.filter((p) => {
    const total = p.stocks.reduce((s, st) => s + Number(st.quantity), 0)
    return total < p.minStock
  }).length

  const valorInventario = stocksWithProducts.reduce((sum, s) => {
    return sum + Number(s.quantity) * Number(s.product.costPrice ?? 0)
  }, 0)

  return {
    productos_stock_critico: productosCriticos,
    movimientos_hoy:         movimientosHoy,
    valor_inventario_total:  Math.round(valorInventario * 100) / 100,
  }
}

async function niraKpis(tenantId: string): Promise<Record<string, unknown>> {
  const [pendientes, vencidas, gastoAgg] = await Promise.all([
    prisma.purchaseOrder.count({
      where: { tenantId, status: 'submitted' },
    }),
    prisma.purchaseOrder.count({
      where: {
        tenantId,
        status: { in: ['approved', 'partial'] },
        expectedDelivery: { lt: todayStart() },
      },
    }),
    prisma.purchaseOrder.aggregate({
      where: {
        tenantId,
        status: { in: ['approved', 'delivered', 'partial'] },
        createdAt: { gte: monthStart() },
      },
      _sum: { total: true },
    }),
  ])

  return {
    oc_pendientes_aprobacion: pendientes,
    oc_entrega_vencida:       vencidas,
    total_gastado_mes:        Math.round(Number(gastoAgg._sum.total ?? 0) * 100) / 100,
  }
}

async function ariKpis(tenantId: string): Promise<Record<string, unknown>> {
  const activeStages = await prisma.pipelineStage.findMany({
    where:  { tenantId, isFinalWon: false, isFinalLost: false },
    select: { id: true },
  })
  const stageIds = activeStages.map((s) => s.id)

  const [leadsHoy, dealsCount, pipelineAgg] = await Promise.all([
    prisma.client.count({
      where: { tenantId, createdAt: { gte: todayStart() } },
    }),
    prisma.deal.count({
      where: { tenantId, stageId: { in: stageIds } },
    }),
    prisma.deal.aggregate({
      where: { tenantId, stageId: { in: stageIds } },
      _sum:  { value: true },
    }),
  ])

  return {
    leads_nuevos_hoy:     leadsHoy,
    deals_en_negociacion: dealsCount,
    valor_pipeline_total: Math.round(Number(pipelineAgg._sum.value ?? 0) * 100) / 100,
  }
}

async function agendaKpis(tenantId: string): Promise<Record<string, unknown>> {
  const now = new Date()
  const start = todayStart()
  const end   = new Date(start)
  end.setDate(end.getDate() + 1)

  const [citasHoy, proximaCita, estadosMes] = await Promise.all([
    prisma.appointment.count({
      where: { tenantId, startAt: { gte: start, lt: end } },
    }),
    prisma.appointment.findFirst({
      where:   { tenantId, startAt: { gt: now }, status: { not: 'cancelled' } },
      orderBy: { startAt: 'asc' },
      select:  { id: true, clientName: true, startAt: true, endAt: true },
    }),
    prisma.appointment.groupBy({
      by:    ['status'],
      where: { tenantId, startAt: { gte: monthStart() } },
      _count: { id: true },
    }),
  ])

  const totalMes = estadosMes.reduce((s, g) => s + g._count.id, 0)
  const asistidas = estadosMes
    .filter((g) => g.status === 'attended' || g.status === 'completed')
    .reduce((s, g) => s + g._count.id, 0)

  return {
    citas_hoy:           citasHoy,
    proxima_cita:        proximaCita,
    tasa_asistencia_mes: totalMes > 0 ? Math.round((asistidas / totalMes) * 100) : 0,
  }
}

async function veraKpis(tenantId: string): Promise<Record<string, unknown>> {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1
  const start = monthStart()

  const [ingresosAgg, egresosAgg, presupuestoAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { tenantId, type: 'income', date: { gte: start } },
      _sum:  { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { tenantId, type: 'expense', date: { gte: start } },
      _sum:  { amount: true },
    }),
    prisma.monthlyBudget.aggregate({
      where: { tenantId, year, month },
      _sum:  { amount: true },
    }),
  ])

  const ingresos       = Math.round(Number(ingresosAgg._sum.amount ?? 0) * 100) / 100
  const egresos        = Math.round(Number(egresosAgg._sum.amount  ?? 0) * 100) / 100
  const totalBudget    = Number(presupuestoAgg._sum.amount ?? 0)
  const porcentaje     = totalBudget > 0
    ? Math.round((egresos / totalBudget) * 100)
    : null

  return {
    ingresos_mes:           ingresos,
    egresos_mes:            egresos,
    utilidad_bruta:         Math.round((ingresos - egresos) * 100) / 100,
    porcentaje_presupuesto: porcentaje,
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

const MODULE_FNS: Record<string, (tenantId: string) => Promise<Record<string, unknown>>> = {
  KIRA:   kiraKpis,
  NIRA:   niraKpis,
  ARI:    ariKpis,
  AGENDA: agendaKpis,
  VERA:   veraKpis,
}

export interface ModuleKpiResult {
  data:   Record<string, unknown> | null
  error?: string
}

export async function getDashboardKpis(
  tenantId: string,
  modules:  string[],
): Promise<Record<string, ModuleKpiResult>> {
  const tasks = modules.filter((m) => MODULE_FNS[m])

  const settled = await Promise.allSettled(
    tasks.map((m) => withTimeout(MODULE_FNS[m]!(tenantId), TIMEOUT_MS)),
  )

  const result: Record<string, ModuleKpiResult> = {}
  tasks.forEach((m, i) => {
    const r = settled[i]!
    const key = m.toLowerCase()
    if (r.status === 'fulfilled') {
      result[key] = { data: r.value }
    } else {
      result[key] = {
        data:  null,
        error: r.reason instanceof Error ? r.reason.message : 'Error al calcular KPIs',
      }
    }
  })

  return result
}
