import { z } from 'zod'

export const CreateBlockedDateSchema = z.object({
  date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe estar en formato YYYY-MM-DD'),
  reason:   z.string().max(255).optional(),
  branchId: z.string().optional(),
})

export const BlockedDateQuerySchema = z.object({
  branchId: z.string().optional(),
  from:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export type CreateBlockedDateInput = z.infer<typeof CreateBlockedDateSchema>
export type BlockedDateQuery       = z.infer<typeof BlockedDateQuerySchema>
