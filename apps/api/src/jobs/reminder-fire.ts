/**
 * HU-156 — Job de disparo de recordatorios universales.
 *
 * Corre cada minuto (y una vez al arrancar). Busca recordatorios ACTIVOS cuya `remind_at` ya
 * pasó y, por cada uno, genera una Notification para su usuario. Según la recurrencia:
 *   - none    → se desactiva (una sola vez).
 *   - hourly/daily/weekly/monthly → se reprograma a la próxima ocurrencia futura (un solo disparo
 *     aunque se hayan saltado varias: avanza hasta superar el "ahora", no genera spam).
 *
 * Fuera de request y de tenant: usa directPrisma (bypass RLS) con tenant_id/user_id explícitos,
 * patrón worker/jobs. El disparo no depende de que el usuario tenga la app abierta.
 */
import { ModuleName } from '@prisma/client'
import { directPrisma } from '../lib/prisma'
import { nextOccurrence } from '../modules/reminders/recurrence'

const ONE_MINUTE_MS = 60 * 1000

const REL: Record<string, { module: ModuleName; link: string }> = {
  appointment:    { module: ModuleName.AGENDA, link: '/agenda/appointments' },
  client:         { module: ModuleName.ARI,    link: '/ari/clients' },
  deal:           { module: ModuleName.ARI,    link: '/ari/pipeline' },
  purchase_order: { module: ModuleName.NIRA,   link: '/nira/purchase-orders' },
  rental:         { module: ModuleName.KIRA,   link: '/kira/rentals' },
}

const LEVEL_ICON: Record<string, string> = { critical: '🔴', urgent: '🟠', normal: '⏰' }

export async function runReminderFire(): Promise<{ fired: number }> {
  const now = new Date()
  const due = await directPrisma.reminder.findMany({
    where:  { isActive: true, remindAt: { lte: now } },
    select: { id: true, tenantId: true, userId: true, title: true, description: true, remindAt: true, alertLevel: true, recurrence: true, relatedType: true },
  })

  for (const r of due) {
    const rel = r.relatedType ? REL[r.relatedType] : undefined
    try {
      await directPrisma.notification.create({
        data: {
          tenantId: r.tenantId,
          userId:   r.userId,
          module:   rel?.module ?? null,
          type:     'reminder',
          title:    `${LEVEL_ICON[r.alertLevel] ?? '⏰'} ${r.title}`,
          message:  r.description ?? 'Recordatorio',
          link:     rel?.link ?? null,
        },
      })
      const next = nextOccurrence(r.remindAt, r.recurrence, now)
      // HU-202 — defensa en profundidad: directPrisma bypasea RLS → forzar tenantId en el where.
      await directPrisma.reminder.updateMany({
        where: { id: r.id, tenantId: r.tenantId },
        data:  next ? { remindAt: next, lastFiredAt: now } : { isActive: false, lastFiredAt: now },
      })
    } catch (err) {
      console.error(`[Reminders] Error disparando recordatorio ${r.id}:`, err)
    }
  }
  return { fired: due.length }
}

export function startReminderScheduler(): void {
  if (process.env['NODE_ENV'] !== 'test') {
    runReminderFire().catch((err) => console.error('[Reminders] Error en corrida inicial:', err))
  }
  setInterval(() => {
    runReminderFire().catch((err) => console.error('[Reminders] Error en ejecución:', err))
  }, ONE_MINUTE_MS)
  console.info('[Reminders] Scheduler registrado — corre cada 1 min')
}
