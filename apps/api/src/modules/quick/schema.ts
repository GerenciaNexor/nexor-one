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

/**
 * HU-170 — Datos COMPLETOS para crear un producto al vuelo desde la compra rápida
 * (un producto nace cuando se compra). Queda como cualquier producto de KIRA (tenant/RLS).
 */
export const NewProductInput = z.object({
  sku:         z.string().min(1, 'El SKU es requerido').max(100),
  name:        z.string().min(1, 'El nombre es requerido').max(255),
  description: z.string().max(1000).nullish(),
  category:    z.string().max(100).nullish(),
  unit:        z.string().min(1).max(50).default('unidad'),
  salePrice:   z.number().positive('El precio de venta debe ser positivo').optional(),
  costPrice:   z.number().positive('El costo debe ser positivo').optional(),
  minStock:    z.number().int().min(0).default(0),
  maxStock:    z.number().int().positive().optional(),
  isSellable:  z.boolean().default(true),
  isRentable:  z.boolean().default(false),
  rentalPrice: z.number().positive().optional(),
}).refine((d) => d.isSellable || d.isRentable, { message: 'El producto debe ser de venta, de alquiler o ambos', path: ['isSellable'] })

export const QuickPurchaseSchema = z.object({
  affectsInventory: REQUIRED_BOOL,
  /** Proveedor específico; si se omite/null → genérico "Proveedor ocasional" (HU-154). */
  supplierId: z.string().min(1).nullish(),
  branchId:   z.string().min(1).nullish(),
  // Caso inventario: producto EXISTENTE…
  productId:  z.string().min(1).optional(),
  // …o crear uno NUEVO al vuelo (HU-170 — un producto nace cuando se compra).
  newProduct: NewProductInput.optional(),
  quantity:   z.number().int('La cantidad debe ser entera').positive('La cantidad debe ser mayor a 0').optional(),
  unitCost:   z.number().nonnegative('El costo no puede ser negativo').optional(),
  // Caso servicio (sin inventario):
  description: z.string().max(500).optional(),
  amount:      z.number().positive('El monto debe ser mayor a 0').optional(),
  /** Fecha de la transacción (ya ocurrió). Por defecto hoy. */
  date:        z.string().optional(),
}).superRefine((d, ctx) => {
  if (d.affectsInventory) {
    if (!d.productId && !d.newProduct) ctx.addIssue({ code: 'custom', message: 'Selecciona un producto existente o crea uno nuevo', path: ['productId'] })
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
