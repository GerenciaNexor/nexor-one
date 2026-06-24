import type { Role } from '@nexor/shared'
import { Prisma } from '@prisma/client'
import { prisma, runInTenantTransaction } from '../../lib/prisma'
import { getBranchFilter } from '../../lib/guards'

// HU-122: cada KPI corre en su propia transacción (runInTenantTransaction) → conexiones
// separadas en paralelo + SET LOCAL. El timeout contempla el overhead de BEGIN/COMMIT;
// en dev (app local ↔ DB Railway remota) cada round-trip pesa ~300ms, en producción
// (app y DB co-ubicadas) es despreciable. Configurable por entorno.
const TIMEOUT_MS = Number(process.env['DASHBOARD_KPI_TIMEOUT_MS'] ?? 5_000)

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
  // Aggregate queries replace prior N+1 patterns (product.findMany + nested stocks,
  // stock.findMany with nested product filter). The new Product(tenant_id, is_active)
  // index makes both WHERE clauses sub-millisecond at scale.
  const [criticosRows, movimientosHoy, inventarioRows] = await Promise.all([
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) AS count
      FROM (
        SELECT p.id
        FROM products p
        LEFT JOIN stocks s ON s.product_id = p.id
        WHERE p.tenant_id = ${tenantId}
          AND p.is_active  = true
          AND p.min_stock  > 0
        GROUP BY p.id, p.min_stock
        HAVING COALESCE(SUM(s.quantity), 0) < p.min_stock
      ) crit
    `,
    prisma.stockMovement.count({
      where: { tenantId, createdAt: { gte: todayStart() } },
    }),
    prisma.$queryRaw<[{ total: number | null }]>`
      SELECT SUM(s.quantity * p.cost_price)::float8 AS total
      FROM stocks s
      JOIN products p ON s.product_id = p.id
      WHERE p.tenant_id  = ${tenantId}
        AND p.is_active   = true
        AND p.cost_price IS NOT NULL
    `,
  ])

  return {
    productos_stock_critico: Number(criticosRows[0]?.count ?? 0),
    movimientos_hoy:         movimientosHoy,
    valor_inventario_total:  Math.round(Number(inventarioRows[0]?.total ?? 0) * 100) / 100,
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
        status: { in: ['approved', 'received', 'partial'] },
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

  // Cada módulo en su propia transacción de tenant (conexión propia → paralelas de verdad,
  // sin serializar en una sola conexión) y con contexto RLS vía SET LOCAL.
  const settled = await Promise.allSettled(
    tasks.map((m) =>
      withTimeout(runInTenantTransaction(tenantId, () => MODULE_FNS[m]!(tenantId)), TIMEOUT_MS),
    ),
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

// =============================================================================
// HU-127 — Series temporales del Dashboard (lee del rollup diario)
// =============================================================================

export interface TimeseriesPoint {
  date:                  string
  purchasesReceived:     number
  purchasesAmount:       number
  salesCount:            number
  salesAmount:           number
  purchaseOrdersCreated: number
  quotesCreated:         number
}

/**
 * Series diarias para los gráficos del Dashboard. Lee del rollup (no consulta pesada por carga).
 * Respeta el rol vía getBranchFilter: TENANT_ADMIN → consolidado (branch_id NULL); BRANCH_ADMIN/
 * AREA_MANAGER/OPERATIVE → su sucursal. Rellena con 0 los días sin datos. Corre en la tx por-request.
 */
export async function getDashboardTimeseries(
  tenantId: string,
  user:     { role: Role; branchId: string | null },
  from:     Date,
  to:       Date,
): Promise<{ from: string; to: string; scope: string; points: TimeseriesPoint[] }> {
  const branchFilter = getBranchFilter(user) // undefined = consolidado del tenant

  const rows = await prisma.dashboardDailyRollup.findMany({
    where:  { tenantId, date: { gte: from, lte: to }, branchId: branchFilter ?? null },
    select: {
      date: true, purchasesReceived: true, purchasesAmount: true,
      salesCount: true, salesAmount: true, purchaseOrdersCreated: true, quotesCreated: true,
    },
    orderBy: { date: 'asc' },
  })

  const byDate = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]))

  const points: TimeseriesPoint[] = []
  const cursor = new Date(from); cursor.setUTCHours(0, 0, 0, 0)
  const end    = new Date(to);   end.setUTCHours(0, 0, 0, 0)
  while (cursor <= end) {
    const ds = cursor.toISOString().slice(0, 10)
    const r  = byDate.get(ds)
    points.push({
      date:                  ds,
      purchasesReceived:     r?.purchasesReceived ?? 0,
      purchasesAmount:       r ? parseFloat(String(r.purchasesAmount)) : 0,
      salesCount:            r?.salesCount ?? 0,
      salesAmount:           r ? parseFloat(String(r.salesAmount)) : 0,
      purchaseOrdersCreated: r?.purchaseOrdersCreated ?? 0,
      quotesCreated:         r?.quotesCreated ?? 0,
    })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), scope: branchFilter ?? 'consolidado', points }
}

// =============================================================================
// HU-130 — Top 10 de productos (más vendidos por unidades / mayor ganancia por margen)
// =============================================================================

export interface TopProduct { productId: string; name: string; sku: string; units: number; profit: number }

/**
 * Top 10 de productos del rango. Sale DIRECTO de stock_movements:
 *   - Solo salidas con motivo 'venta' (HU-128) → no ajustes, mermas ni traslados.
 *   - units  = suma de unidades vendidas.
 *   - profit = suma de (sale_price_frozen − cost_price_frozen) × unidades, con los precios
 *     CONGELADOS del movimiento (HU-128) — nunca con los precios actuales del producto.
 * Respeta el rol vía getBranchFilter (consolidado vs sucursal) + RLS. Corre en la tx por-request.
 * Devuelve las dos vistas en una sola consulta (el frontend alterna sin re-pedir).
 */
export async function getTopProducts(
  tenantId: string,
  user:     { role: Role; branchId: string | null },
  from:     Date,
  to:       Date,
): Promise<{ from: string; to: string; scope: string; byUnits: TopProduct[]; byProfit: TopProduct[] }> {
  const branchFilter = getBranchFilter(user)
  const toEnd = new Date(to); toEnd.setUTCHours(23, 59, 59, 999)   // incluir el día 'to' completo
  const branchClause = branchFilter ? Prisma.sql`AND sm.branch_id = ${branchFilter}` : Prisma.empty

  const rows = await prisma.$queryRaw<TopProduct[]>(Prisma.sql`
    SELECT sm.product_id AS "productId", p.name, p.sku,
           SUM(sm.quantity)::float AS units,
           SUM((COALESCE(sm.sale_price_frozen, 0) - COALESCE(sm.cost_price_frozen, 0)) * sm.quantity)::float AS profit
    FROM stock_movements sm
    JOIN products p ON p.id = sm.product_id
    WHERE sm.tenant_id = ${tenantId}
      AND sm.reason = 'venta'
      AND sm.created_at >= ${from} AND sm.created_at <= ${toEnd}
      ${branchClause}
    GROUP BY sm.product_id, p.name, p.sku
  `)

  const byUnits  = [...rows].sort((a, b) => b.units - a.units).slice(0, 10)
  const byProfit = [...rows].sort((a, b) => b.profit - a.profit).slice(0, 10)

  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), scope: branchFilter ?? 'consolidado', byUnits, byProfit }
}
