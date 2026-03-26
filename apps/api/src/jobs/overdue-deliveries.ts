/**
 * Job de seguimiento de entregas vencidas — corre diariamente para todos los tenants con NIRA activo.
 *
 * Detecta OC en estado approved/sent/partial cuya expectedDelivery ya pasó
 * y que no han sido recibidas completamente.
 * Crea una notificación in-app para el AREA_MANAGER de NIRA con el proveedor y días de retraso.
 * Deduplicación: no crea notificación si ya existe una no leída para esa OC.
 *
 * En V1 usa setInterval — en V2 se migrará a BullMQ con reintentos.
 */

import { prisma, withTenantContext } from '../lib/prisma'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

const OVERDUE_STATUSES = ['approved', 'sent', 'partial'] as const

// ─── Lógica por tenant ────────────────────────────────────────────────────────

export async function checkOverdueDeliveriesForTenant(
  tenantId: string,
): Promise<{ alertsCreated: number }> {
  return withTenantContext(tenantId, async (tx) => {
    const now   = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // OC aprobadas/enviadas/parciales con fecha de entrega vencida
    const overdueOrders = await tx.purchaseOrder.findMany({
      where: {
        tenantId,
        status:          { in: [...OVERDUE_STATUSES] },
        expectedDelivery: { lt: today },
      },
      select: {
        id:               true,
        orderNumber:      true,
        expectedDelivery: true,
        supplier:         { select: { name: true } },
      },
    })

    if (overdueOrders.length === 0) return { alertsCreated: 0 }

    // AREA_MANAGER.NIRA del tenant (sin filtro de sucursal — aplica a todas)
    const managers = await tx.user.findMany({
      where: { tenantId, isActive: true, role: 'AREA_MANAGER', module: 'NIRA' },
      select: { id: true },
    })

    if (managers.length === 0) return { alertsCreated: 0 }

    let alertsCreated = 0

    for (const order of overdueOrders) {
      const daysOverdue = Math.floor(
        (today.getTime() - new Date(order.expectedDelivery!).getTime()) / ONE_DAY_MS,
      )
      const supplierName = order.supplier?.name ?? 'proveedor sin asignar'
      const link         = `/nira/purchase-orders/${order.id}`

      for (const manager of managers) {
        // Deduplicación: no crear si ya hay una alerta no leída para esta OC
        const existing = await tx.notification.findFirst({
          where: {
            userId:   manager.id,
            tenantId,
            type:     'ENTREGA_VENCIDA',
            link,
            isRead:   false,
          },
        })
        if (existing) continue

        await tx.notification.create({
          data: {
            tenantId,
            userId:  manager.id,
            module:  'NIRA',
            type:    'ENTREGA_VENCIDA',
            title:   `Entrega vencida: ${order.orderNumber}`,
            message: `La OC ${order.orderNumber} de ${supplierName} lleva ${daysOverdue} ${daysOverdue === 1 ? 'día' : 'días'} sin recibirse. Fecha esperada: ${new Date(order.expectedDelivery!).toLocaleDateString('es-CO')}.`,
            link,
          },
        })
        alertsCreated++
      }
    }

    return { alertsCreated }
  })
}

// ─── Job para todos los tenants ───────────────────────────────────────────────

async function runOverdueDeliveriesForAllTenants(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: {
      isActive:     true,
      featureFlags: { some: { module: 'NIRA', enabled: true } },
    },
    select: { id: true, slug: true },
  })

  for (const tenant of tenants) {
    try {
      const result = await checkOverdueDeliveriesForTenant(tenant.id)
      if (result.alertsCreated > 0) {
        console.info(
          `[Overdue Deliveries] ${tenant.slug}: ${result.alertsCreated} alertas creadas`,
        )
      }
    } catch (err) {
      console.error(`[Overdue Deliveries] Error en tenant ${tenant.slug}:`, err)
    }
  }
}

/**
 * Inicia el job diario de seguimiento de entregas vencidas.
 * Llamar una vez al arrancar el servidor (en app.ts).
 */
export function startOverdueDeliveriesScheduler(): void {
  setInterval(() => {
    runOverdueDeliveriesForAllTenants().catch((err) =>
      console.error('[Overdue Deliveries] Error en ejecución diaria:', err),
    )
  }, ONE_DAY_MS)

  console.info('[Overdue Deliveries] Scheduler registrado — corre cada 24 h')
}

/** Exportado para poder lanzar la verificación manualmente desde el panel de admin. */
export { runOverdueDeliveriesForAllTenants }
