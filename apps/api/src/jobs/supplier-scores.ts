/**
 * Job de score de proveedores — corre diariamente para todos los tenants.
 *
 * Calcula tres dimensiones por proveedor:
 *   - priceScore:    Precio promedio del proveedor vs promedio del mercado (0-10)
 *   - deliveryScore: % de OC entregadas en la fecha prometida o antes (0-10)
 *   - qualityScore:  V1 = 10 fijo para todos (se implementará con devoluciones en V2)
 *   - overallScore:  Promedio simple de las tres dimensiones
 *
 * Solo se calculan scores de proveedores con al menos 1 OC en estado 'received'.
 * Si el score baja de 5, se genera una notificación al AREA_MANAGER de NIRA
 * (solo una vez por caída — no se repite hasta que el score vuelva a subir).
 *
 * En V1 usa setInterval — en V2 se migrará a BullMQ con reintentos.
 */

import { prisma, withTenantContext } from '../lib/prisma'
import type { Prisma } from '@prisma/client'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

// ─── Cálculo de score para un proveedor (dentro de withTenantContext) ─────────

async function computeSupplierScore(
  tx:        Prisma.TransactionClient,
  tenantId:  string,
  supplierId: string,
) {
  // ── Entrega ────────────────────────────────────────────────────────────────
  const receivedOrders = await tx.purchaseOrder.findMany({
    where:  { tenantId, supplierId, status: 'received' },
    select: { expectedDelivery: true, deliveredAt: true },
  })

  const totalOrders = receivedOrders.length
  if (totalOrders === 0) {
    return { priceScore: 0, deliveryScore: 0, qualityScore: 0, overallScore: 0, totalOrders: 0, onTimeDeliveries: 0 }
  }

  const ordersWithDates = receivedOrders.filter(
    (o): o is { expectedDelivery: Date; deliveredAt: Date } =>
      o.expectedDelivery !== null && o.deliveredAt !== null,
  )
  const onTimeDeliveries = ordersWithDates.filter(
    (o) => o.deliveredAt <= o.expectedDelivery,
  ).length
  const deliveryScore = ordersWithDates.length > 0
    ? parseFloat(Math.min(10, 10 * (onTimeDeliveries / ordersWithDates.length)).toFixed(2))
    : 5  // neutral si ninguna OC tenía fecha prometida

  // ── Precio: supplier avg vs global avg por producto ───────────────────────
  const supplierItems = await tx.purchaseOrderItem.findMany({
    where:  { purchaseOrder: { supplierId, tenantId, status: 'received' } },
    select: { productId: true, unitCost: true },
  })

  let priceScore = 5 // neutral por defecto

  if (supplierItems.length > 0) {
    // Agrupar en memoria: productId → costos del proveedor
    const supplierCostMap = new Map<string, number[]>()
    for (const item of supplierItems) {
      const cost = parseFloat(String(item.unitCost))
      const prev = supplierCostMap.get(item.productId)
      if (prev) prev.push(cost)
      else supplierCostMap.set(item.productId, [cost])
    }

    const productIds = [...supplierCostMap.keys()]

    // Costos globales de esos mismos productos (todos los proveedores del tenant)
    const globalItems = await tx.purchaseOrderItem.findMany({
      where:  { productId: { in: productIds }, purchaseOrder: { tenantId, status: 'received' } },
      select: { productId: true, unitCost: true },
    })

    const globalCostMap = new Map<string, number[]>()
    for (const item of globalItems) {
      const cost = parseFloat(String(item.unitCost))
      const prev = globalCostMap.get(item.productId)
      if (prev) prev.push(cost)
      else globalCostMap.set(item.productId, [cost])
    }

    // Para cada producto: ratio = supplierAvg / globalAvg
    let ratioSum   = 0
    let ratioCount = 0
    for (const [productId, costs] of supplierCostMap) {
      const supplierAvg = costs.reduce((a, b) => a + b, 0) / costs.length
      const globalCosts = globalCostMap.get(productId) ?? []
      const globalAvg   = globalCosts.length > 0
        ? globalCosts.reduce((a, b) => a + b, 0) / globalCosts.length
        : 0
      if (supplierAvg > 0 && globalAvg > 0) {
        ratioSum += supplierAvg / globalAvg
        ratioCount++
      }
    }

    if (ratioCount > 0) {
      const avgRatio = ratioSum / ratioCount
      // avgRatio < 1 → más barato → priceScore > 10 → se capa en 10
      // avgRatio = 1 → precio de mercado → priceScore = 10
      // avgRatio > 1 → más caro → priceScore < 10
      priceScore = parseFloat(Math.min(10, Math.max(0, 10 / avgRatio)).toFixed(2))
    }
  }

  // ── Calidad (V1: 10 fijo) ─────────────────────────────────────────────────
  const qualityScore = 10

  // ── Score general (promedio simple) ──────────────────────────────────────
  const overallScore = parseFloat(((priceScore + deliveryScore + qualityScore) / 3).toFixed(2))

  return { priceScore, deliveryScore, qualityScore, overallScore, totalOrders, onTimeDeliveries }
}

