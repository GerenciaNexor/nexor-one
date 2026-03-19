/**
 * Job de clasificación ABC — corre semanalmente para todos los tenants.
 *
 * Algoritmo:
 *   1. Para cada tenant, obtiene todos los productos activos con preciosCosto
 *   2. Calcula el valor de inventario: SUM(stock.quantity × costPrice) por producto
 *   3. Ordena de mayor a menor valor
 *   4. Asigna clase según valor acumulado:
 *      A → primeros productos que representan el 80% del valor total
 *      B → siguientes hasta el 95%
 *      C → el resto
 *   5. Productos sin costPrice o sin stock → abcClass = null
 *
 * En V2 se migrará a BullMQ con Redis para reintentos y distribución.
 * En V1 usa setInterval — adecuado para un servidor único en Railway.
 */

import { prisma } from '../lib/prisma'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

// ─── Algoritmo de clasificación ──────────────────────────────────────────────

export async function calculateAbcForTenant(
  tenantId: string,
): Promise<{ classified: number; cleared: number }> {
  // 1. Productos activos con precio de costo definido
  const products = await prisma.product.findMany({
    where: { tenantId, isActive: true, costPrice: { not: null } },
    select: { id: true, costPrice: true },
  })

  // 2. Stock total por producto (suma de todas las sucursales)
  const stockRows = await prisma.stock.groupBy({
    by: ['productId'],
    where: { product: { tenantId } },
    _sum: { quantity: true },
  })

  const stockMap = new Map(
    stockRows.map((s) => [s.productId, parseFloat(String(s._sum.quantity ?? 0))]),
  )

  // 3. Valor de inventario = qty × costo — solo productos con valor > 0
  const productValues = products
    .map((p) => ({
      id:    p.id,
      value: (stockMap.get(p.id) ?? 0) * parseFloat(String(p.costPrice)),
    }))
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value) // mayor valor primero

  const totalValue = productValues.reduce((sum, p) => sum + p.value, 0)

  // 4. Clasificar acumulando porcentaje de valor
  const classifications: { id: string; abcClass: string }[] = []
  let cumulative = 0

  for (const p of productValues) {
    cumulative += totalValue > 0 ? p.value / totalValue : 0
    classifications.push({
      id:       p.id,
      abcClass: cumulative <= 0.80 ? 'A' : cumulative <= 0.95 ? 'B' : 'C',
    })
  }

  // 5. Persistir en una transacción atómica
  const classifiedIds = new Set(classifications.map((c) => c.id))
  const cleared = products.length - classifications.length

  await prisma.$transaction([
    // Actualizar productos clasificados
    ...classifications.map((c) =>
      prisma.product.update({
        where: { id: c.id },
        data:  { abcClass: c.abcClass },
      }),
    ),
    // Limpiar abcClass de productos sin valor (sin costo o sin stock)
    prisma.product.updateMany({
      where: {
        tenantId,
        isActive: true,
        id:       { notIn: [...classifiedIds] },
      },
      data: { abcClass: null },
    }),
  ])

  return { classified: classifications.length, cleared }
}

// ─── Job semanal para todos los tenants ──────────────────────────────────────

async function runAbcForAllTenants(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, slug: true },
  })

  for (const tenant of tenants) {
    try {
      const result = await calculateAbcForTenant(tenant.id)
      console.info(
        `[ABC Job] ${tenant.slug}: ${result.classified} clasificados, ${result.cleared} limpiados`,
      )
    } catch (err) {
      console.error(`[ABC Job] Error en tenant ${tenant.slug}:`, err)
    }
  }
}

/**
 * Inicia el job semanal de clasificación ABC.
 * Llamar una vez al arrancar el servidor (en app.ts).
 */
export function startAbcScheduler(): void {
  setInterval(() => {
    runAbcForAllTenants().catch((err) =>
      console.error('[ABC Job] Error en ejecución semanal:', err),
    )
  }, SEVEN_DAYS_MS)

  console.info('[ABC Job] Scheduler registrado — corre cada 7 días')
}
