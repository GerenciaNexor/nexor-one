import { z } from 'zod'

// HU-198 — Proyectos: tipo (objetivo/límite), estados y umbral de aviso (solo límite).
// Mensajes SIEMPRE en español, orientados al usuario.

export const PROJECT_TYPES    = ['objetivo', 'limite'] as const
export const PROJECT_STATUSES = ['activo', 'en_curso', 'terminado', 'cancelado'] as const

const nameField = z.string({ required_error: 'El nombre es obligatorio', invalid_type_error: 'El nombre debe ser texto' })
  .trim().min(1, 'El nombre es obligatorio').max(255, 'El nombre es muy largo (máximo 255 caracteres)')
const descField = z.string({ invalid_type_error: 'La descripción debe ser texto' })
  .max(2000, 'La descripción es muy larga (máximo 2000 caracteres)').nullish()
const typeField = z.enum(PROJECT_TYPES, { required_error: 'El tipo es obligatorio', invalid_type_error: 'Tipo inválido (objetivo o límite)' })
const statusField = z.enum(PROJECT_STATUSES, { invalid_type_error: 'Estado inválido' })
const amountField = z.number({ required_error: 'La meta es obligatoria', invalid_type_error: 'La meta debe ser un número' })
  .positive('La meta debe ser mayor a 0')
const dateField = z.string({ required_error: 'La fecha es obligatoria', invalid_type_error: 'Fecha inválida' })
  .regex(/^\d{4}-\d{2}-\d{2}/, 'Fecha inválida (formato AAAA-MM-DD)')

// El umbral de aviso solo aplica al tipo "límite" y se expresa como MONTO o como %.
const alertAmount = z.number({ invalid_type_error: 'El umbral debe ser un número' }).positive('El umbral debe ser mayor a 0').nullish()
const alertPct    = z.number({ invalid_type_error: 'El umbral % debe ser un número' }).int('El umbral % debe ser entero').min(1, 'El % debe estar entre 1 y 100').max(100, 'El % debe estar entre 1 y 100').nullish()

const baseShape = {
  name:        nameField,
  description: descField,
  type:        typeField,
  targetAmount: amountField,
  alertAmount,
  alertPct,
  startDate:   dateField,
  endDate:     dateField,
  status:      statusField.default('activo'),
}

/** Reglas transversales: fin ≥ inicio; umbral coherente (solo límite, no ambos, ≤ meta). */
function refineProject<T extends {
  type?: string; targetAmount?: number; alertAmount?: number | null; alertPct?: number | null
  startDate?: string; endDate?: string
}>(schema: z.ZodType<T>): z.ZodEffects<z.ZodType<T>> {
  return schema.superRefine((d, ctx) => {
    if (d.startDate && d.endDate && d.endDate < d.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'La fecha de fin no puede ser anterior a la de inicio' })
    }
    const hasAmount = d.alertAmount != null
    const hasPct    = d.alertPct != null
    if (d.type === 'objetivo' && (hasAmount || hasPct)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['alertAmount'], message: 'El umbral de aviso solo aplica a proyectos de tipo límite' })
    }
    if (hasAmount && hasPct) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['alertPct'], message: 'Define el umbral como monto O como %, no ambos' })
    }
    if (d.type === 'limite' && hasAmount && d.targetAmount != null && d.alertAmount! > d.targetAmount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['alertAmount'], message: 'El umbral de aviso no puede superar el límite' })
    }
  })
}

export const CreateProjectSchema = refineProject(z.object(baseShape))

// En edición todo es opcional; las reglas transversales se validan sobre lo que venga.
export const UpdateProjectSchema = refineProject(
  z.object({
    name:        nameField.optional(),
    description: descField,
    type:        typeField.optional(),
    targetAmount: amountField.optional(),
    alertAmount,
    alertPct,
    startDate:   dateField.optional(),
    endDate:     dateField.optional(),
    status:      statusField.optional(),
  }),
)

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>
