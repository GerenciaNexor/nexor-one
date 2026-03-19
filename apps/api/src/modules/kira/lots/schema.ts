import { z } from 'zod'

export const LotQuerySchema = z.object({
  branchId:     z.string().optional(),
  expiringSoon: z.enum(['true', 'false']).optional(), // vence en los próximos 30 días
  expired:      z.enum(['true', 'false']).optional(), // ya vencidos
})

export type LotQuery = z.infer<typeof LotQuerySchema>
