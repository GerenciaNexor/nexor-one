import type { Role } from '@nexor/shared'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { assertDemoLimit } from '../../../lib/demo-limits'
import { sendAppointmentConfirmation, sendEventInvitation } from '../../../lib/email'
import { sendWhatsAppNotificationIfOptedIn } from '../../../lib/whatsapp'
import { canAccessBranch } from '../../../lib/guards'
import { assertBranchActive } from '../../branches/service'
import type { CreateAppointment, UpdateEvent, ListAppointmentsQuery } from './schema'

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
  type:           true,   // HU-204 — service | event
  title:          true,   // HU-204 — título del evento libre
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
  // HU-204 — asistentes del evento libre (internos/externos).
  attendees:      { select: { id: true, userId: true, email: true, name: true, response: true } },
} as const

// ─── Servicios ────────────────────────────────────────────────────────────────

export async function listAppointments(
  tenantId: string,
  query: ListAppointmentsQuery,
  branchFilter: string | undefined,
  userId?: string,
) {
  const where: Prisma.AppointmentWhereInput = { tenantId }

  // HU-205 — Visibilidad:
  //  · CITA DE SERVICIO: por sucursal (sin cambios) — la ven los usuarios de esa sede.
  //  · EVENTO LIBRE: PRIVADO de sus participantes — solo su creador, sus asistentes internos y los
  //    admins transversales (branchFilter undefined = TENANT_ADMIN). Un invitado lo ve aunque sea de
  //    otra sede; alguien no invitado (no admin) no lo ve, aunque sea de su misma sede.
  const uid = userId ?? '__no_user__'
  const eventVisibleToUser: Prisma.AppointmentWhereInput = {
    type: 'event',
    OR: [{ createdBy: uid }, { attendees: { some: { userId: uid } } }],
  }
  if (branchFilter) {
    // Rol acotado a su sucursal: citas de servicio de SU sede + eventos donde participa.
    where.OR = [{ type: 'service', branchId: branchFilter }, eventVisibleToUser]
  } else if (query.branchId) {
    // Admin transversal filtrando por sucursal: servicio de esa sede + TODOS los eventos (ve todo).
    where.OR = [{ type: 'service', branchId: query.branchId }, { type: 'event' }]
  }
  // else: admin transversal sin filtro → ve todas las citas y todos los eventos del tenant.

  if (query.status)         where.status         = query.status
  if (query.professionalId) where.professionalId = query.professionalId

  if (query.date) {
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { timezone: true } })
    const tz     = tenant?.timezone ?? 'America/Bogota'
    const dayStart = localMinutesToUTC(query.date, 0,             tz)
    const dayEnd   = localMinutesToUTC(query.date, 23 * 60 + 59,  tz)
    where.startAt  = { gte: dayStart, lte: new Date(dayEnd.getTime() + 60_000) }
  } else if (query.from || query.to) {
    // HU-203 — rango de fechas (p. ej. próximas citas). Se resuelve en la zona del tenant.
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { timezone: true } })
    const tz     = tenant?.timezone ?? 'America/Bogota'
    where.startAt = {
      ...(query.from ? { gte: localMinutesToUTC(query.from, 0, tz) } : {}),
      ...(query.to   ? { lte: new Date(localMinutesToUTC(query.to, 23 * 60 + 59, tz).getTime() + 60_000) } : {}),
    }
  }

  const data = await prisma.appointment.findMany({
    where,
    select:  APPOINTMENT_SELECT,
    orderBy: { startAt: 'asc' },
  })

  return { data, total: data.length }
}

