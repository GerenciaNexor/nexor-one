import { z } from 'zod'

export const ReportQuerySchema = z.object({
  dateFrom:   z.string().optional(),  // ISO date string YYYY-MM-DD
  dateTo:     z.string().optional(),  // ISO date string YYYY-MM-DD
  assignedTo: z.string().optional(),  // userId or "me"
  branchId:   z.string().optional(),
})

export type ReportQuery = z.infer<typeof ReportQuerySchema>
