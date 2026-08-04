/**
 * Job de rollup del Dashboard — consolida métricas DIARIAS para los gráficos de
 * líneas (HU-127). Corre diariamente para todos los tenants (mismo patrón que los
 * demás schedulers; V2 → BullMQ repeatable).
 *
 * Por cada (tenant, día) genera:
 *   - una fila CONSOLIDADA (branch_id NULL) con todos los eventos del tenant
 *   - una fila por SUCURSAL (branch_id) con los eventos atribuibles a esa sucursal
 *
 * Métricas (distinción explícita de HU-127):
 *   - purchaseOrdersCreated → OC creadas        (purchase_orders.createdAt)
 *   - purchasesReceived     → OC recibidas      (status='received', deliveredAt)
 *   - purchasesAmount       → monto comprado    (suma de total de OC recibidas)
 *   - salesCount            → ventas realizadas (deals GANADOS, closedAt) — disparador HU-126
 *   - salesAmount           → monto vendido     (suma de value de deals ganados)
 *   - quotesCreated         → cotizaciones      (quotes.createdAt; sucursal = la del creador)
 *
 * El job hace delete+insert por (tenant, ventana) → idempotente, sin UNIQUE.
 */
import { prisma, withTenantContext } from '../lib/prisma'
import { businessToday } from '../lib/dates'

const ONE_DAY_MS    = 24 * 60 * 60 * 1000
const WINDOW_DAYS   = 120          // ventana que se recalcula en cada corrida
const NULL_BRANCH   = '__NULL__'   // clave interna para la fila consolidada

interface Acc {
  purchasesReceived:     number
  purchasesAmount:       number
  salesCount:            number
  salesAmount:           number
  purchaseOrdersCreated: number
  quotesCreated:         number
}

const emptyAcc = (): Acc => ({ purchasesReceived: 0, purchasesAmount: 0, salesCount: 0, salesAmount: 0, purchaseOrdersCreated: 0, quotesCreated: 0 })
const dayStr   = (d: Date): string => d.toISOString().slice(0, 10)

/**
 * Núcleo del rollup: recalcula la ventana `[from, toExclusive)` (o `[from, ∞)` si toExclusive es null)
 * con delete+insert idempotente, acotado a esa misma ventana. Lo comparten:
 *   - el job diario (ventana amplia, toExclusive=null)
 *   - el recálculo a demanda del día en curso (HU-174: ventana = solo hoy)
 * Así el botón "Actualizar" usa EXACTAMENTE la misma lógica de cálculo que el job.
 */
