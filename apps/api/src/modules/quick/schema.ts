import { z } from 'zod'

/**
 * HU-169 — Registro rápido de compra/venta (transacción ya ocurrida, sin aprobación).
 * `affectsInventory` es OBLIGAToria (sí/no): nadie registra a medias algo que descuadre el stock.
 *  - sí → mueve stock (entrada/salida) + VERA; requiere producto, cantidad (entera), precio y sucursal.
 *  - no → solo VERA (gasto/ingreso de servicio); requiere descripción y monto.
 */
const REQUIRED_BOOL = z.boolean({
  required_error: 'Indica si afecta al inventario (sí/no)',
  invalid_type_error: 'Indica si afecta al inventario (sí/no)',
})

export const QuickPurchaseSchema = z.object({
  affectsInventory: REQUIRED_BOOL,
  /** Proveedor específico; si se omite/null → genérico "Proveedor ocasional" (HU-154). */
  supplierId: z.string().min(1).nullish(),
  branchId:   z.string().min(1).nullish(),
  // Caso inventario:
  productId:  z.string().min(1).optional(),
  quantity:   z.number().int('La cantidad debe ser entera').positive('La cantidad debe ser mayor a 0').optional(),
  unitCost:   z.number().nonnegative('El costo no puede ser negativo').optional(),
  // Caso servicio (sin inventario):
  description: z.string().max(500).optional(),
  amount:      z.number().positive('El monto debe ser mayor a 0').optional(),
  /** Fecha de la transacción (ya ocurrió). Por defecto hoy. */
  date:        z.string().optional(),
}).superRefine((d, ctx) => {
  if (d.affectsInventory) {
    if (!d.productId) ctx.addIssue({ code: 'custom', message: 'Selecciona el producto', path: ['productId'] })
    if (!d.branchId)  ctx.addIssue({ code: 'custom', message: 'Selecciona la sucursal', path: ['branchId'] })
    if (d.quantity === undefined) ctx.addIssue({ code: 'custom', message: 'Indica la cantidad', path: ['quantity'] })
    if (d.unitCost === undefined) ctx.addIssue({ code: 'custom', message: 'Indica el costo unitario', path: ['unitCost'] })
  } else {
    if (!d.description?.trim()) ctx.addIssue({ code: 'custom', message: 'Describe el gasto', path: ['description'] })
    if (d.amount === undefined) ctx.addIssue({ code: 'custom', message: 'Indica el monto', path: ['amount'] })
  }
})

export const QuickSaleSchema = z.object({
  affectsInventory: REQUIRED_BOOL,
  /** Cliente específico; si se omite/null → genérico "Consumidor final" (HU-154). */
  clientId:  z.string().min(1).nullish(),
  branchId:  z.string().min(1).nullish(),
  // Caso inventario:
  productId: z.string().min(1).optional(),
  quantity:  z.number().int('La cantidad debe ser entera').positive('La cantidad debe ser mayor a 0').optional(),
  unitPrice: z.number().nonnegative('El precio no puede ser negativo').optional(),
  // Caso servicio (sin inventario):
  description: z.string().max(500).optional(),
  amount:      z.number().positive('El monto debe ser mayor a 0').optional(),
  date:        z.string().optional(),
}).superRefine((d, ctx) => {
  if (d.affectsInventory) {
    if (!d.productId) ctx.addIssue({ code: 'custom', message: 'Selecciona el producto', path: ['productId'] })
    if (!d.branchId)  ctx.addIssue({ code: 'custom', message: 'Selecciona la sucursal', path: ['branchId'] })
    if (d.quantity === undefined)  ctx.addIssue({ code: 'custom', message: 'Indica la cantidad', path: ['quantity'] })
    if (d.unitPrice === undefined) ctx.addIssue({ code: 'custom', message: 'Indica el precio unitario', path: ['unitPrice'] })
  } else {
    if (!d.description?.trim()) ctx.addIssue({ code: 'custom', message: 'Describe la venta', path: ['description'] })
    if (d.amount === undefined) ctx.addIssue({ code: 'custom', message: 'Indica el monto', path: ['amount'] })
  }
})

export type QuickPurchaseInput = z.infer<typeof QuickPurchaseSchema>
export type QuickSaleInput     = z.infer<typeof QuickSaleSchema>
