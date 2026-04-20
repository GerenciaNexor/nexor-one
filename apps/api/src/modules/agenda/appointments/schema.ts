import { z } from 'zod'

export const CreateAppointmentSchema = z
  .object({
    branchId:       z.string({ required_error: 'branchId es requerido' }),
    serviceTypeId:  z.string({ required_error: 'serviceTypeId es requerido' }),
    startAt:        z.string({ required_error: 'startAt es requerido' }),
    clientId:       z.string().optional(),
    clientName:     z.string().min(1).optional(),
    clientEmail:    z.string().email('Email inválido').optional(),
    clientPhone:    z.string().optional(),
    professionalId: z.string().optional(),
    notes:          z.string().optional(),
    channel:        z.enum(['manual', 'whatsapp', 'email']).default('manual'),
    status:         z.enum(['scheduled', 'confirmed']).default('scheduled'),
    createdByAgent: z.boolean().default(false),
  })
  .refine((d) => !!(d.clientId || d.clientName), {
    message: 'Se requiere clientId o clientName',
    path:    ['clientName'],
  })

export const UpdateStatusSchema = z.object({
  status: z.enum(['confirmed', 'completed', 'cancelled', 'no_show'], {
    required_error: 'status es requerido',
  }),
})

export const ListAppointmentsQuerySchema = z.object({
  branchId:       z.string().optional(),
  date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD').optional(),
  status:         z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  professionalId: z.string().optional(),
})

export type CreateAppointment     = z.infer<typeof CreateAppointmentSchema>
export type UpdateStatus          = z.infer<typeof UpdateStatusSchema>
export type ListAppointmentsQuery = z.infer<typeof ListAppointmentsQuerySchema>
