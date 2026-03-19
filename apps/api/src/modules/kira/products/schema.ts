import { z } from 'zod'

export const CreateProductSchema = z.object({
  sku:         z.string().min(1, 'El SKU es requerido').max(100),
  name:        z.string().min(1, 'El nombre es requerido').max(255),
  description: z.string().max(1000).optional(),
  category:    z.string().max(100).optional(),
  unit:        z.string().min(1).max(50).default('unidad'),
  salePrice:   z.number().positive('El precio de venta debe ser positivo').optional(),
  costPrice:   z.number().positive('El precio de costo debe ser positivo').optional(),
  minStock:    z.number().int().min(0, 'El stock mínimo no puede ser negativo').default(0),
  maxStock:    z.number().int().positive('El stock máximo debe ser positivo').optional(),
}).refine(
  (data) => data.maxStock === undefined || data.maxStock > data.minStock,
  { message: 'El stock máximo debe ser mayor al stock mínimo', path: ['maxStock'] },
)

export const UpdateProductSchema = z.object({
  name:        z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  category:    z.string().max(100).optional(),
  unit:        z.string().min(1).max(50).optional(),
  salePrice:   z.number().positive('El precio de venta debe ser positivo').optional(),
  costPrice:   z.number().positive('El precio de costo debe ser positivo').optional(),
  minStock:    z.number().int().min(0, 'El stock mínimo no puede ser negativo').optional(),
  maxStock:    z.number().int().positive('El stock máximo debe ser positivo').optional(),
})

// La validación cruzada minStock/maxStock en updates se hace en el service,
// porque necesita comparar con los valores actuales en la DB.

export const ProductQuerySchema = z.object({
  search:   z.string().optional(),
  category: z.string().optional(),
  active:   z.enum(['true', 'false']).optional(), // default: solo activos
})

export type CreateProductInput = z.infer<typeof CreateProductSchema>
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>
export type ProductQuery      = z.infer<typeof ProductQuerySchema>
