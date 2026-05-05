/**
 * Tools del agente AGENDA — Agendamiento de citas por WhatsApp
 * HU-071: ver_servicios, ver_profesionales, ver_horarios, crear_cita, cancelar_cita.
 *
 * Reglas inamovibles:
 *   - ver_horarios antes de crear_cita — nunca crear sin confirmar disponibilidad.
 *   - crear_cita siempre usa createdByAgent=true y channel='whatsapp'.
 *   - Si el cliente existe en ARI por teléfono, vincularlo a la cita con su clientId.
 *   - El agente nunca cancela citas en estado completed o no_show.
 *   - La notificación al AREA_MANAGER al crear es obligatoria (manejada en createAppointment).
 */

import { prisma } from '../../../lib/prisma'
import { getAvailableSlots } from '../../agenda/slots/service'
import { createAppointment } from '../../agenda/appointments/service'
import type { AgentTool } from '../types'

// ─── ver_servicios ────────────────────────────────────────────────────────────

const verServicios: AgentTool = {
  definition: {
    name:        'ver_servicios',
    description: 'Returns the list of active services offered by the tenant. Optionally filtered by branch. Use this first so the client can choose a service before checking availability.',
    input_schema: {
      type:       'object',
      properties: {
        branchId: { type: 'string', description: 'Branch ID to filter services (optional — omit to return all)' },
      },
    },
  },

  async execute({ branchId }, tenantId) {
    const services = await prisma.serviceType.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(branchId
          ? { OR: [{ branchId: branchId as string }, { branchId: null }] }
          : {}),
      },
      select: {
        id:              true,
        name:            true,
        description:     true,
        durationMinutes: true,
        price:           true,
      },
      orderBy: { name: 'asc' },
    })

    if (services.length === 0) {
      return { servicios: [], total: 0, mensaje: 'No hay servicios activos configurados.' }
    }

    return {
      total:     services.length,
      servicios: services.map((s) => ({
        id:              s.id,
        nombre:          s.name,
        descripcion:     s.description ?? null,
        duracionMinutos: s.durationMinutes,
        precio:          s.price != null ? Number(s.price) : null,
      })),
    }
  },
}

// ─── ver_profesionales ────────────────────────────────────────────────────────

