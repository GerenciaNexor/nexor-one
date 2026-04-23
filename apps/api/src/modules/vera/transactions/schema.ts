import { z } from 'zod'

export const CreateManualTransactionSchema = z.object({
  type:              z.enum(['income', 'expense'], { required_error: 'type es requerido' }),
  amount:            z.number().positive('El monto debe ser positivo'),
  date:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  description:       z.string().min(1).max(500),
  branchId:          z.string().optional(),
  categoryId:        z.string().optional(),
  costCenterId:      z.string().optional(),
  externalReference: z.string().max(255).optional(),
  currency:          z.string().length(3).default('COP'),
})

export const UpdateManualTransactionSchema = z.object({
  type:              z.enum(['income', 'expense']).optional(),
  amount:            z.number().positive('El monto debe ser positivo').optional(),
  date:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description:       z.string().min(1).max(500).optional(),
  branchId:          z.string().optional().nullable(),
  categoryId:        z.string().optional().nullable(),
  costCenterId:      z.string().optional().nullable(),
  externalReference: z.string().max(255).optional().nullable(),
  currency:          z.string().length(3).optional(),
})

export const ClassifyTransactionSchema = z.object({
  categoryId:   z.string().optional().nullable(),
  costCenterId: z.string().optional().nullable(),
}).refine((d) => d.categoryId !== undefined || d.costCenterId !== undefined, {
  message: 'Se requiere al menos categoryId o costCenterId',
})

export const ListTransactionsQuerySchema = z.object({
  branchId:     z.string().optional(),
  type:         z.enum(['income', 'expense']).optional(),
  isManual:     z.enum(['true', 'false']).optional(),
  categoryId:   z.string().optional(),
  costCenterId: z.string().optional(),
  dateFrom:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search:       z.string().max(200).optional(),
  page:         z.coerce.number().int().min(1).default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(25),
})

export type CreateManualTransactionInput = z.infer<typeof CreateManualTransactionSchema>
export type UpdateManualTransactionInput = z.infer<typeof UpdateManualTransactionSchema>
export type ClassifyTransactionInput     = z.infer<typeof ClassifyTransactionSchema>
export type ListTransactionsQuery        = z.infer<typeof ListTransactionsQuerySchema>
