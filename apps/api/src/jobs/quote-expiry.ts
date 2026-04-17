/**
 * Job de vencimiento de cotizaciones — corre diariamente para todos los tenants con ARI activo.
 *
 * Paso 1: Cotizaciones en estado draft/sent cuya validUntil ya pasó →
 *         set status = 'expired' + notificación COTIZACION_VENCIDA al creador.
 * Paso 2: Cotizaciones en estado draft/sent que vencen en ≤3 días →
 *         notificación COTIZACION_POR_VENCER al creador.
 * Deduplicación: no crea notificación si ya existe una no leída del mismo tipo para esa cotización.
 *
 * En V1 usa setInterval — en V2 se migrará a BullMQ con reintentos.
 */

import { prisma, withTenantContext } from '../lib/prisma'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

// ─── Lógica por tenant ────────────────────────────────────────────────────────

export async function processQuoteExpiryForTenant(
  tenantId: string,
): Promise<{ expired: number; warnings: number }> {
  return withTenantContext(tenantId, async (tx) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const inThreeDays = new Date(today)
    inThreeDays.setDate(inThreeDays.getDate() + 3)

    // ── Paso 1: auto-vencer cotizaciones vencidas ──────────────────────────────

    const overdueQuotes = await tx.quote.findMany({
      where: {
        tenantId,
        status:     { in: ['draft', 'sent'] },
        validUntil: { lt: today },
      },
      select: { id: true, quoteNumber: true, createdBy: true },
    })

    let expired = 0

    for (const quote of overdueQuotes) {
      await tx.quote.update({
        where: { id: quote.id },
        data:  { status: 'expired' },
      })

      const link = `/ari/quotes/${quote.id}`

      const existing = await tx.notification.findFirst({
        where: { userId: quote.createdBy, tenantId, type: 'COTIZACION_VENCIDA', isRead: false, link },
      })

      if (!existing) {
        await tx.notification.create({
          data: {
            tenantId,
            userId:  quote.createdBy,
            module:  'ARI',
            type:    'COTIZACION_VENCIDA',
            title:   `Cotización vencida: ${quote.quoteNumber}`,
            message: `La cotización ${quote.quoteNumber} venció sin ser aceptada. Crea una nueva si el cliente sigue interesado.`,
            link,
          },
        })
      }
      expired++
    }

    // ── Paso 2: alertar cotizaciones por vencer (≤3 días) ────────────────────

    const soonQuotes = await tx.quote.findMany({
      where: {
        tenantId,
        status:     { in: ['draft', 'sent'] },
        validUntil: { gte: today, lte: inThreeDays },
      },
      select: { id: true, quoteNumber: true, createdBy: true, validUntil: true },
    })

    let warnings = 0

    for (const quote of soonQuotes) {
      const link = `/ari/quotes/${quote.id}`

      const existing = await tx.notification.findFirst({
        where: { userId: quote.createdBy, tenantId, type: 'COTIZACION_POR_VENCER', isRead: false, link },
      })
      if (existing) continue

      const daysLeft = Math.ceil(
        (new Date(quote.validUntil!).getTime() - today.getTime()) / ONE_DAY_MS,
      )

      await tx.notification.create({
        data: {
          tenantId,
          userId:  quote.createdBy,
          module:  'ARI',
          type:    'COTIZACION_POR_VENCER',
          title:   `Cotización por vencer: ${quote.quoteNumber}`,
          message: `La cotización ${quote.quoteNumber} vence en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}. Haz seguimiento con el cliente.`,
          link,
        },
      })
      warnings++
    }

    return { expired, warnings }
  })
}

// ─── Job para todos los tenants ───────────────────────────────────────────────

async function runQuoteExpiryForAllTenants(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: {
      isActive:     true,
      featureFlags: { some: { module: 'ARI', enabled: true } },
    },
    select: { id: true, slug: true },
  })

  for (const tenant of tenants) {
    try {
      const result = await processQuoteExpiryForTenant(tenant.id)
      if (result.expired > 0 || result.warnings > 0) {
        console.info(
          `[Quote Expiry] ${tenant.slug}: ${result.expired} vencidas, ${result.warnings} por vencer`,
        )
      }
    } catch (err) {
      console.error(`[Quote Expiry] Error en tenant ${tenant.slug}:`, err)
    }
  }
}

/**
 * Inicia el job diario de vencimiento de cotizaciones.
 * Llamar una vez al arrancar el servidor (en app.ts).
 */
export function startQuoteExpiryScheduler(): void {
  setInterval(() => {
    runQuoteExpiryForAllTenants().catch((err) =>
      console.error('[Quote Expiry] Error en ejecución diaria:', err),
    )
  }, ONE_DAY_MS)

  console.info('[Quote Expiry] Scheduler registrado — corre cada 24 h')
}

/** Exportado para lanzar la verificación manualmente desde el panel de admin. */
export { runQuoteExpiryForAllTenants }
