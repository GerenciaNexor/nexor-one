import { z } from 'zod'

export const CreateCategorySchema = z.object({
  name:  z.string().min(1).max(100),
  type:  z.enum(['income', 'expense', 'both'], { required_error: 'type es requerido' }),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color debe ser hex #rrggbb').optional(),
})

export const UpdateCategorySchema = z.object({
  name:     z.string().min(1).max(100).optional(),
  color:    z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color debe ser hex #rrggbb').optional().nullable(),
  isActive: z.boolean().optional(),
})

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>
