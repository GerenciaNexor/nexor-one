import { z } from 'zod'

// ─── Stock query (HU-022) ─────────────────────────────────────────────────────

export const StockQuerySchema = z.object({
  branchId: z.string().optional(),
  belowMin: z.enum(['true', 'false']).optional(),
})

// ─── Movements (HU-023) ──────────────────────────────────────────────────────

export const CreateMovementSchema = z.object({
  type:          z.enum(['entrada', 'salida', 'ajuste']),
  productId:     z.string().min(1, 'El producto es requerido'),
  branchId:      z.string().min(1, 'La sucursal es requerida'),
  quantity:      z.number().refine((n) => n !== 0, 'La cantidad no puede ser cero'),
  notes:         z.string().max(1000).optional(),
  lotNumber:     z.string().max(100).optional(),  // solo entradas (lote)
  expiryDate:    z.string().optional(),            // ISO date: "2025-06-30"
  referenceType: z.string().max(50).optional(),   // para movimientos automáticos de NIRA
  referenceId:   z.string().max(30).optional(),
}).refine(
  (data) => data.type === 'ajuste' || data.quantity > 0,
  { message: 'Para entrada y salida la cantidad debe ser positiva', path: ['quantity'] },
)

export const MovementQuerySchema = z.object({
  productId: z.string().optional(),
  branchId:  z.string().optional(),
  type:      z.enum(['entrada', 'salida', 'ajuste']).optional(),
  from:      z.string().optional(), // ISO date
  to:        z.string().optional(), // ISO date
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(50),
})

export type StockQuery          = z.infer<typeof StockQuerySchema>
export type CreateMovementInput = z.infer<typeof CreateMovementSchema>
export type MovementQuery       = z.infer<typeof MovementQuerySchema>
