import { z } from 'zod'

const ChannelCfg = z.object({
  enabled:  z.boolean(),
  respond:  z.boolean(),   // true = responde al cliente; false = solo lee y notifica al negocio
  schedule: z.boolean(),   // true = puede agendar citas (HU-195)
})

export const AgentBehaviorSchema = z.object({
  whatsapp: ChannelCfg,
  gmail:    ChannelCfg,
  hours:    z.object({
    mode:  z.enum(['24_7', 'business']),
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inicio HH:mm').optional(),
    end:   z.string().regex(/^\d{2}:\d{2}$/, 'Hora fin HH:mm').optional(),
  }).superRefine((h, ctx) => {
    if (h.mode === 'business' && (!h.start || !h.end)) {
      ctx.addIssue({ code: 'custom', path: ['start'], message: 'Indica el horario de inicio y fin para el modo laboral' })
    }
  }),
})

/** `branchIds: null` → default del tenant; lista → esas sucursales (una, varias o todas). */
export const SaveAgentSettingsSchema = z.object({
  branchIds: z.array(z.string().min(1)).nullable(),
  settings:  AgentBehaviorSchema,
})

export type SaveAgentSettingsInput = z.infer<typeof SaveAgentSettingsSchema>
