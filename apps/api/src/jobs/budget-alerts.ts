/**
 * Job diario de alertas de presupuesto VERA.
 *
 * Corre una vez al día para cada tenant con VERA activo.
 * Por cada presupuesto mensual configurado:
 *   - Calcula egresos del mes (manuales + automáticos)
 *   - Al 80 %: notificación de advertencia (PRESUPUESTO_ADVERTENCIA)
 *   - Al 100 %: notificación urgente (PRESUPUESTO_SUPERADO)
 *   - Deduplicación: no crea notificación si ya hay una no leída del mismo tipo/mes
 *
 * Destinatarios: TENANT_ADMIN del tenant + AREA_MANAGER de VERA.
 */

import { prisma, withTenantContext } from '../lib/prisma'
import { calcMonthExpenses } from '../modules/vera/budgets/service'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

// ─── Lógica por tenant ────────────────────────────────────────────────────────

export async function checkBudgetAlertsForTenant(
  tenantId: string,
): Promise<{ alertsCreated: number }> {
  return withTenantContext(tenantId, async (tx) => {
    const now   = new Date()
    const year  = now.getFullYear()
    const month = now.getMonth() + 1

    const budgets = await tx.monthlyBudget.findMany({
      where: { tenantId, year, month },
    })

    if (budgets.length === 0) return { alertsCreated: 0 }

    const recipients = await tx.user.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { role: 'TENANT_ADMIN' },
          { role: 'AREA_MANAGER', module: 'VERA' },
        ],
      },
      select: { id: true },
    })

    if (recipients.length === 0) return { alertsCreated: 0 }

    let alertsCreated = 0

    for (const budget of budgets) {
      const total  = Number(budget.amount)
      const spent  = await calcMonthExpenses(tenantId, year, month, budget.branchId)
      const pct    = total > 0 ? spent / total : 0

      const branchLabel = budget.branchId ? ` (sucursal ${budget.branchId})` : ''
      const link        = `/vera/transactions?dateFrom=${year}-${String(month).padStart(2, '0')}-01`

      if (pct >= 1) {
        const type    = `PRESUPUESTO_SUPERADO_${year}_${month}${budget.branchId ?? ''}`
        const title   = `Presupuesto superado — ${month}/${year}${branchLabel}`
        const message = `Los egresos del mes (${formatAmt(spent, budget.currency)}) superaron el presupuesto de ${formatAmt(total, budget.currency)}.`

        for (const user of recipients) {
          const dup = await tx.notification.findFirst({
            where: { userId: user.id, tenantId, type, isRead: false },
          })
          if (dup) continue
          await tx.notification.create({
            data: { tenantId, userId: user.id, module: 'VERA', type, title, message, link },
          })
          alertsCreated++
        }
      } else if (pct >= 0.8) {
        const type    = `PRESUPUESTO_ADVERTENCIA_${year}_${month}${budget.branchId ?? ''}`
        const title   = `Presupuesto al ${Math.round(pct * 100)} % — ${month}/${year}${branchLabel}`
        const message = `Los egresos del mes (${formatAmt(spent, budget.currency)}) alcanzaron el ${Math.round(pct * 100)} % del presupuesto de ${formatAmt(total, budget.currency)}.`

        for (const user of recipients) {
          const dup = await tx.notification.findFirst({
            where: { userId: user.id, tenantId, type, isRead: false },
          })
          if (dup) continue
          await tx.notification.create({
            data: { tenantId, userId: user.id, module: 'VERA', type, title, message, link },
          })
          alertsCreated++
        }
      }
    }

    return { alertsCreated }
  })
}

function formatAmt(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// ─── Job para todos los tenants ───────────────────────────────────────────────

async function runBudgetAlertsForAllTenants(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: {
      isActive:     true,
      featureFlags: { some: { module: 'VERA', enabled: true } },
    },
    select: { id: true, slug: true },
  })

  for (const tenant of tenants) {
    try {
      const result = await checkBudgetAlertsForTenant(tenant.id)
      if (result.alertsCreated > 0) {
        console.info(`[Budget Alerts Job] ${tenant.slug}: ${result.alertsCreated} alertas creadas`)
      }
    } catch (err) {
      console.error(`[Budget Alerts Job] Error en tenant ${tenant.slug}:`, err)
    }
  }
}

/**
 * Inicia el job diario de alertas de presupuesto VERA.
 * Llamar una vez al arrancar el servidor (en app.ts).
 */
export function startBudgetAlertsScheduler(): void {
  setInterval(() => {
    runBudgetAlertsForAllTenants().catch((err) =>
      console.error('[Budget Alerts Job] Error en ejecución diaria:', err),
    )
  }, ONE_DAY_MS)

  console.info('[Budget Alerts Job] Scheduler registrado — corre cada 24 h')
}
