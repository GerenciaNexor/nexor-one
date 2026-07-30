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

const ONE_MINUTE_MS = 60 * 1000

const REL: Record<string, { module: ModuleName; link: string }> = {
  appointment:    { module: ModuleName.AGENDA, link: '/agenda/appointments' },
  client:         { module: ModuleName.ARI,    link: '/ari/clients' },
  deal:           { module: ModuleName.ARI,    link: '/ari/pipeline' },
  purchase_order: { module: ModuleName.NIRA,   link: '/nira/purchase-orders' },
}

const LEVEL_ICON: Record<string, string> = { critical: '🔴', urgent: '🟠', normal: '⏰' }

/** Próxima ocurrencia estrictamente futura, o null si no es recurrente. */
function nextOccurrence(from: Date, recurrence: string, now: Date): Date | null {
  if (recurrence === 'none') return null
  const stepMs: Record<string, number> = { hourly: 3_600_000, daily: 86_400_000, weekly: 604_800_000 }
  const d = new Date(from)
  let guard = 0
  do {
    if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1)
    else d.setTime(d.getTime() + (stepMs[recurrence] ?? 86_400_000))
  } while (d.getTime() <= now.getTime() && ++guard < 100_000)
  return d
}

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
      await directPrisma.reminder.update({
        where: { id: r.id },
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
