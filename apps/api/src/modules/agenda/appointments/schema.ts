import { z } from 'zod'

/** HU-204 — un asistente de evento libre: interno (userId) o externo (email); nombre opcional. */
export const AttendeeInput = z
  .object({
    userId: z.string().min(1).optional(),
    email:  z.string().email('Correo de asistente inválido').optional(),
    name:   z.string().max(255).optional(),
  })
  .refine((a) => !!(a.userId || a.email), { message: 'Cada asistente requiere un usuario interno o un correo' })

export const CreateAppointmentSchema = z
  .object({
    // HU-204 — tipo: cita de servicio (actual) o evento libre (nuevo). Default 'service' (compatibilidad).
    type:           z.enum(['service', 'event']).default('service'),
    startAt:        z.string({ required_error: 'startAt es requerido' }),
    // ── Cita de servicio ──
    branchId:       z.string().optional(),
    serviceTypeId:  z.string().optional(),
    clientId:       z.string().optional(),
    clientName:     z.string().min(1).optional(),
    clientEmail:    z.string().email('Email inválido').optional(),
    clientPhone:    z.string().optional(),
    professionalId: z.string().optional(),
    // ── Evento libre ──
    title:          z.string().min(1, 'El título es requerido').max(255).optional(),
    endAt:          z.string().optional(),        // fin explícito (evento); si falta se usa +1h
    attendees:      z.array(AttendeeInput).max(50, 'Demasiados asistentes').optional(),
    // ── Comunes ──
    notes:          z.string().optional(),
    channel:        z.enum(['manual', 'whatsapp', 'email', 'internal']).default('manual'),
    status:         z.enum(['scheduled', 'confirmed']).default('scheduled'),
    createdByAgent: z.boolean().default(false),
    // HU — cita a hora ESPECÍFICA (como Google Calendar): omite la validación de disponibilidad
    // (los horarios son sugerencia), pero NUNCA el control de solapamiento. Solo lo usa el panel interno.
    manualTime:     z.boolean().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.type === 'event') {
      if (!d.title?.trim()) ctx.addIssue({ code: 'custom', path: ['title'], message: 'El título del evento es requerido' })
    } else {
      if (!d.serviceTypeId) ctx.addIssue({ code: 'custom', path: ['serviceTypeId'], message: 'serviceTypeId es requerido' })
      if (!d.branchId)      ctx.addIssue({ code: 'custom', path: ['branchId'],      message: 'branchId es requerido' })
      if (!(d.clientId || d.clientName)) ctx.addIssue({ code: 'custom', path: ['clientName'], message: 'Se requiere clientId o clientName' })
    }
  })

/** HU-204 — editar un evento libre (título, descripción, horario, sucursal y asistentes). */
export const UpdateEventSchema = z.object({
  title:     z.string().min(1).max(255).optional(),
  notes:     z.string().nullish(),
  startAt:   z.string().optional(),
  endAt:     z.string().optional(),
  branchId:  z.string().nullish(),
  attendees: z.array(AttendeeInput).max(50).optional(),
})

/** HU-205 — chequeo de disponibilidad (ocupado/libre) de varios usuarios en un rango. */
export const AvailabilityCheckSchema = z.object({
  userIds:   z.array(z.string().min(1)).min(1, 'Indica al menos un usuario').max(50),
  from:      z.string({ required_error: 'from es requerido' }),
  to:        z.string({ required_error: 'to es requerido' }),
  excludeId: z.string().optional(), // al editar un evento, se excluye a sí mismo del chequeo
})

export const UpdateStatusSchema = z.object({
  status: z.enum(['confirmed', 'completed', 'cancelled', 'no_show'], {
    required_error: 'status es requerido',
  }),
})

export const ListAppointmentsQuerySchema = z.object({
  branchId:       z.string().optional(),
  date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD').optional(),
  // HU-203 — rango de fechas (para "próximas citas"). Se ignora si se pasa `date` exacto.
  from:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD').optional(),
  to:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD').optional(),
  status:         z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  professionalId: z.string().optional(),
})

export type CreateAppointment     = z.infer<typeof CreateAppointmentSchema>
export type UpdateEvent           = z.infer<typeof UpdateEventSchema>
export type AvailabilityCheck     = z.infer<typeof AvailabilityCheckSchema>
export type UpdateStatus          = z.infer<typeof UpdateStatusSchema>
export type ListAppointmentsQuery = z.infer<typeof ListAppointmentsQuerySchema>
export type AttendeeInputT        = z.infer<typeof AttendeeInput>