async function recalcRollupWindow(tenantId: string, from: Date, toExclusive: Date | null): Promise<{ rows: number }> {
  // Filtro de fecha para las queries: [from, toExclusive) o [from, ∞).
  const range = toExclusive ? { gte: from, lt: toExclusive } : { gte: from }

  return withTenantContext(tenantId, async (tx) => {
    // Secuencial (no Promise.all): una transacción interactiva usa UNA conexión;
    // lanzar queries concurrentes sobre el mismo `tx` es un anti-patrón en Prisma.
    const receivedPOs = await tx.purchaseOrder.findMany({ where: { tenantId, status: 'received', deliveredAt: range }, select: { deliveredAt: true, branchId: true, total: true } })
    const createdPOs  = await tx.purchaseOrder.findMany({ where: { tenantId, createdAt: range }, select: { createdAt: true, branchId: true } })
    const wonDeals    = await tx.deal.findMany({ where: { tenantId, closedAt: range, stage: { isFinalWon: true } }, select: { closedAt: true, branchId: true, value: true } })
    const quotes      = await tx.quote.findMany({ where: { tenantId, createdAt: range }, select: { createdAt: true, creator: { select: { branchId: true } } } })
    // HU-169/170 — registro rápido: compra/venta ya completada (transacción VERA), sin OC/deal.
    // Cuenta como compra/venta realizada en las tendencias (por fecha de la transacción).
    const quickPurchases = await tx.transaction.findMany({ where: { tenantId, type: 'expense', referenceType: 'quick_purchase', date: range }, select: { date: true, branchId: true, amount: true } })
    const quickSales     = await tx.transaction.findMany({ where: { tenantId, type: 'income',  referenceType: 'quick_sale',     date: range }, select: { date: true, branchId: true, amount: true } })

    // Map<`${date}|${branchKey}`, Acc>. Cada evento suma a su sucursal (si tiene) y a la consolidada.
    const map = new Map<string, Acc>()
    const bump = (date: string, branchId: string | null, fn: (a: Acc) => void): void => {
      for (const key of [`${date}|${NULL_BRANCH}`, ...(branchId ? [`${date}|${branchId}`] : [])]) {
        let acc = map.get(key)
        if (!acc) { acc = emptyAcc(); map.set(key, acc) }
        fn(acc)
      }
    }

    for (const po of receivedPOs) {
      if (!po.deliveredAt) continue
      const amt = parseFloat(String(po.total))
      bump(dayStr(po.deliveredAt), po.branchId, (a) => { a.purchasesReceived += 1; a.purchasesAmount += amt })
    }
    for (const po of createdPOs) bump(dayStr(po.createdAt), po.branchId, (a) => { a.purchaseOrdersCreated += 1 })
    for (const d of wonDeals) {
      const amt = d.value ? parseFloat(String(d.value)) : 0
      bump(dayStr(d.closedAt!), d.branchId, (a) => { a.salesCount += 1; a.salesAmount += amt })
    }
    for (const q of quotes) bump(dayStr(q.createdAt), q.creator?.branchId ?? null, (a) => { a.quotesCreated += 1 })
    for (const t of quickPurchases) { const amt = parseFloat(String(t.amount)); bump(dayStr(t.date), t.branchId, (a) => { a.purchasesReceived += 1; a.purchasesAmount += amt }) }
    for (const t of quickSales)     { const amt = parseFloat(String(t.amount)); bump(dayStr(t.date), t.branchId, (a) => { a.salesCount += 1; a.salesAmount += amt }) }

    const rows = [...map.entries()].map(([key, a]) => {
      const [date, branchKey] = key.split('|')
      return {
        tenantId,
        branchId: branchKey === NULL_BRANCH ? null : branchKey!,
        date: new Date(date + 'T00:00:00.000Z'),
        purchasesReceived:     a.purchasesReceived,
        purchasesAmount:       a.purchasesAmount,
        salesCount:            a.salesCount,
        salesAmount:           a.salesAmount,
        purchaseOrdersCreated: a.purchaseOrdersCreated,
        quotesCreated:         a.quotesCreated,
      }
    })

    // El delete se ACOTA a la misma ventana: recalcular "hoy" no toca los días cerrados.
    await tx.dashboardDailyRollup.deleteMany({ where: { tenantId, date: range } })
    if (rows.length > 0) await tx.dashboardDailyRollup.createMany({ data: rows })
    return { rows: rows.length }
  })
}

/** Recalcula el rollup de un tenant para la ventana [hoy-WINDOW_DAYS, hoy] (job diario). */
export async function runDashboardRollupForTenant(tenantId: string, windowDays = WINDOW_DAYS): Promise<{ rows: number }> {
  const from = new Date()
  from.setUTCDate(from.getUTCDate() - windowDays)
  from.setUTCHours(0, 0, 0, 0)
  return recalcRollupWindow(tenantId, from, null)
}

/**
 * Recálculo a demanda del DÍA EN CURSO (HU-174). "Hoy" en la zona del negocio (businessToday),
 * ventana = solo hoy → no altera los rollups de días pasados. Misma lógica que el job.
 */
export async function recalcTodayRollupForTenant(tenantId: string): Promise<{ rows: number; date: string }> {
  const from = businessToday()
  const toExclusive = new Date(from)
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1)
  const { rows } = await recalcRollupWindow(tenantId, from, toExclusive)
  return { rows, date: dayStr(from) }
}

async function runForAllTenants(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ where: { isActive: true }, select: { id: true, slug: true } })
  for (const tenant of tenants) {
    try {
      const { rows } = await runDashboardRollupForTenant(tenant.id)
      console.info(`[Dashboard Rollup] ${tenant.slug}: ${rows} filas`)
    } catch (err) {
      console.error(`[Dashboard Rollup] Error en tenant ${tenant.slug}:`, err)
    }
  }
}

export function startDashboardRollupScheduler(): void {
  // Corrida inicial al arrancar (no bloquea el listen) + cada 24 h.
  // En test (E2E) NO se corre al arrancar: evita carga de BD durante los tests.
  if (process.env['NODE_ENV'] !== 'test') {
    runForAllTenants().catch((err) => console.error('[Dashboard Rollup] Error en corrida inicial:', err))
  }
  setInterval(() => {
    runForAllTenants().catch((err) => console.error('[Dashboard Rollup] Error en ejecución diaria:', err))
  }, ONE_DAY_MS)
  console.info('[Dashboard Rollup] Scheduler registrado — corre cada 24 h')
}
