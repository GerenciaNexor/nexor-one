import { z } from 'zod'

export const SlotsQuerySchema = z.object({
  serviceId:      z.string({ required_error: 'serviceId es requerido' }),
  branchId:       z.string({ required_error: 'branchId es requerido' }),
  date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe estar en formato YYYY-MM-DD'),
  professionalId: z.string().optional(),
})

export type SlotsQuery = z.infer<typeof SlotsQuerySchema>
