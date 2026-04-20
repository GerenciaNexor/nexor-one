import type { Role } from '@nexor/shared'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { sendAppointmentConfirmation } from '../../../lib/email'
import { canAccessBranch } from '../../../lib/guards'
import type { CreateAppointment, ListAppointmentsQuery } from './schema'

// ─── Utilidades de zona horaria ───────────────────────────────────────────────

function getUTCOffsetMinutes(timezone: string, date: Date): number {
  const utcStr   = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const localStr = date.toLocaleString('en-US', { timeZone: timezone })
  return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000
}

function localMinutesToUTC(dateStr: string, minutesFromMidnight: number, timezone: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number) as [number, number, number]
  const h = Math.floor(minutesFromMidnight / 60)
  const m = minutesFromMidnight % 60
  const naive = new Date(Date.UTC(y, mo - 1, d, h, m, 0))
  const offsetMin = getUTCOffsetMinutes(timezone, naive)
  return new Date(naive.getTime() - offsetMin * 60_000)
}

// ─── Select base para citas ───────────────────────────────────────────────────

const APPOINTMENT_SELECT = {
  id:             true,
  branchId:       true,
  clientId:       true,
  serviceTypeId:  true,
  professionalId: true,
  clientName:     true,
  clientEmail:    true,
  clientPhone:    true,
  startAt:        true,
  endAt:          true,
  status:         true,
  notes:          true,
  channel:        true,
  createdByAgent: true,
  reminderSent:   true,
  createdAt:      true,
  updatedAt:      true,
  branch:         { select: { id: true, name: true } },
  serviceType:    { select: { id: true, name: true, durationMinutes: true } },
  professional:   { select: { id: true, name: true } },
  client:         { select: { id: true, name: true, email: true } },
} as const

// ─── Servicios ────────────────────────────────────────────────────────────────

export async function listAppointments(
  tenantId: string,
  query: ListAppointmentsQuery,
  branchFilter: string | undefined,
) {
  const where: Prisma.AppointmentWhereInput = { tenantId }

  if (branchFilter) {
    where.branchId = branchFilter
  } else if (query.branchId) {
    where.branchId = query.branchId
  }

  if (query.status)         where.status         = query.status
  if (query.professionalId) where.professionalId = query.professionalId

  if (query.date) {
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { timezone: true } })
    const tz     = tenant?.timezone ?? 'America/Bogota'
    const dayStart = localMinutesToUTC(query.date, 0,             tz)
    const dayEnd   = localMinutesToUTC(query.date, 23 * 60 + 59,  tz)
    where.startAt  = { gte: dayStart, lte: new Date(dayEnd.getTime() + 60_000) }
  }

  const data = await prisma.appointment.findMany({
    where,
    select:  APPOINTMENT_SELECT,
    orderBy: { startAt: 'asc' },
  })

  return { data, total: data.length }
}

