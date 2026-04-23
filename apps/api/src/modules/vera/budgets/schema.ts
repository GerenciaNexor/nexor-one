import { z } from 'zod'

const CURRENT_YEAR = new Date().getFullYear()

export const UpsertBudgetSchema = z.object({
  year:     z.number().int().min(CURRENT_YEAR),
  month:    z.number().int().min(1).max(12),
  amount:   z.number().positive('El monto debe ser positivo'),
  branchId: z.string().optional().nullable(),
  currency: z.string().length(3).default('COP'),
})

export const UpdateBudgetSchema = z.object({
  amount:   z.number().positive('El monto debe ser positivo').optional(),
  currency: z.string().length(3).optional(),
})

export type UpsertBudgetInput = z.infer<typeof UpsertBudgetSchema>
export type UpdateBudgetInput = z.infer<typeof UpdateBudgetSchema>