const verProfesionales: AgentTool = {
  definition: {
    name:        'ver_profesionales',
    description: 'Returns the professionals available for a specific service in a branch. Use when the client wants to choose a specific professional. If the service has no assigned professionals, returns all active OPERATIVE.AGENDA users in that branch.',
    input_schema: {
      type:       'object',
      properties: {
        serviceId: { type: 'string', description: 'Service type ID' },
        branchId:  { type: 'string', description: 'Branch ID' },
      },
      required: ['serviceId', 'branchId'],
    },
  },

  async execute({ serviceId, branchId }, tenantId) {
    const service = await prisma.serviceType.findFirst({
      where:  { id: serviceId as string, tenantId, isActive: true },
      select: {
        professionals: { select: { user: { select: { id: true, name: true, isActive: true } } } },
      },
    })

    if (!service) {
      return { error: 'SERVICIO_NO_ENCONTRADO', mensaje: `Servicio "${serviceId}" no encontrado o inactivo.` }
    }

    const fromService = service.professionals
      .filter((p) => p.user.isActive)
      .map((p) => ({ id: p.user.id, nombre: p.user.name }))

    if (fromService.length > 0) {
      return { total: fromService.length, profesionales: fromService }
    }

    // Servicio sin asignación específica → todos los OPERATIVE.AGENDA de la sucursal
    const fallback = await prisma.user.findMany({
      where:   { tenantId, branchId: branchId as string, role: 'OPERATIVE', module: 'AGENDA', isActive: true },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    if (fallback.length === 0) {
      return {
        total:         0,
        profesionales: [],
        mensaje:       'No hay profesionales configurados para este servicio o sucursal.',
      }
    }

    return { total: fallback.length, profesionales: fallback.map((u) => ({ id: u.id, nombre: u.name })) }
  },
}

// ─── ver_horarios ─────────────────────────────────────────────────────────────

const verHorarios: AgentTool = {
  definition: {
    name:        'ver_horarios',
    description: 'Returns available time slots for a service on a given date. Always call this before crear_cita to show the client their options and get the exact startAt value.',
    input_schema: {
      type:       'object',
      properties: {
        serviceId:      { type: 'string', description: 'Service type ID' },
        branchId:       { type: 'string', description: 'Branch ID' },
        date:           { type: 'string', description: 'Date in YYYY-MM-DD format' },
        professionalId: { type: 'string', description: 'Specific professional ID — only include if client chose one (optional)' },
      },
      required: ['serviceId', 'branchId', 'date'],
    },
  },

  async execute({ serviceId, branchId, date, professionalId }, tenantId) {
    try {
      const result = await getAvailableSlots(tenantId, {
        serviceId:      serviceId as string,
        branchId:       branchId as string,
        date:           date as string,
        professionalId: professionalId as string | undefined,
      })

      if (result.slots.length === 0) {
        const isBlocked = 'blocked' in result && result.blocked
        return {
          disponibles: 0,
          horarios:    [],
          mensaje:     isBlocked
            ? `La fecha ${date} está bloqueada: ${'blockReason' in result && result.blockReason ? result.blockReason : 'sin motivo'}.`
            : `No hay horarios disponibles para el ${date}. Sugiere otra fecha al cliente.`,
        }
      }

      return {
        fecha:           result.date,
        duracionMinutos: result.durationMinutes,
        disponibles:     result.total,
        horarios:        result.slots.map((s) => ({
          horaInicio:          s.startTime,
          horaFin:             s.endTime,
          startAt:             s.startAt,
          ...(s.availableProfessionals
            ? { profesionalesLibres: s.availableProfessionals.map((p) => ({ id: p.id, nombre: p.name })) }
            : {}),
        })),
      }
    } catch (err) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return { error: e.code ?? 'ERROR', mensaje: e.message ?? 'Error consultando horarios.' }
    }
  },
}

// ─── crear_cita ───────────────────────────────────────────────────────────────

const crearCita: AgentTool = {
  definition: {
    name:        'crear_cita',
    description: 'Creates an appointment after the client has confirmed the time slot. Always call ver_horarios first. If the slot was taken in the meantime, returns SLOT_TAKEN so you can offer alternatives immediately.',
    input_schema: {
      type:       'object',
      properties: {
        serviceId:      { type: 'string',  description: 'Service type ID' },
        branchId:       { type: 'string',  description: 'Branch ID' },
        startAt:        { type: 'string',  description: 'Exact ISO datetime from the startAt field returned by ver_horarios' },
        clientName:     { type: 'string',  description: 'Full name of the client' },
        clientPhone:    { type: 'string',  description: 'Client WhatsApp phone — used to look up an existing CRM client and avoid duplicates' },
        clientEmail:    { type: 'string',  description: 'Client email for confirmation (optional)' },
        professionalId: { type: 'string',  description: 'Professional ID chosen by the client (optional)' },
        notes:          { type: 'string',  description: 'Additional notes (optional)' },
      },
      required: ['serviceId', 'branchId', 'startAt', 'clientName'],
    },
  },

  async execute({ serviceId, branchId, startAt, clientName, clientPhone, clientEmail, professionalId, notes }, tenantId) {
    // ── Vincular con cliente CRM si existe ────────────────────────────────────
    let resolvedClientId: string | undefined
    let resolvedEmail = clientEmail as string | undefined

    if (clientPhone) {
      const phone    = (clientPhone as string).trim()
      const existing = await prisma.client.findFirst({
        where: {
          tenantId,
          isActive: true,
          OR: [{ phone }, { whatsappId: phone }],
        },
        select: { id: true, email: true },
      })
      if (existing) {
        resolvedClientId = existing.id
        // Usar email del CRM si el cliente no lo proporcionó
        if (!resolvedEmail && existing.email) resolvedEmail = existing.email
      }
    }

    // ── Crear la cita (toda la lógica de validación está en el servicio) ──────
    try {
      const appointment = await createAppointment(tenantId, {
        branchId:       branchId as string,
        serviceTypeId:  serviceId as string,
        startAt:        startAt as string,
        clientId:       resolvedClientId,
        clientName:     clientName as string,
        clientEmail:    resolvedEmail,
        clientPhone:    clientPhone as string | undefined,
        professionalId: professionalId as string | undefined,
        notes:          notes as string | undefined,
        channel:        'whatsapp',
        status:         'confirmed',
        createdByAgent: true,
      })

      return {
        success:    true,
        citaId:     appointment.id,
        cliente:    appointment.clientName,
        servicio:   appointment.serviceType?.name ?? null,
        sucursal:   appointment.branch.name,
        profesional: appointment.professional?.name ?? null,
        inicio:     appointment.startAt,
        fin:        appointment.endAt,
        estado:     appointment.status,
        mensaje:    `Cita confirmada para ${appointment.clientName}${resolvedEmail ? '. Se envió confirmación al email.' : '.'}`,
      }
    } catch (err) {
      const e = err as { statusCode?: number; message?: string; code?: string }

      if (e.code === 'SLOT_TAKEN') {
        return {
          error:   'SLOT_TAKEN',
          mensaje: 'Ese horario acaba de ser tomado por otro cliente. Llama a ver_horarios de nuevo y ofrece alternativas.',
        }
      }
      if (e.code === 'SLOT_UNAVAILABLE') {
        return {
          error:   'SLOT_UNAVAILABLE',
          mensaje: `El horario solicitado está fuera del rango de disponibilidad. Usa ver_horarios para obtener slots válidos.`,
        }
      }
      if (e.code === 'DATE_BLOCKED') {
        return {
          error:   'DATE_BLOCKED',
          mensaje: 'Esa fecha está bloqueada. Ofrece otra fecha al cliente.',
        }
      }
      if (e.code === 'PROFESSIONAL_NOT_ASSIGNED') {
        return {
          error:   'PROFESSIONAL_NOT_ASSIGNED',
          mensaje: 'El profesional seleccionado no atiende ese servicio. Usa ver_profesionales para obtener la lista correcta.',
        }
      }

      return {
        error:   e.code ?? 'ERROR',
        mensaje: e.message ?? 'Error inesperado al crear la cita. Inténtalo de nuevo.',
      }
    }
  },
}

// ─── cancelar_cita ────────────────────────────────────────────────────────────

const cancelarCita: AgentTool = {
  definition: {
    name:        'cancelar_cita',
    description: 'Cancels an appointment by ID. Cannot cancel appointments in completed or no_show status. Always confirm with the client before calling this tool.',
    input_schema: {
      type:       'object',
      properties: {
        appointmentId: { type: 'string', description: 'Appointment ID to cancel' },
      },
      required: ['appointmentId'],
    },
  },

  async execute({ appointmentId }, tenantId) {
    const appointment = await prisma.appointment.findFirst({
      where:  { id: appointmentId as string, tenantId },
      select: { id: true, status: true, clientName: true },
    })

    if (!appointment) {
      return { error: 'CITA_NO_ENCONTRADA', mensaje: `No se encontró la cita con ID "${appointmentId}" en este tenant.` }
    }

    if (appointment.status === 'completed' || appointment.status === 'no_show') {
      return {
        error:   'CANCELACION_NO_PERMITIDA',
        mensaje: `La cita de ${appointment.clientName} está en estado "${appointment.status}" y no puede cancelarse.`,
      }
    }

    if (appointment.status === 'cancelled') {
      return { success: true, mensaje: `La cita de ${appointment.clientName} ya estaba cancelada.` }
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data:  { status: 'cancelled' },
    })

    return {
      success: true,
      citaId:  appointment.id,
      cliente: appointment.clientName,
      mensaje: `Cita de ${appointment.clientName} cancelada exitosamente.`,
    }
  },
}

