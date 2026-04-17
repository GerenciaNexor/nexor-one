import { z } from 'zod'

// ─── Línea de cotización ──────────────────────────────────────────────────────

const QuoteItemInput = z.object({
  /** ID del producto del catálogo KIRA. NULL si es descripción libre. */
  productId:   z.string().optional(),
  description: z.string().min(1, 'La descripción es requerida').max(500),
  quantity:    z.number().positive('La cantidad debe ser mayor a 0'),
  unitPrice:   z.number().min(0, 'El precio no puede ser negativo'),
  discountPct: z.number().min(0).max(100).default(0),
})

// ─── Cotización ───────────────────────────────────────────────────────────────

export const CreateQuoteSchema = z.object({
  clientId:   z.string().min(1, 'El cliente es requerido'),
  dealId:     z.string().optional(),
  /** Fecha ISO YYYY-MM-DD */
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
  /** Tasa de impuesto sobre (subtotal - descuento). Default 0. */
  taxRate:    z.number().min(0).max(100).default(0),
  notes:      z.string().optional(),
  items:      z.array(QuoteItemInput).min(1, 'Se requiere al menos un ítem'),
})

export const UpdateQuoteStatusSchema = z.object({
  status: z.enum(['sent', 'accepted', 'rejected']),
})

export const QuoteQuerySchema = z.object({
  clientId: z.string().optional(),
  dealId:   z.string().optional(),
  status:   z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']).optional(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateQuoteInput       = z.infer<typeof CreateQuoteSchema>
export type UpdateQuoteStatusInput = z.infer<typeof UpdateQuoteStatusSchema>
export type QuoteQuery             = z.infer<typeof QuoteQuerySchema>
