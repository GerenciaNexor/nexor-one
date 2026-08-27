import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { sendContactRequest } from '../../lib/email'

// HU-203 — Endpoint PÚBLICO (sin auth) para el formulario de contacto de la landing.
// Envía la solicitud a gerencia@nexor-one.com (email.ts) y confirma al visitante. Rate-limit global.
const ContactSchema = z.object({
  name:    z.string({ required_error: 'El nombre es obligatorio' }).trim().min(1, 'El nombre es obligatorio').max(120, 'Nombre muy largo'),
  email:   z.string({ required_error: 'El correo es obligatorio' }).trim().email('Correo inválido').max(160, 'Correo muy largo'),
  company: z.string().trim().max(160, 'Empresa muy larga').optional(),
  phone:   z.string().trim().max(40, 'Teléfono muy largo').optional(),
  message: z.string({ required_error: 'Cuéntanos tu proyecto' }).trim().min(1, 'Cuéntanos tu proyecto').max(4000, 'Mensaje muy largo'),
  kind:    z.enum(['nexor', 'nexor_it']).optional(),
})

export default async function contactModule(app: FastifyInstance): Promise<void> {
  app.post('/', {
    schema: { tags: ['Contact'], summary: 'Enviar solicitud de contacto (landing pública)' },
  }, async (request, reply) => {
    const parsed = ContactSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    }
    await sendContactRequest(parsed.data)
    return reply.code(200).send({ success: true, message: 'Recibimos tu mensaje. Te contactaremos muy pronto.' })
  })
}
