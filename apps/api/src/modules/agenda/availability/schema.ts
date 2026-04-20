import { z } from 'zod'

// dayOfWeek: 0 = Domingo, 1 = Lunes, ... 6 = Sábado (ISO JS)
// time format: "HH:MM" en 24h
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

export const CreateAvailabilitySchema = z.object({
  branchId:  z.string().optional(),
  userId:    z.string().optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(TIME_REGEX, 'Formato de hora inválido (HH:MM)'),
  endTime:   z.string().regex(TIME_REGEX, 'Formato de hora inválido (HH:MM)'),
}).refine((d) => d.startTime < d.endTime, {
  message: 'La hora de inicio debe ser anterior a la hora de fin',
  path:    ['endTime'],
})

export const UpdateAvailabilitySchema = z.object({
  startTime: z.string().regex(TIME_REGEX).optional(),
  endTime:   z.string().regex(TIME_REGEX).optional(),
  isActive:  z.boolean().optional(),
}).refine((d) => {
  if (d.startTime && d.endTime) return d.startTime < d.endTime
  return true
}, { message: 'La hora de inicio debe ser anterior a la hora de fin', path: ['endTime'] })

export const AvailabilityQuerySchema = z.object({
  branchId: z.string().optional(),
  userId:   z.string().optional(),
})

export type CreateAvailabilityInput = z.infer<typeof CreateAvailabilitySchema>
export type UpdateAvailabilityInput = z.infer<typeof UpdateAvailabilitySchema>
export type AvailabilityQuery       = z.infer<typeof AvailabilityQuerySchema>
