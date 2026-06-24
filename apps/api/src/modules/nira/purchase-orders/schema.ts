import { z } from 'zod'

const PurchaseOrderItemInput = z.object({
  productId:       z.string().min(1, 'El producto es requerido'),
  quantityOrdered: z.number().positive('La cantidad debe ser mayor a 0'),
  unitCost:        z.number().min(0, 'El costo no puede ser negativo'),
})

export const CreatePurchaseOrderSchema = z.object({
  supplierId:       z.string().min(1, 'El proveedor es requerido'),
  branchId:         z.string().optional(),
  /** Fecha ISO YYYY-MM-DD */
  expectedDelivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
  /** Porcentaje de impuesto sobre el subtotal (ej: 19 para IVA 19%). Default 0. */
  taxRate:          z.number().min(0).max(100).default(0),
  notes:            z.string().optional(),
  items:            z.array(PurchaseOrderItemInput).min(1, 'Se requiere al menos un producto'),
})

export const UpdatePurchaseOrderSchema = z.object({
  supplierId:       z.string().min(1).optional(),
  branchId:         z.string().nullable().optional(),
  expectedDelivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  taxRate:          z.number().min(0).max(100).optional(),
  notes:            z.string().nullable().optional(),
  items:            z.array(PurchaseOrderItemInput).min(1).optional(),
})

export const PurchaseOrderQuerySchema = z.object({
  status:     z.enum(['draft', 'submitted', 'approved', 'sent', 'partial', 'received', 'cancelled']).optional(),
  supplierId: z.string().optional(),
  branchId:   z.string().optional(),
})

export const ReceivePurchaseOrderSchema = z.object({
  items: z.array(z.object({
    purchaseOrderItemId: z.string().min(1, 'El ID de línea es requerido'),
    quantityReceived:    z.number().positive('La cantidad debe ser mayor a 0'),
  })).min(1, 'Se requiere al menos una línea'),
})

export const FromAlertSchema = z.object({
  productId: z.string().min(1, 'El productId es requerido'),
  branchId:  z.string().min(1, 'El branchId es requerido'),
})

// HU-125 — calificación del proveedor al recibir la OC (Entrega + Calidad, escala 1-5).
export const RatePurchaseOrderSchema = z.object({
  deliveryRating: z.number().int().min(1, 'Mínimo 1').max(5, 'Máximo 5'),
  qualityRating:  z.number().int().min(1, 'Mínimo 1').max(5, 'Máximo 5'),
  notes:          z.string().max(1000).optional(),
})

export type CreatePurchaseOrderInput  = z.infer<typeof CreatePurchaseOrderSchema>
export type UpdatePurchaseOrderInput  = z.infer<typeof UpdatePurchaseOrderSchema>
export type PurchaseOrderQuery        = z.infer<typeof PurchaseOrderQuerySchema>
export type ReceivePurchaseOrderInput = z.infer<typeof ReceivePurchaseOrderSchema>
export type FromAlertInput            = z.infer<typeof FromAlertSchema>
export type RatePurchaseOrderInput    = z.infer<typeof RatePurchaseOrderSchema>
