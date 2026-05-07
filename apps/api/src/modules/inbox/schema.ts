import { z } from 'zod'

// ─── Query params ──────────────────────────────────────────────────────────────

export const InboxQuerySchema = z.object({
  status:  z.enum(['open', 'replied', 'resolved', 'reassigned']).optional(),
  channel: z.enum(['WHATSAPP', 'GMAIL']).optional(),
  page:    z.coerce.number().int().positive().default(1),
  limit:   z.coerce.number().int().positive().max(100).default(20),
})

export type InboxQuery = z.infer<typeof InboxQuerySchema>

// ─── Responder manualmente ─────────────────────────────────────────────────────

export const ReplySchema = z.object({
  text: z.string().trim().min(1, 'El texto de la respuesta no puede estar vacío').max(4096),
})

export type ReplyInput = z.infer<typeof ReplySchema>

// ─── Cambiar estado ────────────────────────────────────────────────────────────

export const UpdateStatusSchema = z.object({
  status: z.enum(['open', 'replied', 'resolved']),
})

export type UpdateStatusInput = z.infer<typeof UpdateStatusSchema>

// ─── Reasignar ────────────────────────────────────────────────────────────────

export const AssignSchema = z.object({
  userId: z.string().min(1, 'userId requerido'),
})

export type AssignInput = z.infer<typeof AssignSchema>