export async function createAppointment(tenantId: string, data: CreateAppointment, userId?: string) {
  await assertDemoLimit(tenantId, 'appointments') // HU-143 — tope del plan demo
  // HU-204 — evento libre: camino propio (sin servicio/disponibilidad/solapamiento). La cita de
  // servicio sigue exactamente igual debajo.
  if (data.type === 'event') return createEvent(tenantId, data, userId)
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
      select: { name: true, isActive: true },
    }),
  ])

  if (!service) throw { statusCode: 404, message: 'Servicio no encontrado o inactivo', code: 'NOT_FOUND' }
  if (!branch)  throw { statusCode: 404, message: 'Sucursal no encontrada',            code: 'NOT_FOUND' }
  // HU-197 — no se pueden agendar citas nuevas en una sucursal desactivada (su histórico sí se conserva).
  if (!branch.isActive) throw { statusCode: 422, message: 'La sucursal está desactivada; no se pueden agendar citas nuevas en ella.', code: 'BRANCH_INACTIVE' }

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

  // ── 3. Disponibilidad — se OMITE si la cita es a hora específica/manual (los horarios son sugerencia,
  //       como Google Calendar). El control de solapamiento (paso 6) SIEMPRE se aplica.
  if (!data.manualTime) {
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
      // ¿La sucursal tiene ALGUNA disponibilidad configurada (cualquier día)? Si NUNCA se configuró,
      // la agenda queda "siempre abierta". Si sí hay horarios pero no para este día → cerrado.
      const anyAvail = await prisma.availability.count({
        where: data.professionalId
          ? { tenantId, isActive: true, OR: [{ branchId: data.branchId }, { userId: data.professionalId }] }
          : { tenantId, branchId: data.branchId, userId: null, isActive: true },
      })
      if (anyAvail > 0) {
        throw { statusCode: 409, message: 'No hay disponibilidad configurada para este día', code: 'SLOT_UNAVAILABLE' }
      }
    } else {
      const slotFitsBlock = availBlocks.some((b) => {
        const bStart = b.startTime.getUTCHours() * 60 + b.startTime.getUTCMinutes()
        const bEnd   = b.endTime.getUTCHours()   * 60 + b.endTime.getUTCMinutes()
        return startMinutes >= bStart && endMinutes <= bEnd
      })
      if (!slotFitsBlock) {
        throw { statusCode: 409, message: 'El horario solicitado está fuera del rango de disponibilidad', code: 'SLOT_UNAVAILABLE' }
      }
    }
  }

  // ── 4. Resolver nombre, email y teléfono del cliente ───────────────────────
  let resolvedName  = data.clientName ?? ''
  let resolvedEmail = data.clientEmail
  let resolvedPhone = data.clientPhone
  // HU-209 — un número dado explícitamente para ESTA cita es un número legítimamente asociado a la
  // operación → opt-in implícito. Si la cita referencia un cliente registrado, manda su preferencia.
  let clientOptIn   = true

  if (data.clientId) {
    const client = await prisma.client.findFirst({
      where:  { id: data.clientId, tenantId },
      select: { name: true, email: true, phone: true, whatsappOptIn: true },
    })
    if (!client) throw { statusCode: 404, message: 'Cliente no encontrado', code: 'NOT_FOUND' }
    resolvedName  = data.clientName  ?? client.name
    resolvedEmail = data.clientEmail ?? (client.email ?? undefined)
    resolvedPhone = data.clientPhone ?? (client.phone ?? undefined)
    clientOptIn   = client.whatsappOptIn
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
    } else if (service.professionals.length === 0) {
      // HU-195 — servicio SIN profesionales: el recurso es el servicio en la sucursal. Verificar que
      // no exista ya una cita (no cancelada) de ESE servicio solapando → nunca pisar una cita existente.
      const overlap = await tx.appointment.findFirst({
        where: {
          tenantId,
          branchId:      data.branchId,
          serviceTypeId: data.serviceTypeId,
          status:        { notIn: ['cancelled'] },
          startAt:       { lt: endAt },
          endAt:         { gt: startAt },
        },
        select: { id: true },
      })
      if (overlap) {
        throw { statusCode: 409, message: 'Ese horario ya está reservado', code: 'SLOT_TAKEN' }
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
        clientPhone:    resolvedPhone,   // HU-209 — hereda el teléfono del cliente si no vino explícito
        startAt,
        endAt,
        status:         data.status,
        notes:          data.notes,
        channel:        data.channel,
        createdByAgent: data.createdByAgent,
        createdBy:      userId ?? null,
      },
      select: APPOINTMENT_SELECT,
    })
  })

  // ── 7. Confirmación de cita (fire-and-forget) — email y/o WhatsApp ──────────
  if (data.status === 'confirmed') {
    if (resolvedEmail) {
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
    // HU-209 — confirmación por WhatsApp con plantilla aprobada, respetando el opt-in del cliente.
    // Privacidad: solo nombre, fecha/hora y servicio/sucursal; nada de terceros. Nunca rompe el flujo.
    if (resolvedPhone) {
      // confirmacion_cita → 1=nombre, 2=fecha, 3=hora, 4=lugar
      const fmtDate = new Intl.DateTimeFormat('es-CO', { timeZone: timezone, dateStyle: 'long' })
      const fmtTime = new Intl.DateTimeFormat('es-CO', { timeZone: timezone, timeStyle: 'short' })
      void sendWhatsAppNotificationIfOptedIn('appointment_confirmation', {
        tenantId, to: resolvedPhone, optIn: clientOptIn,
        bodyParams: [resolvedName || 'Cliente', fmtDate.format(startAt), fmtTime.format(startAt), `${service.name} — ${branch.name}`],
      })
    }
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

// ─── HU-204 — Evento libre (calendario general con asistentes múltiples) ───────

type AttendeeRow = { tenantId: string; userId: string | null; email: string | null; name: string | null }

/** Resuelve los asistentes a filas: internos (userId del tenant, con su nombre/correo) o externos (correo). */
async function resolveAttendeeRows(tenantId: string, attendees: CreateAppointment['attendees']): Promise<AttendeeRow[]> {
  const input = attendees ?? []
  const internalIds = [...new Set(input.filter((a) => a.userId).map((a) => a.userId as string))]
  const users = internalIds.length
    ? await prisma.user.findMany({ where: { tenantId, id: { in: internalIds } }, select: { id: true, name: true, email: true } })
    : []
  const uMap = new Map(users.map((u) => [u.id, u]))
  return input.map((a) => {
    if (a.userId) {
      const u = uMap.get(a.userId)
      if (!u) throw { statusCode: 400, message: 'Asistente interno no encontrado en tu empresa', code: 'ATTENDEE_NOT_FOUND' }
      return { tenantId, userId: u.id, email: u.email, name: (a.name?.trim() || u.name) }
    }
    return { tenantId, userId: null, email: a.email!.trim().toLowerCase(), name: a.name?.trim() || null }
  })
}

/** Notifica a los asistentes: internos → notificación in-app; externos → correo (HU-182). */
async function notifyEventAttendees(
  tenantId: string,
  appt: { title: string | null; startAt: Date; endAt: Date; notes: string | null },
  rows: AttendeeRow[],
  action: 'invitación' | 'actualización' | 'cancelación',
  timezone: string,
  tenantName: string,
): Promise<void> {
  const title = appt.title ?? 'Evento'
  const when  = new Date(appt.startAt).toLocaleString('es-CO', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' })
  const label = action === 'invitación' ? `Invitación: ${title}` : action === 'actualización' ? `Evento actualizado: ${title}` : `Evento cancelado: ${title}`
  const type  = action === 'invitación' ? 'evento_invitacion' : action === 'actualización' ? 'evento_actualizado' : 'evento_cancelado'

  const internalIds = [...new Set(rows.filter((r) => r.userId).map((r) => r.userId as string))]
  if (internalIds.length) {
    await prisma.notification.createMany({
      data: internalIds.map((uid) => ({
        tenantId, userId: uid, module: 'AGENDA' as const, type,
        title: label,
        message: action === 'cancelación' ? `El evento "${title}" (${when}) fue cancelado.` : `Evento "${title}" — ${when}.`,
        link: '/agenda/appointments',
      })),
    })
  }

  const externals = rows.filter((r) => !r.userId && r.email)
  for (const ex of externals) {
    sendEventInvitation({
      to: ex.email!, action, eventTitle: title, description: appt.notes ?? null,
      startAt: new Date(appt.startAt), endAt: new Date(appt.endAt), tenantName, timezone,
    }).catch((err) => console.error('[Event] email invitación error:', err))
  }
}

/** Crea un evento libre (título, descripción, inicio/fin, sucursal opcional, asistentes). */
async function createEvent(tenantId: string, data: CreateAppointment, userId?: string) {
  const tenant     = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { timezone: true, name: true } })
  const timezone   = tenant?.timezone ?? 'America/Bogota'
  const tenantName = tenant?.name ?? 'NEXOR'

  const startAt = new Date(data.startAt)
  if (isNaN(startAt.getTime())) throw { statusCode: 400, message: 'startAt inválido', code: 'VALIDATION_ERROR' }
  let endAt = data.endAt ? new Date(data.endAt) : new Date(startAt.getTime() + 60 * 60_000)
  if (isNaN(endAt.getTime()) || endAt <= startAt) endAt = new Date(startAt.getTime() + 60 * 60_000)

  if (data.branchId) await assertBranchActive(tenantId, data.branchId) // HU-197 — sede activa si se indica

  const rows = await resolveAttendeeRows(tenantId, data.attendees)

  const appt = await prisma.appointment.create({
    data: {
      tenantId, type: 'event', title: data.title!.trim(),
      branchId: data.branchId ?? null, createdBy: userId ?? null,
      startAt, endAt, status: data.status, notes: data.notes, channel: data.channel, createdByAgent: data.createdByAgent,
      ...(rows.length ? { attendees: { create: rows.map((r) => ({ tenantId, userId: r.userId ?? undefined, email: r.email ?? undefined, name: r.name ?? undefined })) } } : {}),
    },
    select: APPOINTMENT_SELECT,
  })

  await notifyEventAttendees(tenantId, appt, rows, 'invitación', timezone, tenantName)
  return appt
}

/** Edita un evento libre (título, descripción, horario, sucursal y asistentes); refleja a los asistentes. */
export async function updateEvent(tenantId: string, id: string, data: UpdateEvent) {
  const existing = await prisma.appointment.findFirst({ where: { id, tenantId }, select: { id: true, type: true, startAt: true, endAt: true } })
  if (!existing) throw { statusCode: 404, message: 'Cita no encontrada', code: 'NOT_FOUND' }
  if (existing.type !== 'event') throw { statusCode: 422, message: 'Solo los eventos libres se editan por esta vía', code: 'NOT_AN_EVENT' }

  const tenant     = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { timezone: true, name: true } })
  const timezone   = tenant?.timezone ?? 'America/Bogota'
  const tenantName = tenant?.name ?? 'NEXOR'

  const startAt = data.startAt ? new Date(data.startAt) : existing.startAt
  let endAt     = data.endAt   ? new Date(data.endAt)   : existing.endAt
  if (isNaN(startAt.getTime())) throw { statusCode: 400, message: 'startAt inválido', code: 'VALIDATION_ERROR' }
  if (isNaN(endAt.getTime()) || endAt <= startAt) endAt = new Date(startAt.getTime() + 60 * 60_000)

  if (data.branchId) await assertBranchActive(tenantId, data.branchId)
  const rows = data.attendees !== undefined ? await resolveAttendeeRows(tenantId, data.attendees) : null

  const appt = await prisma.$transaction(async (tx) => {
    if (rows) await tx.appointmentAttendee.deleteMany({ where: { tenantId, appointmentId: id } })
    return tx.appointment.update({
      where: { id },
      data: {
        ...(data.title    !== undefined && { title: data.title!.trim() }),
        ...(data.notes    !== undefined && { notes: data.notes ?? null }),
        ...(data.branchId !== undefined && { branchId: data.branchId ?? null }),
        startAt, endAt,
        ...(rows ? { attendees: { create: rows.map((r) => ({ tenantId, userId: r.userId ?? undefined, email: r.email ?? undefined, name: r.name ?? undefined })) } } : {}),
      },
      select: APPOINTMENT_SELECT,
    })
  })

  const notifyRows: AttendeeRow[] = rows ?? appt.attendees.map((a) => ({ tenantId, userId: a.userId, email: a.email, name: a.name }))
  await notifyEventAttendees(tenantId, appt, notifyRows, 'actualización', timezone, tenantName)
  return appt
}

