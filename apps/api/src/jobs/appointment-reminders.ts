/**
 * Job de recordatorios de citas — corre cada 15 min para todos los tenants con AGENDA activo.
 *
 * Detecta citas confirmed/scheduled que entran en la ventana de anticipación configurable
 * (APPOINTMENT_REMINDER_HOURS_BEFORE, default 24 h) y avisa al cliente por email (con token de
 * cancelación de un solo uso) y/o por WhatsApp (HU-208, capa oficial de HU-207). El contenido usa
 * la zona horaria del tenant (HU-189).
 * Deduplicación: no envía si reminderSent = true (un solo aviso por cita).
 * Aislamiento de errores: fallo en una cita no bloquea las demás; WhatsApp nunca lanza.
 *
 * En V1 usa setInterval — en V2 se migrará a BullMQ con reintentos.
 */

import crypto from 'node:crypto'
// Job de fondo (fuera de request, sin contexto de tenant). Usa directPrisma (bypass RLS)
// con filtro tenantId explícito en cada query — patrón worker/jobs. Necesario porque
// appointment_cancel_tokens pasa a tener RLS (HU-140-fix); además evita la tx larga que
// implicaría withTenantContext con envío de emails dentro.
import { directPrisma as prisma } from '../lib/prisma'
import { sendAppointmentReminder } from '../lib/email'
import { sendWhatsAppNotificationIfOptedIn } from '../lib/whatsapp'

// HU-208 — anticipación CONFIGURABLE (horas antes de la cita). Default 24 h ("el día anterior").
// El job corre cada 15 min y avisa las citas que entran en la ventana [ahora+H, ahora+H+15min);
// `reminderSent` garantiza UN SOLO aviso por cita (anti-duplicado, patrón HU-181).
const REMINDER_HOURS_BEFORE = (() => { const v = Number(process.env['APPOINTMENT_REMINDER_HOURS_BEFORE']); return Number.isFinite(v) && v > 0 ? v : 24 })()
const WINDOW_MS       = 15 * 60 * 1000
const CANCEL_BASE_URL = process.env['API_BASE_URL'] ?? 'http://localhost:3001'

// ─── Lógica por tenant ────────────────────────────────────────────────────────

