import { z } from 'zod'

export const CreateUserSchema = z.object({
  email:    z.string().email('Email invalido'),
  name:     z.string().min(1, 'El nombre es requerido').max(255),
  password: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres'),
  role:     z.enum(['TENANT_ADMIN', 'BRANCH_ADMIN', 'AREA_MANAGER', 'OPERATIVE']),
  // TENANT_ADMIN / BRANCH_ADMIN acceden a TODAS las áreas → no llevan módulo (el frontend envía null).
  // Solo AREA_MANAGER y OPERATIVE trabajan en un módulo específico. Se acepta null/undefined y se exige
  // el módulo únicamente para esos dos roles (ver refine abajo).
  module:   z.enum(['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA']).nullable().optional(),
  branchId: z.string().nullable().optional(),
}).superRefine((data, ctx) => {
  if ((data.role === 'AREA_MANAGER' || data.role === 'OPERATIVE') && !data.module) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['module'], message: 'El módulo es requerido para Jefe de Área y Operativo' })
  }
})

export const UpdateUserSchema = z.object({
  name:     z.string().min(1).max(255).optional(),
  role:     z.enum(['TENANT_ADMIN', 'BRANCH_ADMIN', 'AREA_MANAGER', 'OPERATIVE']).optional(),
  module:   z.enum(['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA']).nullable().optional(),
  branchId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
})

/** Cambio de la PROPIA contraseña (self-service): verifica la actual y setea la nueva. */
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'La contraseña actual es requerida'),
  newPassword:     z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
})

export type CreateUserInput     = z.infer<typeof CreateUserSchema>
export type UpdateUserInput     = z.infer<typeof UpdateUserSchema>
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>
