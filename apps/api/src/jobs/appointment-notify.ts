/**
 * HU-211 — Avisos INTERNOS de cita: dos por cita, uno faltando 5 minutos y otro a la hora exacta.
 *
 * Corre cada minuto. Para las citas/eventos confirmed|scheduled crea la notificación IN-APP y la
 * extiende por WhatsApp (vía notifyUsers) al equipo interno responsable: profesional + creador y, en
 * eventos, los asistentes internos. Anti-duplicado con `notified5MinAt` / `notifiedStartAt` (una sola
 * vez cada aviso). Fuera de request: directPrisma. Zona horaria del tenant (HU-189). Nunca rompe.
 */
import { directPrisma } from '../lib/prisma'
import { notifyUsers } from '../lib/user-notify'

const ONE_MINUTE_MS = 60 * 1000
const FIVE_MIN_MS   = 5 * 60 * 1000
const GRACE_MS      = 10 * 60 * 1000  // ventana de la hora exacta (tolera reinicios sin backfill viejo)

const APPT_SELECT = {
  id: true, tenantId: true, type: true, title: true, clientName: true, startAt: true,
  createdBy: true, professionalId: true,
  serviceType: { select: { name: true } },
  branch:      { select: { name: true } },
  attendees:   { select: { userId: true } },
} as const

type ApptRow = {
  id: string; tenantId: string; type: string; title: string | null; clientName: string | null; startAt: Date
  createdBy: string | null; professionalId: string | null
  serviceType: { name: string } | null; branch: { name: string } | null; attendees: { userId: string | null }[]
}

/** Nombre legible de la cita/evento (evento → título; servicio → cliente · servicio). */
function apptName(a: ApptRow): string {
  if (a.type === 'event') return a.title ?? 'Evento'
  const cli = a.clientName ?? 'Cliente'
  const srv = a.serviceType?.name
  return srv ? `${cli} · ${srv}` : cli
}

/** Destinatarios internos: profesional + creador (+ asistentes internos en eventos), sin duplicar. */
function recipientsOf(a: ApptRow): string[] {
  const ids = [a.professionalId, a.createdBy, ...a.attendees.map((x) => x.userId)]
  return [...new Set(ids.filter((x): x is string => !!x))]
}

async function fire(a: ApptRow, kind: '5min' | 'start'): Promise<void> {
  const userIds = recipientsOf(a)
  if (userIds.length === 0) return
  const name = apptName(a)
  const noun = a.type === 'event' ? 'evento' : 'cita'
  const tz   = (await directPrisma.tenant.findFirst({ where: { id: a.tenantId }, select: { timezone: true } }))?.timezone ?? 'America/Bogota'
  const hora = new Intl.DateTimeFormat('es-CO', { timeZone: tz, timeStyle: 'short' }).format(a.startAt)

  const title   = kind === '5min' ? `⏰ En 5 min: ${name}` : `🔔 Ahora: ${name}`
  const message = kind === '5min'
    ? `Tu ${noun} «${name}» empieza en 5 minutos (${hora}).`
    : `Tu ${noun} «${name}» es ahora (${hora}).`
  const subject = kind === '5min' ? `Tu ${noun} empieza en 5 min: ${name}` : `Tu ${noun} es ahora: ${name}`

  await notifyUsers(directPrisma, {
    tenantId: a.tenantId, userIds, module: 'AGENDA',
    type: kind === '5min' ? 'cita_5min' : 'cita_ahora',
    title, message, link: '/agenda/appointments',
    wa: { subject, when: a.startAt },
  })
}

export async function runAppointmentNotify(): Promise<{ fired5: number; firedStart: number }> {
  const now = new Date()

  // ── Aviso "faltando 5 min": la cita empieza dentro de los próximos 5 min y aún no se avisó ──
  const soon = await directPrisma.appointment.findMany({
    where: {
      status: { in: ['confirmed', 'scheduled'] },
      notified5MinAt: null,
      startAt: { gt: now, lte: new Date(now.getTime() + FIVE_MIN_MS) },
    },
    select: APPT_SELECT,
  })
  for (const a of soon) {
    try {
      await fire(a as ApptRow, '5min')
      await directPrisma.appointment.updateMany({ where: { id: a.id, tenantId: a.tenantId }, data: { notified5MinAt: now } })
    } catch (err) { console.error(`[ApptNotify] error 5min cita ${a.id}:`, err) }
  }

  // ── Aviso "hora exacta": la cita ya empezó (dentro de una ventana de gracia) y aún no se avisó ──
  const started = await directPrisma.appointment.findMany({
    where: {
      status: { in: ['confirmed', 'scheduled'] },
      notifiedStartAt: null,
      startAt: { lte: now, gt: new Date(now.getTime() - GRACE_MS) },
    },
    select: APPT_SELECT,
  })
  for (const a of started) {
    try {
      await fire(a as ApptRow, 'start')
      await directPrisma.appointment.updateMany({ where: { id: a.id, tenantId: a.tenantId }, data: { notifiedStartAt: now } })
    } catch (err) { console.error(`[ApptNotify] error hora exacta cita ${a.id}:`, err) }
  }

  return { fired5: soon.length, firedStart: started.length }
}

export function startAppointmentNotifyScheduler(): void {
  setInterval(() => {
    runAppointmentNotify().catch((err) => console.error('[ApptNotify] error en ejecución:', err))
  }, ONE_MINUTE_MS)
  console.info('[ApptNotify] Scheduler de avisos de cita registrado — corre cada 1 min (5 min antes + hora exacta)')
}
