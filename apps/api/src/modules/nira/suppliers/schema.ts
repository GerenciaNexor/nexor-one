import { z } from 'zod'

export const CreateSupplierSchema = z.object({
  name:         z.string().min(1, 'El nombre es requerido').max(255),
  contactName:  z.string().max(255).optional(),
  email:        z.string().email('Email inválido').max(255).optional(),
  phone:        z.string().max(20).optional(),
  /** NIT o identificación fiscal — único por tenant */
  taxId:        z.string().max(50).optional(),
  address:      z.string().max(500).optional(),
  city:         z.string().max(100).optional(),
  /** Días de crédito (condiciones comerciales) */
  paymentTerms: z.number().int().min(0).optional(),
  notes:        z.string().optional(),
})

export const UpdateSupplierSchema = z.object({
  name:         z.string().min(1).max(255).optional(),
  contactName:  z.string().max(255).optional(),
  email:        z.string().email('Email inválido').max(255).optional(),
  phone:        z.string().max(20).optional(),
  taxId:        z.string().max(50).optional(),
  address:      z.string().max(500).optional(),
  city:         z.string().max(100).optional(),
  paymentTerms: z.number().int().min(0).optional(),
  notes:        z.string().optional(),
})

export const SupplierQuerySchema = z.object({
  /** Busca por nombre o NIT (taxId) */
  search: z.string().optional(),
  /** true|false — default: solo activos */
  active: z.enum(['true', 'false']).optional(),
})

export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>
export type UpdateSupplierInput = z.infer<typeof UpdateSupplierSchema>
export type SupplierQuery       = z.infer<typeof SupplierQuerySchema>
