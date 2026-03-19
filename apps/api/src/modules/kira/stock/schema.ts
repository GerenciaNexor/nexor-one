import { z } from 'zod'

export const StockQuerySchema = z.object({
  branchId: z.string().optional(),
  belowMin: z.enum(['true', 'false']).optional(),
})

export type StockQuery = z.infer<typeof StockQuerySchema>
