import { z } from 'zod'

export const CreateBranchSchema = z.object({
  name: z.string().min(1, { message: 'El nombre es requerido' }).max(255),
  city: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
})

export const UpdateBranchSchema = CreateBranchSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export type CreateBranchInput = z.infer<typeof CreateBranchSchema>
export type UpdateBranchInput = z.infer<typeof UpdateBranchSchema>
