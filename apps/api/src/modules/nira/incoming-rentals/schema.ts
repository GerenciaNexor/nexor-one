import { z } from 'zod'

/**
 * HU-175 — Alquiler ENTRANTE (rentamos un producto de un tercero para un proyecto).
 * El tercero puede ser un proveedor existente de NIRA (`supplierId`) o una entidad nueva
 * suelta (`thirdPartyName` + `thirdPartyContact`), sin obligar a registrarla formalmente.
 * El producto NO entra a KIRA. Costo → egreso en VERA; depósito → retención por cobrar.
 */
export const CreateIncomingRentalSchema = z.object({
  description: z.string({ required_error: 'La descripción es requerida' }).min(1, 'La descripción es requerida').max(500),
  quantity:    z.number({ required_error: 'La cantidad es requerida', invalid_type_error: 'La cantidad es requerida' }).positive('La cantidad debe ser mayor a 0'),
  project:     z.string({ required_error: 'El proyecto es requerido' }).min(1, 'El proyecto es requerido').max(255),
  returnDate:  z.string({ required_error: 'La fecha de devolución es requerida' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de devolución inválida (YYYY-MM-DD)'),
  rentalCost:  z.number({ required_error: 'El costo del alquiler es requerido', invalid_type_error: 'El costo del alquiler es requerido' }).nonnegative('El costo no puede ser negativo'),
  deposit:     z.number().min(0, 'El depósito no puede ser negativo').default(0),
  // Tercero: proveedor existente O entidad nueva suelta (exactamente uno).
  supplierId:        z.string().min(1).optional(),
  thirdPartyName:    z.string().max(255).optional(),
  thirdPartyContact: z.string().max(255).nullish(),
  branchId:          z.string().min(1).nullish(),
  notes:             z.string().max(1000).nullish(),
}).refine(
  (d) => !!d.supplierId || (typeof d.thirdPartyName === 'string' && d.thirdPartyName.trim().length > 0),
  { message: 'Indica un proveedor existente o el nombre del tercero', path: ['thirdPartyName'] },
).refine(
  (d) => !(d.supplierId && typeof d.thirdPartyName === 'string' && d.thirdPartyName.trim().length > 0),
  { message: 'Elige un proveedor existente O un tercero nuevo, no ambos', path: ['thirdPartyName'] },
)

export const IncomingRentalQuerySchema = z.object({
  status:     z.enum(['active', 'returned']).optional(),
  supplierId: z.string().optional(),
  project:    z.string().optional(),                 // filtro por proyecto (contiene)
  search:     z.string().optional(),                 // tercero o descripción (contiene)
  dueBefore:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // próximos a vencer (returnDate ≤ fecha)
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(50),
})

export const DEPOSIT_RESOLUTIONS = ['recovered', 'lost'] as const

/**
 * HU-176 — Devolución del alquiler entrante: cierra el alquiler y resuelve el depósito PROPIO.
 *  - `recovered`: el tercero nos devuelve el depósito (vuelve a la empresa). Sin egreso.
 *  - `lost`: el tercero retiene `lostAmount` (≤ depósito), con motivo → egreso (pérdida) en VERA.
 */
export const ReturnIncomingRentalSchema = z.object({
  depositResolution: z.enum(DEPOSIT_RESOLUTIONS, { invalid_type_error: 'Resolución de depósito inválida' }).default('recovered'),
  lostAmount:        z.number().min(0, 'El monto perdido no puede ser negativo').optional(),
  reason:            z.string().max(500).nullish(),
  notes:             z.string().max(1000).nullish(),
}).refine(
  (d) => d.depositResolution !== 'lost' || (d.lostAmount !== undefined && d.lostAmount > 0),
  { message: 'Indica cuánto retuvo el tercero del depósito', path: ['lostAmount'] },
).refine(
  (d) => d.depositResolution !== 'lost' || (typeof d.reason === 'string' && d.reason.trim().length > 0),
  { message: 'Indica el motivo por el que se pierde el depósito', path: ['reason'] },
)

export type CreateIncomingRentalInput = z.infer<typeof CreateIncomingRentalSchema>
export type IncomingRentalQuery       = z.infer<typeof IncomingRentalQuerySchema>
export type ReturnIncomingRentalInput = z.infer<typeof ReturnIncomingRentalSchema>
