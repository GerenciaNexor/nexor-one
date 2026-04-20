import { z } from 'zod'

export const CreateServiceTypeSchema = z.object({
  name:            z.string().min(1).max(255),
  description:     z.string().max(500).optional(),
  durationMinutes: z.number().int().min(5).max(480).default(30),
  price:           z.number().min(0).optional(),
  color:           z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color debe ser hex #RRGGBB').optional(),
  branchId:        z.string().optional(),
  /** IDs de usuarios que realizan este servicio. Vacío = sin restricción de profesional */
  professionalIds: z.array(z.string()).default([]),
})

export const UpdateServiceTypeSchema = z.object({
  name:            z.string().min(1).max(255).optional(),
  description:     z.string().max(500).optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  price:           z.number().min(0).nullable().optional(),
  color:           z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  branchId:        z.string().nullable().optional(),
  isActive:        z.boolean().optional(),
  /** Reemplaza completamente la lista de profesionales */
  professionalIds: z.array(z.string()).optional(),
})

export const ServiceTypeQuerySchema = z.object({
  branchId: z.string().optional(),
  active:   z.enum(['true', 'false']).optional(),
})

export type CreateServiceTypeInput = z.infer<typeof CreateServiceTypeSchema>
export type UpdateServiceTypeInput = z.infer<typeof UpdateServiceTypeSchema>
export type ServiceTypeQuery       = z.infer<typeof ServiceTypeQuerySchema>
