import { z } from 'zod'

export const CreateUserSchema = z.object({
  email:    z.string().email('Email invalido'),
  name:     z.string().min(1, 'El nombre es requerido').max(255),
  password: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres'),
  role:     z.enum(['TENANT_ADMIN', 'BRANCH_ADMIN', 'AREA_MANAGER', 'OPERATIVE']),
  module:   z.enum(['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA']).optional(),
  branchId: z.string().optional(),
})

export const UpdateUserSchema = z.object({
  name:     z.string().min(1).max(255).optional(),
  role:     z.enum(['TENANT_ADMIN', 'BRANCH_ADMIN', 'AREA_MANAGER', 'OPERATIVE']).optional(),
  module:   z.enum(['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA']).nullable().optional(),
  branchId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
})

export type CreateUserInput = z.infer<typeof CreateUserSchema>
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>
