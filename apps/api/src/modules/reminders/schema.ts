import { z } from 'zod'

export const ALERT_LEVELS = ['normal', 'urgent', 'critical'] as const
export const RECURRENCES  = ['none', 'hourly', 'daily', 'weekly', 'monthly'] as const
export const RELATED_TYPES = ['appointment', 'client', 'deal', 'purchase_order'] as const

export const CreateReminderSchema = z.object({
  title:       z.string().min(1, 'El título es requerido').max(255),
  description: z.string().max(2000).optional(),
  /** Fecha/hora ISO o datetime-local ("YYYY-MM-DDTHH:mm"). */
  remindAt:    z.string().min(1, 'La fecha y hora son requeridas'),
  alertLevel:  z.enum(ALERT_LEVELS).default('normal'),
  recurrence:  z.enum(RECURRENCES).default('none'),
  relatedType: z.enum(RELATED_TYPES).nullable().optional(),
  relatedId:   z.string().max(30).nullable().optional(),
})

export const UpdateReminderSchema = z.object({
  title:       z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  remindAt:    z.string().min(1).optional(),
  alertLevel:  z.enum(ALERT_LEVELS).optional(),
  recurrence:  z.enum(RECURRENCES).optional(),
  relatedType: z.enum(RELATED_TYPES).nullable().optional(),
  relatedId:   z.string().max(30).nullable().optional(),
  isActive:    z.boolean().optional(),
})

export type CreateReminderInput = z.infer<typeof CreateReminderSchema>
export type UpdateReminderInput = z.infer<typeof UpdateReminderSchema>
