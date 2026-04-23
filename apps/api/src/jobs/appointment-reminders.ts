/**
 * Job de recordatorios de citas — corre diariamente para todos los tenants con AGENDA activo.
 *
 * Detecta citas en estado confirmed/scheduled del día siguiente (en la zona horaria del tenant),
 * genera un token de cancelación de un solo uso por cita y envía el email de recordatorio.
 * Deduplicación: no envía si reminderSent = true.
 * Aislamiento de errores: fallo en una cita no bloquea las demás.
 *
 * En V1 usa setInterval — en V2 se migrará a BullMQ con reintentos.
 */

import crypto from 'node:crypto'
import { prisma } from '../lib/prisma'
import { sendAppointmentReminder } from '../lib/email'

const ONE_DAY_MS     = 24 * 60 * 60 * 1000
const CANCEL_BASE_URL = process.env['API_BASE_URL'] ?? 'http://localhost:3001'

// ─── Helpers de zona horaria ──────────────────────────────────────────────────

function getUTCOffsetMinutes(timezone: string, date: Date): number {
  const utcStr   = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const localStr = date.toLocaleString('en-US', { timeZone: timezone })
  return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000
}

function getTomorrowUTCRange(timezone: string): { gte: Date; lt: Date } {
  const now      = new Date()
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone })
  const [y, mo, d] = todayStr.split('-').map(Number) as [number, number, number]

  // Avanzar 1 día (Date.UTC maneja los bordes de mes/año correctamente)
  const tomorrowUTC = new Date(Date.UTC(y, mo - 1, d + 1))
  const ty  = tomorrowUTC.getUTCFullYear()
  const tmo = tomorrowUTC.getUTCMonth() + 1
  const td  = tomorrowUTC.getUTCDate()

  const naiveStart = new Date(Date.UTC(ty, tmo - 1, td,  0,  0,  0))
  const naiveEnd   = new Date(Date.UTC(ty, tmo - 1, td, 23, 59, 59))

  const offsetStart = getUTCOffsetMinutes(timezone, naiveStart)
  const offsetEnd   = getUTCOffsetMinutes(timezone, naiveEnd)

  return {
    gte: new Date(naiveStart.getTime() - offsetStart * 60_000),
    lt:  new Date(naiveEnd.getTime()   - offsetEnd   * 60_000 + 1_000),
  }
}

// ─── Lógica por tenant ────────────────────────────────────────────────────────

export async function sendRemindersForTenant(tenantId: string): Promise<{ sent: number }> {
  const tenant = await prisma.tenant.findFirst({
    where:  { id: tenantId },
    select: { timezone: true, name: true },
  })
  if (!tenant) return { sent: 0 }

  const tz    = tenant.timezone ?? 'America/Bogota'
  const range = getTomorrowUTCRange(tz)

  const appointments = await prisma.appointment.findMany({
    where: {
      tenantId,
      reminderSent: false,
      status:       { in: ['confirmed', 'scheduled'] },
      startAt:      range,
      clientEmail:  { not: null },
    },
    select: {
      id:          true,
      clientName:  true,
      clientEmail: true,
      startAt:     true,
      serviceType: { select: { name: true } },
      branch:      { select: { name: true } },
      professional: { select: { name: true } },
    },
  })

  if (appointments.length === 0) return { sent: 0 }

  let sent = 0

  for (const appt of appointments) {
    try {
      const rawToken  = crypto.randomBytes(32).toString('hex')
      // El token expira 2 horas antes de la cita
      const expiresAt = new Date(appt.startAt.getTime() - 2 * 60 * 60_000)

      await prisma.appointmentCancelToken.create({
        data: {
          token:         rawToken,
          tenantId,
          appointmentId: appt.id,
          expiresAt,
        },
      })

      await sendAppointmentReminder({
        to:               appt.clientEmail!,
        clientName:       appt.clientName,
        serviceName:      appt.serviceType?.name ?? 'Servicio',
        branchName:       appt.branch.name,
        professionalName: appt.professional?.name,
        startAt:          appt.startAt,
        tenantName:       tenant.name,
        timezone:         tz,
        cancelUrl:        `${CANCEL_BASE_URL}/v1/agenda/cancel/${rawToken}`,
      })

      await prisma.appointment.update({
        where: { id: appt.id },
        data:  { reminderSent: true },
      })

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
 * Inicia el job diario de recordatorios de citas.
 * Llamar una vez al arrancar el servidor (en app.ts).
 */
export function startAppointmentRemindersScheduler(): void {
  setInterval(() => {
    runRemindersForAllTenants().catch((err) =>
      console.error('[Reminders] Error en ejecución diaria:', err),
    )
  }, ONE_DAY_MS)

  console.info('[Reminders] Scheduler registrado — corre cada 24 h')
}

export { runRemindersForAllTenants }
