import { z } from 'zod'

// ─── Etapas ───────────────────────────────────────────────────────────────────

export const CreateStageSchema = z.object({
  name:        z.string().min(1, 'El nombre es requerido').max(100),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hex inválido (ej: #10b981)').optional(),
  isFinalWon:  z.boolean().default(false),
  isFinalLost: z.boolean().default(false),
})

export const UpdateStageSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  isFinalWon:  z.boolean().optional(),
  isFinalLost: z.boolean().optional(),
  order:       z.number().int().positive().optional(),
})

export const ReorderStagesSchema = z.object({
  stages: z.array(
    z.object({
      id:    z.string().min(1),
      order: z.number().int().positive(),
    }),
  ).min(1, 'Se requiere al menos una etapa'),
})

// ─── Deals ────────────────────────────────────────────────────────────────────

export const CreateDealSchema = z.object({
  clientId:      z.string().min(1, 'El cliente es requerido'),
  stageId:       z.string().min(1, 'La etapa es requerida'),
  title:         z.string().min(1, 'El título es requerido').max(255),
  assignedTo:    z.string().optional(),
  branchId:      z.string().optional(),
  value:         z.number().min(0, 'El valor no puede ser negativo').optional(),
  probability:   z.number().int().min(0).max(100).optional(),
  /** Fecha ISO YYYY-MM-DD */
  expectedClose: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
})

export const MoveDealSchema = z.object({
  stageId:    z.string().min(1, 'La etapa es requerida'),
  lostReason: z.string().optional(),
})

export const DealQuerySchema = z.object({
  stageId:    z.string().optional(),
  assignedTo: z.string().optional(),
  clientId:   z.string().optional(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateStageInput    = z.infer<typeof CreateStageSchema>
export type UpdateStageInput    = z.infer<typeof UpdateStageSchema>
export type ReorderStagesInput  = z.infer<typeof ReorderStagesSchema>
export type CreateDealInput     = z.infer<typeof CreateDealSchema>
export type MoveDealInput       = z.infer<typeof MoveDealSchema>
export type DealQuery           = z.infer<typeof DealQuerySchema>
