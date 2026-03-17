import { z } from 'zod'

export const UpdateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  legalName: z.string().max(255).nullable().optional(),
  taxId: z.string().max(50).nullable().optional(),
  timezone: z.string().max(50).optional(),
  currency: z.string().length(3, { message: 'currency debe ser un codigo ISO 4217 de 3 letras' }).optional(),
  logoUrl: z.string().url({ message: 'logoUrl debe ser una URL valida' }).max(500).nullable().optional(),
})

export const UpdateFeatureFlagSchema = z.object({
  module: z.enum(['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA']),
  enabled: z.boolean(),
})

export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>
export type UpdateFeatureFlagInput = z.infer<typeof UpdateFeatureFlagSchema>