// ─── consultar_citas ──────────────────────────────────────────────────────────

const consultarCitas: AgentTool = {
  definition: {
    name: 'consultar_citas',
    description: 'Returns appointments with optional filters by date, service, status and branch. Use to see what appointments are scheduled or to review past appointments.',
    input_schema: {
      type: 'object',
      properties: {
        fecha:     { type: 'string', description: 'Exact date YYYY-MM-DD (alternative to from/to)' },
        from:      { type: 'string', description: 'Start date YYYY-MM-DD' },
        to:        { type: 'string', description: 'End date YYYY-MM-DD' },
        serviceId: { type: 'string', description: 'Filter by service type ID' },
        estado:    { type: 'string', enum: ['confirmed', 'completed', 'cancelled', 'no_show'], description: 'Appointment status' },
        branchId:  { type: 'string', description: 'Filter by branch' },
        limit:     { type: 'number', description: 'Max results (default 20, max 50)' },
      },
    },
  },

  async execute({ fecha, from, to, serviceId, estado, branchId, limit }, tenantId) {
    const take = Math.min(50, Math.max(1, Number(limit ?? 20)))

    // Rango de fecha: si se pasa fecha exacta, filtrar ese día
    let gte: Date | undefined
    let lte: Date | undefined
    if (fecha) {
      gte = new Date(fecha as string)
      lte = new Date(new Date(fecha as string).setHours(23, 59, 59, 999))
    } else {
      if (from) gte = new Date(from as string)
      if (to)   lte = new Date(new Date(to as string).setHours(23, 59, 59, 999))
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        tenantId,
        ...(estado    ? { status:        estado    as string } : {}),
        ...(serviceId ? { serviceTypeId: serviceId as string } : {}),
        ...(branchId  ? { branchId:      branchId  as string } : {}),
        ...((gte || lte) ? { startAt: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {}),
      },
      include: {
        serviceType: { select: { name: true } },
        branch:      { select: { name: true } },
        professional: { select: { name: true } },
      },
      orderBy: { startAt: 'asc' },
      take,
    })

    if (appointments.length === 0) return { total: 0, citas: [], message: 'No se encontraron citas con los filtros indicados.' }

    return {
      total: appointments.length,
      citas: appointments.map((a) => ({
        id:          a.id,
        cliente:     a.clientName,
        servicio:    a.serviceType?.name ?? null,
        profesional: a.professional?.name ?? null,
        sucursal:    a.branch.name,
        estado:      a.status,
        inicio:      a.startAt.toISOString(),
        fin:         a.endAt.toISOString(),
        canal:       a.channel ?? null,
        createdByAgent: a.createdByAgent,
      })),
    }
  },
}