/** Elimina un evento libre (cascade borra asistentes) y avisa la cancelación. Las citas de servicio NO
 *  se borran por aquí (se cancelan por estado). */
export async function deleteAppointment(tenantId: string, id: string) {
  const existing = await prisma.appointment.findFirst({
    where:  { id, tenantId },
    select: { id: true, type: true, title: true, startAt: true, endAt: true, notes: true, attendees: { select: { userId: true, email: true, name: true } } },
  })
  if (!existing) throw { statusCode: 404, message: 'Cita no encontrada', code: 'NOT_FOUND' }
  if (existing.type !== 'event') throw { statusCode: 422, message: 'Las citas de servicio se cancelan por estado, no se eliminan', code: 'NOT_AN_EVENT' }

  const tenant     = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { timezone: true, name: true } })
  const timezone   = tenant?.timezone ?? 'America/Bogota'
  const tenantName = tenant?.name ?? 'NEXOR'
  const rows: AttendeeRow[] = existing.attendees.map((a) => ({ tenantId, userId: a.userId, email: a.email, name: a.name }))

  await prisma.appointment.delete({ where: { id } })
  await notifyEventAttendees(tenantId, existing, rows, 'cancelación', timezone, tenantName)
  return { id, deleted: true }
}

/**
 * HU-205 — Indicador de disponibilidad al invitar (estilo Google Calendar). Devuelve, por usuario del
 * MISMO tenant, si está OCUPADO en el rango [from, to). NUNCA revela de qué está ocupado (ni título ni
 * con quién): solo el booleano. No bloquea ni sugiere horarios (eso lo decide el frontend). Una persona
 * está ocupada si en ese rango es profesional de una cita, creador de un evento, o asistente interno de
 * una cita/evento (no cancelados). Preparado para sumar Google Calendar en una HU posterior.
 */
