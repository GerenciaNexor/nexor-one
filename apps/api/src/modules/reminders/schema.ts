import { z } from 'zod'

export const ALERT_LEVELS = ['normal', 'urgent', 'critical'] as const
export const RECURRENCES  = ['none', 'hourly', 'daily', 'weekly', 'monthly'] as const
export const RELATED_TYPES = ['appointment', 'client', 'deal', 'purchase_order', 'rental'] as const

// Mensajes SIEMPRE en español y orientados al usuario (nada de errores crudos de Zod en inglés).
const titleField = z.string({ required_error: 'El título es obligatorio', invalid_type_error: 'El título debe ser texto' })
  .min(1, 'El título es obligatorio').max(255, 'El título es muy largo (máximo 255 caracteres)')
const descField = z.string({ invalid_type_error: 'La nota debe ser texto' })
  .max(2000, 'La nota es muy larga (máximo 2000 caracteres)').nullish()
const whenField = z.string({ required_error: 'La fecha y hora son obligatorias', invalid_type_error: 'Fecha y hora inválidas' })
  .min(1, 'La fecha y hora son obligatorias')
const alertField = z.enum(ALERT_LEVELS, { invalid_type_error: 'Nivel de alerta inválido' })
const recurField = z.enum(RECURRENCES, { invalid_type_error: 'Recurrencia inválida' })
const relTypeField = z.enum(RELATED_TYPES, { invalid_type_error: 'Tipo de relación inválido' }).nullish()
const relIdField = z.string({ invalid_type_error: 'Referencia inválida' }).max(30).nullish()

export const CreateReminderSchema = z.object({
  title:       titleField,
  description: descField,
  /** Fecha/hora ISO (instante absoluto) o datetime-local. */
  remindAt:    whenField,
  alertLevel:  alertField.default('normal'),
  recurrence:  recurField.default('none'),
  relatedType: relTypeField,
  relatedId:   relIdField,
})

export const UpdateReminderSchema = z.object({
  title:       titleField.optional(),
  description: descField,
  remindAt:    whenField.optional(),
  alertLevel:  alertField.optional(),
  recurrence:  recurField.optional(),
  relatedType: relTypeField,
  relatedId:   relIdField,
  isActive:    z.boolean({ invalid_type_error: 'Valor inválido' }).optional(),
})

export type CreateReminderInput = z.infer<typeof CreateReminderSchema>
export type UpdateReminderInput = z.infer<typeof UpdateReminderSchema>
