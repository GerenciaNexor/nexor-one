/**
 * Motor de slots disponibles — HU-068
 *
 * Dado un servicio, sucursal y fecha calcula los horarios libres considerando:
 *   1. Disponibilidad configurada de la sucursal (Availability)
 *   2. Duración del servicio
 *   3. Citas ya agendadas (Appointment, status != 'cancelled')
 *   4. Fechas bloqueadas (BlockedDate)
 *   5. Slots ya pasados del día actual
 *
 * Reglas de profesionales:
 *   - Con professionalId   → slots donde ese profesional específico está libre
 *   - Sin professionalId, servicio con profesionales → slots con ≥1 profesional libre
 *   - Sin professionalId, servicio sin profesionales → todos los slots de la sucursal
 */

import { prisma } from '../../../lib/prisma'
import type { SlotsQuery } from './schema'

// ─── Utilidades de zona horaria (sin dependencias externas) ───────────────────

/**
 * Retorna el offset UTC→local en minutos para una zona horaria dada.
 * Ejemplo: "America/Bogota" → -300 (UTC-5)
 */
function getUTCOffsetMinutes(timezone: string, date: Date): number {
  const utcStr   = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const localStr = date.toLocaleString('en-US', { timeZone: timezone })
  return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000
}

/**
 * Convierte una hora local (minutos desde medianoche) de una fecha en una
 * zona horaria específica al equivalente UTC.
 */
function localMinutesToUTC(dateStr: string, minutesFromMidnight: number, timezone: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number) as [number, number, number]
  const h = Math.floor(minutesFromMidnight / 60)
  const m = minutesFromMidnight % 60
  // Tratamos la hora como UTC (naive) y luego compensamos el offset
  const naive = new Date(Date.UTC(y, mo - 1, d, h, m, 0))
  const offsetMin = getUTCOffsetMinutes(timezone, naive)
  return new Date(naive.getTime() - offsetMin * 60_000)
}

