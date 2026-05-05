import { z } from 'zod'

export const BULK_UPLOAD_TYPES = [
  'users',
  'products',
  'stock',
  'suppliers',
  'clients',
  'appointments',
  'transactions',
] as const

export type BulkUploadType = (typeof BULK_UPLOAD_TYPES)[number]

export interface RowError {
  row: number
  column: string
  message: string
}

// ─── Helper: número coercible desde string (compatible con Excel) ─────────────

const num = (msg?: string) =>
  z.coerce.number({ invalid_type_error: msg ?? 'Debe ser un número válido' })

// ─── Schemas de fila por tipo ─────────────────────────────────────────────────

export const UserRowSchema = z.object({
  nombre:      z.string({ invalid_type_error: 'El nombre debe ser texto' })
                .min(1, 'El nombre es requerido')
                .max(255),
  email:       z.string({ invalid_type_error: 'El email debe ser texto' })
                .email('El email no es válido')
                .max(255),
  contraseña:  z.string({ invalid_type_error: 'La contraseña debe ser texto' })
                .min(8, 'La contraseña debe tener mínimo 8 caracteres')
                .optional(),
  rol:         z.enum(['OPERATIVE', 'AREA_MANAGER', 'BRANCH_ADMIN', 'TENANT_ADMIN'], {
    errorMap: () => ({ message: 'El rol debe ser OPERATIVE, AREA_MANAGER, BRANCH_ADMIN o TENANT_ADMIN' }),
  }),
  modulo:      z.enum(['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'], {
    errorMap: () => ({ message: 'El módulo debe ser ARI, NIRA, KIRA, AGENDA o VERA' }),
  }).optional(),
  sucursal_id: z.string().optional(),
})

export const ProductRowSchema = z.object({
  sku:          z.string({ invalid_type_error: 'El SKU debe ser texto' })
                 .min(1, 'El SKU es requerido')
                 .max(100),
  nombre:       z.string({ invalid_type_error: 'El nombre debe ser texto' })
                 .min(1, 'El nombre es requerido')
                 .max(255),
  descripcion:  z.string().max(1000).optional(),
  categoria:    z.string().max(100).optional(),
  unidad:       z.string({ invalid_type_error: 'La unidad debe ser texto' })
                 .min(1, 'La unidad es requerida')
                 .max(50)
                 .default('unidad'),
  precio_venta: num('El precio de venta debe ser un número').positive('El precio de venta debe ser positivo').optional(),
  precio_costo: num('El precio de costo debe ser un número').positive('El precio de costo debe ser positivo').optional(),
  stock_minimo: num('El stock mínimo debe ser un número').int('El stock mínimo debe ser un número entero').min(0, 'El stock mínimo no puede ser negativo').default(0),
  stock_maximo: num('El stock máximo debe ser un número').int('El stock máximo debe ser un número entero').positive('El stock máximo debe ser positivo').optional(),
})

export const StockRowSchema = z.object({
  sku:         z.string({ invalid_type_error: 'El SKU debe ser texto' })
                .min(1, 'El SKU es requerido')
                .max(100),
  sucursal_id: z.string({ invalid_type_error: 'La sucursal debe ser texto' })
                .min(1, 'El nombre o ID de sucursal es requerido'),
  cantidad:    num('La cantidad debe ser un número').min(0, 'La cantidad no puede ser negativa'),
})

export const SupplierRowSchema = z.object({
  nombre:       z.string({ invalid_type_error: 'El nombre debe ser texto' })
                 .min(1, 'El nombre es requerido')
                 .max(255),
  contacto:     z.string().max(255).optional(),
  email:        z.string().email('El email no es válido').optional().or(z.literal('')),
  telefono:     z.string().max(20).optional(),
  nit:          z.string({ invalid_type_error: 'El NIT debe ser texto' })
                 .min(1, 'El NIT es requerido')
                 .max(50),
  dias_credito: num('Los días de crédito deben ser un número').int('Los días de crédito deben ser un número entero').positive('Los días de crédito deben ser positivos'),
  ciudad:       z.string().max(100).optional(),
  notas:        z.string().optional(),
})

export const ClientRowSchema = z.object({
  nombre:   z.string({ invalid_type_error: 'El nombre debe ser texto' })
             .min(1, 'El nombre es requerido')
             .max(255),
  email:    z.string().email('El email no es válido').optional().or(z.literal('')),
  telefono: z.string().max(20).optional(),
  whatsapp: z.string().max(50).optional(),
  empresa:  z.string().max(255).optional(),
  nit:      z.string().max(50).optional(),
  ciudad:   z.string().max(100).optional(),
  origen:   z.enum(['whatsapp', 'email', 'manual', 'referido'], {
    errorMap: () => ({ message: 'El origen debe ser whatsapp, email, manual o referido' }),
  }).optional().or(z.literal('')),
})

export const AppointmentRowSchema = z.object({
  nombre_cliente:   z.string({ invalid_type_error: 'El nombre del cliente debe ser texto' })
                     .min(1, 'El nombre del cliente es requerido')
                     .max(255),
  telefono_cliente: z.string().max(20).optional(),
  servicio_id:      z.string({ invalid_type_error: 'El ID del servicio debe ser texto' })
                     .min(1, 'El ID del servicio es requerido'),
  sucursal_id:      z.string({ invalid_type_error: 'La sucursal debe ser texto' })
                     .min(1, 'El nombre o ID de sucursal es requerido'),
  fecha_hora:       z.string({ invalid_type_error: 'La fecha debe ser texto' })
                     .min(1, 'La fecha y hora son requeridas'),
  notas:            z.string().optional(),
})

export const TransactionRowSchema = z.object({
  tipo:         z.enum(['ingreso', 'egreso'], {
    errorMap: () => ({ message: 'El tipo debe ser "ingreso" o "egreso"' }),
  }),
  monto:        num('El monto debe ser un número').positive('El monto debe ser positivo'),
  descripcion:  z.string({ invalid_type_error: 'La descripción debe ser texto' })
                 .min(1, 'La descripción es requerida')
                 .max(500),
  fecha:        z.string({ invalid_type_error: 'La fecha debe ser texto' })
                 .min(1, 'La fecha es requerida'),
  categoria_id: z.string().optional(),
  sucursal_id:  z.string().optional(),
})

export type UserRow         = z.infer<typeof UserRowSchema>
export type ProductRow      = z.infer<typeof ProductRowSchema>
export type StockRow        = z.infer<typeof StockRowSchema>
export type SupplierRow     = z.infer<typeof SupplierRowSchema>
export type ClientRow       = z.infer<typeof ClientRowSchema>
export type AppointmentRow  = z.infer<typeof AppointmentRowSchema>
export type TransactionRow  = z.infer<typeof TransactionRowSchema>

// Columnas requeridas por tipo (para verificar que el Excel tiene las cabeceras correctas)
export const REQUIRED_COLUMNS: Record<BulkUploadType, string[]> = {
  users:        ['nombre', 'email', 'rol'],
  products:     ['sku', 'nombre', 'unidad'],
  stock:        ['sku', 'sucursal_id', 'cantidad'],
  suppliers:    ['nombre', 'nit', 'dias_credito'],
  clients:      ['nombre'],
  appointments: ['nombre_cliente', 'servicio_id', 'sucursal_id', 'fecha_hora'],
  transactions: ['tipo', 'monto', 'descripcion', 'fecha'],
}
