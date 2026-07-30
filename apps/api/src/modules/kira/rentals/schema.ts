import { z } from 'zod'

export const CHARGE_TYPES = ['fixed', 'daily'] as const

/**
 * HU-158/159 — Alquiler (salida temporal). Opera sobre el DISPONIBLE, nunca sobre el total.
 * Cobro: `fixed` (monto fijo + fecha de retorno) o `daily` (tarifa diaria + fecha estimada).
 */
export const CreateRentalSchema = z.object({
  clientId:   z.string({ required_error: 'El cliente es requerido' }).min(1, 'El cliente es requerido'),
  productId:  z.string().min(1, 'El producto es requerido'),
  branchId:   z.string().min(1, 'La sucursal es requerida'),
  quantity:   z.number().positive('La cantidad debe ser mayor a 0'),
  chargeType: z.enum(CHARGE_TYPES, { invalid_type_error: 'Tipo de cobro inválido' }),
  fixedAmount: z.number().positive('El monto debe ser positivo').optional(),
  dailyRate:   z.number().positive('La tarifa diaria debe ser positiva').optional(),
  deposit:     z.number().min(0, 'El depósito no puede ser negativo').default(0),
  /** Fecha de retorno (fija) o estimada (por días). Requerida. */
  dueAt:      z.string().min(1, 'La fecha de retorno es requerida'),
  notes:      z.string().max(1000).nullish(),
}).refine(
  (d) => d.chargeType !== 'fixed' || (d.fixedAmount !== undefined && d.fixedAmount > 0),
  { message: 'Indica el monto fijo del alquiler', path: ['fixedAmount'] },
).refine(
  (d) => d.chargeType !== 'daily' || (d.dailyRate !== undefined && d.dailyRate > 0),
  { message: 'Indica la tarifa por día', path: ['dailyRate'] },
)

export const ReturnRentalSchema = z.object({
  notes: z.string().max(1000).nullish(),
})

export const RentalQuerySchema = z.object({
  status:    z.enum(['active', 'returned']).optional(),
  productId: z.string().optional(),
  branchId:  z.string().optional(),
  clientId:  z.string().optional(),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(50),
})

export type CreateRentalInput = z.infer<typeof CreateRentalSchema>
export type ReturnRentalInput = z.infer<typeof ReturnRentalSchema>
export type RentalQuery       = z.infer<typeof RentalQuerySchema>