export async function createAppointment(tenantId: string, data: CreateAppointment) {
  // ── 1. Cargar tenant, servicio y sucursal en paralelo ──────────────────────
  const [tenant, service, branch] = await Promise.all([
    prisma.tenant.findFirst({
      where:  { id: tenantId },
      select: { timezone: true, name: true },
    }),
    prisma.serviceType.findFirst({
      where:  { id: data.serviceTypeId, tenantId, isActive: true },
      select: {
        durationMinutes: true,
        name:            true,
        professionals:   { select: { user: { select: { id: true } } } },
      },
    }),
    prisma.branch.findFirst({
      where:  { id: data.branchId, tenantId },
      select: { name: true },
    }),
  ])

  if (!service) throw { statusCode: 404, message: 'Servicio no encontrado o inactivo', code: 'NOT_FOUND' }
  if (!branch)  throw { statusCode: 404, message: 'Sucursal no encontrada',            code: 'NOT_FOUND' }

  const timezone   = tenant?.timezone ?? 'America/Bogota'
  const tenantName = tenant?.name ?? 'NEXOR'
  const startAt    = new Date(data.startAt)

  if (isNaN(startAt.getTime())) throw { statusCode: 400, message: 'startAt inválido', code: 'VALIDATION_ERROR' }

  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000)

  // ── 2. Verificar fecha bloqueada ───────────────────────────────────────────
  // en-CA usa formato 'YYYY-MM-DD', ideal para extraer la fecha local
  const localDateStr  = startAt.toLocaleDateString('en-CA', { timeZone: timezone })
  const [y, mo, d]    = localDateStr.split('-').map(Number) as [number, number, number]
  const requestedDate = new Date(Date.UTC(y, mo - 1, d))

  const blocked = await prisma.blockedDate.findFirst({
    where: {
      tenantId,
      date: requestedDate,
      OR:  [{ branchId: data.branchId }, { branchId: null }],
    },
  })
  if (blocked) throw { statusCode: 409, message: 'La fecha está bloqueada', code: 'DATE_BLOCKED' }

  // ── 3. Verificar que el slot cae dentro de un bloque de disponibilidad ─────
  const dayOfWeek        = new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  const localMidnightUTC = localMinutesToUTC(localDateStr, 0, timezone)
  const startMinutes     = Math.round((startAt.getTime() - localMidnightUTC.getTime()) / 60000)
  const endMinutes       = startMinutes + service.durationMinutes

  const availBlocks = await prisma.availability.findMany({
    where: data.professionalId
      ? {
          tenantId,
          dayOfWeek,
          isActive: true,
          OR: [
            { branchId: data.branchId, userId: null },
            { branchId: data.branchId, userId: data.professionalId },
            { branchId: null,          userId: data.professionalId },
          ],
        }
      : { tenantId, branchId: data.branchId, userId: null, dayOfWeek, isActive: true },
    select: { startTime: true, endTime: true },
  })

  if (availBlocks.length === 0) {
    throw { statusCode: 409, message: 'No hay disponibilidad configurada para este día', code: 'SLOT_UNAVAILABLE' }
  }

  const slotFitsBlock = availBlocks.some((b) => {
    const bStart = b.startTime.getUTCHours() * 60 + b.startTime.getUTCMinutes()
    const bEnd   = b.endTime.getUTCHours()   * 60 + b.endTime.getUTCMinutes()
    return startMinutes >= bStart && endMinutes <= bEnd
  })
  if (!slotFitsBlock) {
    throw { statusCode: 409, message: 'El horario solicitado está fuera del rango de disponibilidad', code: 'SLOT_UNAVAILABLE' }
  }

  // ── 4. Resolver nombre y email del cliente ─────────────────────────────────
  let resolvedName  = data.clientName ?? ''
  let resolvedEmail = data.clientEmail

  if (data.clientId) {
    const client = await prisma.client.findFirst({
      where:  { id: data.clientId, tenantId },
      select: { name: true, email: true },
    })
    if (!client) throw { statusCode: 404, message: 'Cliente no encontrado', code: 'NOT_FOUND' }
    resolvedName  = data.clientName ?? client.name
    resolvedEmail = data.clientEmail ?? (client.email ?? undefined)
  }

  // ── 5. Validar profesional si se especificó ────────────────────────────────
  let professionalName: string | undefined
  if (data.professionalId) {
    const prof = await prisma.user.findFirst({
      where:  { id: data.professionalId, tenantId, isActive: true },
      select: { name: true },
    })
    if (!prof) throw { statusCode: 404, message: 'Profesional no encontrado', code: 'NOT_FOUND' }
    professionalName = prof.name

    const serviceProfIds = service.professionals.map((p) => p.user.id)
    if (serviceProfIds.length > 0 && !serviceProfIds.includes(data.professionalId)) {
      throw { statusCode: 409, message: 'El profesional no está asignado a este servicio', code: 'PROFESSIONAL_NOT_ASSIGNED' }
    }
  }

  // ── 6. Transacción atómica: verificar solapamiento + crear ─────────────────
  const appointment = await prisma.$transaction(async (tx) => {
    if (data.professionalId) {
      const overlap = await tx.appointment.findFirst({
        where: {
          tenantId,
          professionalId: data.professionalId,
          status:         { notIn: ['cancelled'] },
          startAt:        { lt: endAt },
          endAt:          { gt: startAt },
        },
        select: { id: true },
      })
      if (overlap) {
        throw { statusCode: 409, message: 'El profesional ya tiene una cita en ese horario', code: 'SLOT_TAKEN' }
      }
    }

    return tx.appointment.create({
      data: {
        tenantId,
        branchId:       data.branchId,
        clientId:       data.clientId,
        serviceTypeId:  data.serviceTypeId,
        professionalId: data.professionalId,
        clientName:     resolvedName,
        clientEmail:    resolvedEmail,
        clientPhone:    data.clientPhone,
        startAt,
        endAt,
        status:         data.status,
        notes:          data.notes,
        channel:        data.channel,
        createdByAgent: data.createdByAgent,
      },
      select: APPOINTMENT_SELECT,
    })
  })

  // ── 7. Email de confirmación (fire-and-forget) ─────────────────────────────
  if (data.status === 'confirmed' && resolvedEmail) {
    sendAppointmentConfirmation({
      to:               resolvedEmail,
      clientName:       resolvedName,
      serviceName:      service.name,
      branchName:       branch.name,
      professionalName,
      startAt,
      endAt,
      tenantName,
      timezone,
    }).catch((err) => console.error('[Appointment] email confirmación error:', err))
  }

  // ── 8. Notificación in-app si fue creada por el agente ─────────────────────
  if (data.createdByAgent) {
    const managers = await prisma.user.findMany({
      where:  { tenantId, role: 'AREA_MANAGER', module: 'AGENDA', isActive: true },
      select: { id: true },
    })
    if (managers.length > 0) {
      await prisma.notification.createMany({
        data: managers.map((m) => ({
          tenantId,
          userId:  m.id,
          module:  'AGENDA' as const,
          type:    'nueva_cita_agente',
          title:   `Nueva cita — ${resolvedName}`,
          message: `El agente agendó una cita de ${service.name} para el ${localDateStr}.`,
          link:    `/agenda/appointments/${appointment.id}`,
        })),
      })
    }
  }

  return appointment
}

