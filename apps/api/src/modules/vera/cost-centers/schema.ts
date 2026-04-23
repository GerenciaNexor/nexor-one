import { z } from 'zod'

export const CreateCostCenterSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
})

export const UpdateCostCenterSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  isActive:    z.boolean().optional(),
})

export type CreateCostCenterInput = z.infer<typeof CreateCostCenterSchema>
export type UpdateCostCenterInput = z.infer<typeof UpdateCostCenterSchema>
