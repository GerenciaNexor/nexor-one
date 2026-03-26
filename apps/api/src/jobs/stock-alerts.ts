/**
 * Job de alertas de stock crítico — corre cada hora para todos los tenants con KIRA activo.
 *
 * Por cada producto bajo su mínimo configurado:
 *   1. Busca los AREA_MANAGER de KIRA asignados a esa sucursal
 *   2. Si NIRA está activo, también notifica a los AREA_MANAGER de NIRA de la sucursal
 *   3. Evita duplicados: no crea notificación si ya hay una no leída para el mismo producto/sucursal
 *
 * Reglas:
 *   - minStock = 0 → no genera alertas (sin mínimo configurado)
 *   - Deduplicación por (userId, type='STOCK_CRITICO', link, isRead=false)
 *
 * En V2 se migrará a BullMQ con reintentos. En V1 usa setInterval.
 */

import { prisma, withTenantContext } from '../lib/prisma'

const ONE_HOUR_MS = 60 * 60 * 1000

// ─── Lógica de alertas por tenant ────────────────────────────────────────────

export async function checkStockAlertsForTenant(
  tenantId: string,
): Promise<{ alertsCreated: number }> {
  return withTenantContext(tenantId, async (tx) => {
    // 1. Stocks por debajo del mínimo (minStock > 0 y quantity < minStock)
    const allStocks = await tx.stock.findMany({
      where: { product: { tenantId, isActive: true, minStock: { gt: 0 } } },
      select: {
        quantity:  true,
        productId: true,
        branchId:  true,
        product: { select: { name: true, sku: true, minStock: true } },
        branch:  { select: { name: true } },
      },
    })

    const criticalStocks = allStocks.filter(
      (s) => parseFloat(String(s.quantity)) < s.product.minStock,
    )

    if (criticalStocks.length === 0) return { alertsCreated: 0 }

    // 2. ¿NIRA activo para este tenant?
    const niraFlag = await tx.featureFlag.findFirst({
      where: { tenantId, module: 'NIRA', enabled: true },
    })

    let alertsCreated = 0

    for (const stock of criticalStocks) {
      const currentQty = Math.max(0, parseFloat(String(stock.quantity)))
      const link       = `/kira/products/${stock.productId}?branchId=${stock.branchId}`
      const title      = `Stock crítico: ${stock.product.sku}`
      const message    = `${stock.product.name} en ${stock.branch.name} — stock actual: ${currentQty}, mínimo: ${stock.product.minStock}.`

      // 3. Notificar a AREA_MANAGER.KIRA de la sucursal
      const kiraManagers = await tx.user.findMany({
        where: { tenantId, isActive: true, role: 'AREA_MANAGER', module: 'KIRA', branchId: stock.branchId },
        select: { id: true },
      })

      for (const manager of kiraManagers) {
        const existing = await tx.notification.findFirst({
          where: { userId: manager.id, tenantId, type: 'STOCK_CRITICO', link, isRead: false },
        })
        if (existing) continue
        await tx.notification.create({
          data: { tenantId, userId: manager.id, module: 'KIRA', type: 'STOCK_CRITICO', title, message, link },
        })
        alertsCreated++
      }

      // 4. Si NIRA está activo, notificar también a AREA_MANAGER.NIRA con enlace para crear OC
      if (niraFlag) {
        const niraLink    = `/nira/purchase-orders?productId=${stock.productId}&branchId=${stock.branchId}`
        const niraTitle   = `Reabastecimiento requerido: ${stock.product.sku}`
        const niraMessage = `${stock.product.name} en ${stock.branch.name} — stock actual: ${currentQty}, mínimo: ${stock.product.minStock}. Crea una orden de compra para reponer el inventario.`

        const niraManagers = await tx.user.findMany({
          where: { tenantId, isActive: true, role: 'AREA_MANAGER', module: 'NIRA', branchId: stock.branchId },
          select: { id: true },
        })

        for (const manager of niraManagers) {
          const existing = await tx.notification.findFirst({
            where: { userId: manager.id, tenantId, type: 'REABASTECIMIENTO_REQUERIDO', link: niraLink, isRead: false },
          })
          if (existing) continue
          await tx.notification.create({
            data: {
              tenantId,
              userId:  manager.id,
              module:  'NIRA',
              type:    'REABASTECIMIENTO_REQUERIDO',
              title:   niraTitle,
              message: niraMessage,
              link:    niraLink,
            },
          })
          alertsCreated++
        }
      }
    }

    return { alertsCreated }
  })
}

// ─── Job para todos los tenants ───────────────────────────────────────────────

async function runStockAlertsForAllTenants(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: {
      isActive:     true,
      featureFlags: { some: { module: 'KIRA', enabled: true } },
    },
    select: { id: true, slug: true },
  })

  for (const tenant of tenants) {
    try {
      const result = await checkStockAlertsForTenant(tenant.id)
      if (result.alertsCreated > 0) {
        console.info(
          `[Stock Alerts Job] ${tenant.slug}: ${result.alertsCreated} alertas creadas`,
        )
      }
    } catch (err) {
      console.error(`[Stock Alerts Job] Error en tenant ${tenant.slug}:`, err)
    }
  }
}

/**
 * Inicia el job horario de alertas de stock crítico.
 * Llamar una vez al arrancar el servidor (en app.ts).
 */
export function startStockAlertsScheduler(): void {
  setInterval(() => {
    runStockAlertsForAllTenants().catch((err) =>
      console.error('[Stock Alerts Job] Error en ejecución horaria:', err),
    )
  }, ONE_HOUR_MS)

  console.info('[Stock Alerts Job] Scheduler registrado — corre cada hora')
}