export async function updateAppointmentStatus(
  tenantId: string,
  id: string,
  newStatus: string,
  user: { role: Role; branchId: string | null },
) {
  const appointment = await prisma.appointment.findFirst({
    where:  { id, tenantId },
    select: {
      id:           true,
      status:       true,
      branchId:     true,
      clientEmail:  true,
      clientName:   true,
      startAt:      true,
      endAt:        true,
      serviceType:  { select: { name: true } },
      branch:       { select: { name: true } },
      professional: { select: { name: true } },
    },
  })

  if (!appointment) throw { statusCode: 404, message: 'Cita no encontrada', code: 'NOT_FOUND' }

  if (!canAccessBranch(user, appointment.branchId)) {
    throw { statusCode: 403, message: 'No tienes acceso a esta cita', code: 'FORBIDDEN' }
  }

  if (appointment.status === 'cancelled') {
    throw { statusCode: 409, message: 'Una cita cancelada no puede modificarse', code: 'CANCELLED_IMMUTABLE' }
  }

  const updated = await prisma.appointment.update({
    where:  { id },
    data:   { status: newStatus },
    select: { id: true, status: true, updatedAt: true },
  })

  if (newStatus === 'confirmed' && appointment.status !== 'confirmed' && appointment.clientEmail) {
    const tenant = await prisma.tenant.findFirst({
      where:  { id: tenantId },
      select: { timezone: true, name: true },
    })
    sendAppointmentConfirmation({
      to:               appointment.clientEmail,
      clientName:       appointment.clientName,
      serviceName:      appointment.serviceType?.name ?? 'Servicio',
      branchName:       appointment.branch.name,
      professionalName: appointment.professional?.name,
      startAt:          appointment.startAt,
      endAt:            appointment.endAt,
      tenantName:       tenant?.name ?? 'NEXOR',
      timezone:         tenant?.timezone,
    }).catch((err) => console.error('[Appointment] email confirmación error:', err))
  }

  return updated
}
