import { z } from 'zod'

/** HU-158 — Alquiler (salida temporal de stock). Opera sobre el DISPONIBLE, nunca sobre el total. */
export const CreateRentalSchema = z.object({
  productId: z.string().min(1, 'El producto es requerido'),
  branchId:  z.string().min(1, 'La sucursal es requerida'),
  quantity:  z.number().positive('La cantidad debe ser mayor a 0'),
  clientId:  z.string().min(1).nullable().optional(),
  dueAt:     z.string().datetime().optional(),
  notes:     z.string().max(1000).nullish(),
})

export const ReturnRentalSchema = z.object({
  notes: z.string().max(1000).nullish(),
})

export const RentalQuerySchema = z.object({
  status:    z.enum(['active', 'returned']).optional(),
  productId: z.string().optional(),
  branchId:  z.string().optional(),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(50),
})

export type CreateRentalInput = z.infer<typeof CreateRentalSchema>
export type ReturnRentalInput = z.infer<typeof ReturnRentalSchema>
export type RentalQuery       = z.infer<typeof RentalQuerySchema>