export async function sendRemindersForTenant(tenantId: string): Promise<{ sent: number }> {
  const tenant = await prisma.tenant.findFirst({
    where:  { id: tenantId },
    select: { timezone: true, name: true },
  })
  if (!tenant) return { sent: 0 }

  const tz  = tenant.timezone ?? 'America/Bogota'
  // Ventana absoluta "H horas antes" (independiente de tz; el CONTENIDO del mensaje sí usa tz).
  const now = Date.now()
  const gte = new Date(now + REMINDER_HOURS_BEFORE * 3_600_000)
  const lt  = new Date(gte.getTime() + WINDOW_MS)

  const appointments = await prisma.appointment.findMany({
    where: {
      tenantId,
      type:         'service',   // HU-204 — solo citas de servicio reciben recordatorio al cliente
      reminderSent: false,
      status:       { in: ['confirmed', 'scheduled'] },
      startAt:      { gte, lt },
      // HU-208 — alcanza por email Y/O WhatsApp: basta con tener uno de los dos.
      OR: [{ clientEmail: { not: null } }, { clientPhone: { not: null } }],
    },
    select: {
      id:          true,
      clientName:  true,
      clientEmail: true,
      clientPhone: true,
      startAt:     true,
      serviceType: { select: { name: true } },
      branch:      { select: { name: true } },
      professional: { select: { name: true } },
      client:      { select: { whatsappOptIn: true } }, // HU-209 — consentimiento del cliente
    },
  })

  if (appointments.length === 0) return { sent: 0 }

  // HU-209 — plantilla recordatorio_cita: fecha y hora en variables separadas ({{2}}/{{3}}).
  const fmtDate = new Intl.DateTimeFormat('es-CO', { timeZone: tz, dateStyle: 'long' })
  const fmtTime = new Intl.DateTimeFormat('es-CO', { timeZone: tz, timeStyle: 'short' })
  let sent = 0

  for (const appt of appointments) {
    try {
      const clientName  = appt.clientName ?? 'Cliente'
      const serviceName = appt.serviceType?.name ?? 'Servicio'
      const branchName  = appt.branch?.name ?? 'Sucursal'

      // ── Email (si hay correo) — con enlace de cancelación de un solo uso ─────
      if (appt.clientEmail) {
        const rawToken  = crypto.randomBytes(32).toString('hex')
        // Expira 2 h antes de la cita; si la anticipación es corta, al menos +5 min desde ahora.
        const expiresAt = new Date(Math.max(appt.startAt.getTime() - 2 * 3_600_000, now + 5 * 60_000))
        await prisma.appointmentCancelToken.create({ data: { token: rawToken, tenantId, appointmentId: appt.id, expiresAt } })
        await sendAppointmentReminder({
          to: appt.clientEmail, clientName, serviceName, branchName,
          professionalName: appt.professional?.name, startAt: appt.startAt,
          tenantName: tenant.name, timezone: tz,
          cancelUrl: `${CANCEL_BASE_URL}/v1/agenda/cancel/${rawToken}`,
        })
      }

      // ── WhatsApp (si hay teléfono) — HU-208, vía capa oficial de HU-207 ──────
      // Privacidad: solo nombre, fecha/hora y servicio/sucursal; nada de terceros.
      // HU-209 — respeta el opt-in del cliente; sin cliente registrado (número inline) = opt-in implícito.
      if (appt.clientPhone) {
        // recordatorio_cita → 1=nombre, 2=fecha, 3=hora, 4=lugar (servicio en la sucursal).
        void sendWhatsAppNotificationIfOptedIn('appointment_reminder', {
          tenantId, to: appt.clientPhone, optIn: appt.client?.whatsappOptIn ?? true,
          bodyParams: [clientName, fmtDate.format(appt.startAt), fmtTime.format(appt.startAt), `${serviceName} — ${branchName}`],
        })
      }

      // HU-202 — defensa en profundidad: directPrisma bypasea RLS → forzar tenantId en el where.
      await prisma.appointment.updateMany({ where: { id: appt.id, tenantId }, data: { reminderSent: true } })
      sent++
    } catch (err) {
      console.error(`[Reminders] Error procesando cita ${appt.id}:`, err)
    }
  }

  return { sent }
}

// ─── Job para todos los tenants ───────────────────────────────────────────────

async function runRemindersForAllTenants(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: {
      isActive:     true,
      featureFlags: { some: { module: 'AGENDA', enabled: true } },
    },
    select: { id: true, slug: true },
  })

  for (const tenant of tenants) {
    try {
      const result = await sendRemindersForTenant(tenant.id)
      if (result.sent > 0) {
        console.info(`[Reminders] ${tenant.slug}: ${result.sent} recordatorios enviados`)
      }
    } catch (err) {
      console.error(`[Reminders] Error en tenant ${tenant.slug}:`, err)
    }
  }
}

/**
 * Inicia el job de recordatorios de citas. Corre cada 15 min (coherente con la ventana de anticipación
 * configurable de HU-208) para poder avisar tanto "el día anterior" como "1 hora antes". Llamar una
 * vez al arrancar el servidor (en app.ts).
 */
export function startAppointmentRemindersScheduler(): void {
  setInterval(() => {
    runRemindersForAllTenants().catch((err) =>
      console.error('[Reminders] Error en ejecución de recordatorios de citas:', err),
    )
  }, WINDOW_MS)

  console.info(`[Reminders] Scheduler de citas registrado — corre cada 15 min (anticipación: ${REMINDER_HOURS_BEFORE} h antes)`)
}

export { runRemindersForAllTenants }