function minutesToHHMM(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

// ─── Motor principal ──────────────────────────────────────────────────────────

export async function getAvailableSlots(tenantId: string, query: SlotsQuery) {
  const { serviceId, branchId, date, professionalId } = query

  // ── 1. Validar rango de fecha (hoy..hoy+60 días) ───────────────────────────
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number]
  const requestedDate = new Date(Date.UTC(y, mo - 1, d))
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const maxDate = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000)

  if (requestedDate < today) {
    return { date, serviceId, branchId, durationMinutes: 0, slots: [], total: 0 }
  }
  if (requestedDate > maxDate) {
    throw { statusCode: 400, message: 'La fecha supera el límite de 60 días', code: 'DATE_OUT_OF_RANGE' }
  }

  // ── 2. Cargar datos en paralelo: tenant, bloqueo, servicio ─────────────────
  const [tenant, blocked, service] = await Promise.all([
    prisma.tenant.findFirst({
      where:  { id: tenantId },
      select: { timezone: true },
    }),
    prisma.blockedDate.findFirst({
      where: {
        tenantId,
        date: requestedDate,
        OR: [{ branchId }, { branchId: null }],
      },
      select: { reason: true },
    }),
    prisma.serviceType.findFirst({
      where:  { id: serviceId, tenantId, isActive: true },
      select: {
        durationMinutes: true,
        professionals:   { select: { user: { select: { id: true, name: true } } } },
      },
    }),
  ])

  const timezone = tenant?.timezone ?? 'America/Bogota'

  // Fecha bloqueada → sin slots
  if (blocked) {
    return {
      date, serviceId, branchId,
      durationMinutes: 0, slots: [], total: 0,
      blocked: true, blockReason: blocked.reason ?? null,
    }
  }

  if (!service) {
    throw { statusCode: 404, message: 'Servicio no encontrado o inactivo', code: 'NOT_FOUND' }
  }

  // Validar profesional si se especificó
  if (professionalId) {
    const user = await prisma.user.findFirst({
      where:  { id: professionalId, tenantId, isActive: true },
      select: { id: true },
    })
    if (!user) throw { statusCode: 404, message: 'Profesional no encontrado', code: 'NOT_FOUND' }
  }

  const duration             = service.durationMinutes
  const serviceProfessionals = service.professionals.map((p) => p.user)
  const serviceProfIds       = serviceProfessionals.map((p) => p.id)
  const dayOfWeek            = new Date(Date.UTC(y, mo - 1, d)).getUTCDay()

  // ── 3. Obtener bloques de disponibilidad ───────────────────────────────────
  const availBlocks = await prisma.availability.findMany({
    where: professionalId
      ? {
          tenantId,
          dayOfWeek,
          isActive: true,
          OR: [
            { branchId, userId: null },             // horario general de la sucursal
            { branchId, userId: professionalId },   // horario personal en esta sucursal
            { branchId: null, userId: professionalId }, // horario personal global
          ],
        }
      : {
          tenantId,
          branchId,
          userId:    null,
          dayOfWeek,
          isActive:  true,
        },
    select: { startTime: true, endTime: true },
  })

  if (availBlocks.length === 0) {
    return { date, serviceId, branchId, durationMinutes: duration, slots: [], total: 0 }
  }

  // ── 4. Generar slots candidatos (minutos desde medianoche) ─────────────────
  const rawSlots: Array<{ startMin: number; endMin: number }> = []

  for (const block of availBlocks) {
    const blockStart = block.startTime.getUTCHours() * 60 + block.startTime.getUTCMinutes()
    const blockEnd   = block.endTime.getUTCHours()   * 60 + block.endTime.getUTCMinutes()
    let s = blockStart
    while (s + duration <= blockEnd) {
      rawSlots.push({ startMin: s, endMin: s + duration })
      s += duration
    }
  }

  // Deduplicar (puede haber solapamiento si hay varios bloques) y ordenar
  const uniqueSlots = Array.from(
    new Map(rawSlots.map((s) => [s.startMin, s])).values(),
  ).sort((a, b) => a.startMin - b.startMin)

  // ── 5. Obtener citas del día para esa sucursal ─────────────────────────────
  const dayStartUTC = localMinutesToUTC(date, 0,           timezone)
  const dayEndUTC   = localMinutesToUTC(date, 23 * 60 + 59, timezone)

  const appointments = await prisma.appointment.findMany({
    where: {
      tenantId,
      branchId,
      status:  { notIn: ['cancelled'] },
      startAt: { gte: dayStartUTC },
      endAt:   { lte: new Date(dayEndUTC.getTime() + 60_000) },
    },
    select: { startAt: true, endAt: true, professionalId: true },
  })

  // ── 6. Filtrar por disponibilidad real ────────────────────────────────────
  const now = new Date()

  const isProfFree = (profId: string, slotStart: Date, slotEnd: Date): boolean =>
    !appointments.some(
      (a) => a.professionalId === profId && a.startAt < slotEnd && a.endAt > slotStart,
    )

  const availableSlots: Array<{
    startAt:                string
    endAt:                  string
    startTime:              string
    endTime:                string
    availableProfessionals?: Array<{ id: string; name: string }>
  }> = []

  for (const { startMin, endMin } of uniqueSlots) {
    const slotStart = localMinutesToUTC(date, startMin, timezone)
    const slotEnd   = localMinutesToUTC(date, endMin,   timezone)

    // Slots del pasado no aparecen
    if (slotStart <= now) continue

    const base = {
      startAt:   slotStart.toISOString(),
      endAt:     slotEnd.toISOString(),
      startTime: minutesToHHMM(startMin),
      endTime:   minutesToHHMM(endMin),
    }

    if (professionalId) {
      // El profesional debe estar asignado al servicio (o el servicio no tener restricción)
      const assignedToService = serviceProfIds.length === 0 || serviceProfIds.includes(professionalId)
      if (!assignedToService) continue
      if (!isProfFree(professionalId, slotStart, slotEnd)) continue
      availableSlots.push(base)

    } else if (serviceProfIds.length > 0) {
      // Mostrar los profesionales libres en este slot
      const freeProfessionals = serviceProfessionals.filter((p) =>
        isProfFree(p.id, slotStart, slotEnd),
      )
      if (freeProfessionals.length === 0) continue
      availableSlots.push({ ...base, availableProfessionals: freeProfessionals })

    } else {
      // Sin profesionales asignados → disponibilidad de sucursal aplica
      availableSlots.push(base)
    }
  }

  return {
    date,
    serviceId,
    branchId,
    durationMinutes: duration,
    timezone,
    slots:  availableSlots,
    total:  availableSlots.length,
  }
}