// ─── Cálculo para todos los proveedores de un tenant ─────────────────────────

async function calculateScoresForTenant(tenantId: string): Promise<{ updated: number }> {
  return withTenantContext(tenantId, async (tx) => {
    const suppliers = await tx.supplier.findMany({
      where: {
        tenantId,
        isActive:       true,
        purchaseOrders: { some: { status: 'received' } },
      },
      select: {
        id:   true,
        name: true,
        score: { select: { overallScore: true } },
      },
    })

    for (const supplier of suppliers) {
      const prevOverall = supplier.score
        ? parseFloat(String(supplier.score.overallScore))
        : null

      const scores = await computeSupplierScore(tx, tenantId, supplier.id)

      await tx.supplierScore.upsert({
        where:  { supplierId: supplier.id },
        create: { supplierId: supplier.id, ...scores, calculatedAt: new Date() },
        update: { ...scores, calculatedAt: new Date() },
      })

      // Notificar si el score cae por debajo de 5 (solo la primera vez por caída)
      const droppedBelow5 =
        scores.overallScore < 5 && (prevOverall === null || prevOverall >= 5)

      if (droppedBelow5) {
        const managers = await tx.user.findMany({
          where:  { tenantId, role: 'AREA_MANAGER', module: 'NIRA', isActive: true },
          select: { id: true },
        })
        for (const mgr of managers) {
          await tx.notification.create({
            data: {
              tenantId,
              userId:  mgr.id,
              module:  'NIRA',
              type:    'PROVEEDOR_SCORE_BAJO',
              title:   `Score bajo: ${supplier.name}`,
              message: `El proveedor "${supplier.name}" tiene un score de ${scores.overallScore}/10. Se recomienda revisión o cambio de proveedor.`,
              link:    `/nira/suppliers`,
            },
          })
        }
      }
    }

    return { updated: suppliers.length }
  })
}

// ─── Ejecución global ─────────────────────────────────────────────────────────

async function runSupplierScoresForAllTenants(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where:  { isActive: true },
    select: { id: true, slug: true },
  })

  for (const tenant of tenants) {
    try {
      const result = await calculateScoresForTenant(tenant.id)
      console.info(`[Supplier Scores] ${tenant.slug}: ${result.updated} proveedores actualizados`)
    } catch (err) {
      console.error(`[Supplier Scores] Error en tenant ${tenant.slug}:`, err)
    }
  }
}

/**
 * Inicia el job diario de cálculo de scores de proveedores.
 * Llamar una vez al arrancar el servidor (en app.ts).
 */
export function startSupplierScoresScheduler(): void {
  setInterval(() => {
    runSupplierScoresForAllTenants().catch((err) =>
      console.error('[Supplier Scores] Error en ejecución diaria:', err),
    )
  }, ONE_DAY_MS)

  console.info('[Supplier Scores] Scheduler registrado — corre cada 24 h')
}

/** Exportado para poder lanzar el cálculo manualmente desde el panel de admin. */
export { runSupplierScoresForAllTenants, calculateScoresForTenant }