export async function checkAvailability(
  tenantId: string,
  params: { userIds: string[]; from: string; to: string; excludeId?: string },
): Promise<{ busy: Record<string, boolean> }> {
  const ids  = [...new Set(params.userIds)].filter(Boolean)
  const busy: Record<string, boolean> = {}
  for (const id of ids) busy[id] = false
  if (ids.length === 0) return { busy }

  const start = new Date(params.from)
  const end   = new Date(params.to)
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return { busy }

  // Solapamiento clásico: empieza antes de que termine el rango y termina después de que empiece.
  const overlap: Prisma.AppointmentWhereInput = {
    tenantId,
    status:  { notIn: ['cancelled'] },
    startAt: { lt: end },
    endAt:   { gt: start },
    ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
  }

  const [asProf, asCreator, asAttendee] = await Promise.all([
    prisma.appointment.findMany({ where: { ...overlap, professionalId: { in: ids } }, select: { professionalId: true } }),
    prisma.appointment.findMany({ where: { ...overlap, createdBy: { in: ids } }, select: { createdBy: true } }),
    prisma.appointmentAttendee.findMany({ where: { tenantId, userId: { in: ids }, appointment: overlap }, select: { userId: true } }),
  ])
  for (const a of asProf)     if (a.professionalId) busy[a.professionalId] = true
  for (const a of asCreator)  if (a.createdBy)      busy[a.createdBy]      = true
  for (const a of asAttendee) if (a.userId)         busy[a.userId]         = true
  return { busy }
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
      clientPhone:  true,   // HU-209 — destino de la confirmación por WhatsApp
      clientName:   true,
      startAt:      true,
      endAt:        true,
      serviceType:  { select: { name: true } },
      branch:       { select: { name: true } },
      professional: { select: { name: true } },
      client:       { select: { whatsappOptIn: true } }, // HU-209 — consentimiento del cliente
    },
  })

  if (!appointment) throw { statusCode: 404, message: 'Cita no encontrada', code: 'NOT_FOUND' }

  // HU-204 — un evento libre puede no tener sucursal (calendario general): el control por sucursal
  // solo aplica a citas con sucursal.
  if (appointment.branchId && !canAccessBranch(user, appointment.branchId)) {
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

  // HU-209 — al confirmar, enviar confirmación por email y/o WhatsApp (esta última respeta el opt-in).
  const becameConfirmed = newStatus === 'confirmed' && appointment.status !== 'confirmed'
  if (becameConfirmed && (appointment.clientEmail || appointment.clientPhone)) {
    const tenant = await prisma.tenant.findFirst({
      where:  { id: tenantId },
      select: { timezone: true, name: true },
    })
    const tz          = tenant?.timezone ?? 'America/Bogota'
    const serviceName = appointment.serviceType?.name ?? 'Servicio'
    const branchName  = appointment.branch?.name ?? 'Sucursal'
    const clientName  = appointment.clientName ?? 'Cliente'

    if (appointment.clientEmail) {
      sendAppointmentConfirmation({
        to:               appointment.clientEmail,
        clientName,
        serviceName,
        branchName,
        professionalName: appointment.professional?.name,
        startAt:          appointment.startAt,
        endAt:            appointment.endAt,
        tenantName:       tenant?.name ?? 'NEXOR',
        timezone:         tz,
      }).catch((err) => console.error('[Appointment] email confirmación error:', err))
    }

    if (appointment.clientPhone) {
      // confirmacion_cita → 1=nombre, 2=fecha, 3=hora, 4=lugar
      const fmtDate = new Intl.DateTimeFormat('es-CO', { timeZone: tz, dateStyle: 'long' })
      const fmtTime = new Intl.DateTimeFormat('es-CO', { timeZone: tz, timeStyle: 'short' })
      void sendWhatsAppNotificationIfOptedIn('appointment_confirmation', {
        tenantId, to: appointment.clientPhone, optIn: appointment.client?.whatsappOptIn ?? true,
        bodyParams: [clientName, fmtDate.format(appointment.startAt), fmtTime.format(appointment.startAt), `${serviceName} — ${branchName}`],
      })
    }
  }

  return updated
}