// ─── consultar_disponibilidad_hoy ─────────────────────────────────────────────

const consultarDisponibilidadHoy: AgentTool = {
  definition: {
    name: 'consultar_disponibilidad_hoy',
    description: 'Returns available time slots for today for a specific service and branch. Use when someone asks what appointments are available today without a specific date.',
    input_schema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Service type ID' },
        branchId:  { type: 'string', description: 'Branch ID' },
      },
      required: ['serviceId', 'branchId'],
    },
  },

  async execute({ serviceId, branchId }, tenantId) {
    const today = new Date().toISOString().split('T')[0]!

    try {
      const result = await getAvailableSlots(tenantId, {
        serviceId: serviceId as string,
        branchId:  branchId  as string,
        date:      today,
      })

      if (result.slots.length === 0) {
        const isBlocked = 'blocked' in result && result.blocked
        return {
          fecha:       today,
          disponibles: 0,
          horarios:    [],
          mensaje:     isBlocked
            ? `Hoy (${today}) está bloqueado en la agenda.`
            : `No hay horarios disponibles para hoy (${today}). Prueba mañana o consulta otra fecha.`,
        }
      }

      return {
        fecha:           today,
        duracionMinutos: result.durationMinutes,
        disponibles:     result.total,
        horarios:        result.slots.map((s) => ({
          horaInicio: s.startTime,
          horaFin:    s.endTime,
          startAt:    s.startAt,
        })),
      }
    } catch (err) {
      const e = err as { message?: string; code?: string }
      return { error: e.code ?? 'ERROR', mensaje: e.message ?? 'Error consultando disponibilidad de hoy.' }
    }
  },
}

// ─── Catálogo AGENDA ──────────────────────────────────────────────────────────

export const AGENDA_TOOLS: AgentTool[] = [
  verServicios,
  verProfesionales,
  verHorarios,
  crearCita,
  cancelarCita,
  consultarCitas,
  consultarDisponibilidadHoy,
]
