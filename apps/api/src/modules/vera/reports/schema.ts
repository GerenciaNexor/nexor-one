import { z } from 'zod'

const dateRegex = /^\d{4}-\d{2}-\d{2}$/

export const ReportQuerySchema = z.object({
  dateFrom:    z.string().regex(dateRegex, 'Formato YYYY-MM-DD').optional(),
  dateTo:      z.string().regex(dateRegex, 'Formato YYYY-MM-DD').optional(),
  branchId:    z.string().optional(),
})

export const TimelineQuerySchema = ReportQuerySchema.extend({
  granularity: z.enum(['day', 'week', 'month']).default('month'),
})

export type ReportQuery   = z.infer<typeof ReportQuerySchema>
export type TimelineQuery = z.infer<typeof TimelineQuerySchema>
