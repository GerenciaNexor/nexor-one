/**
 * Rutas PÚBLICAS de autenticación de plataforma (HU-134).
 * Se registran FUERA del scope de tenant (como /v1/auth): no pasan por el
 * tenantHook ni por la transacción por-request, y emiten un JWT SIN tenantId.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { loginPlatformAdmin } from './service'
import { stdErrors } from '../../lib/openapi'

const LoginSchema = z.object({
  email:    z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})

export async function platformRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /v1/platform/auth/login
   * Login del equipo NEXOR. Emite un JWT de plataforma (sin tenantId).
   */
  app.post('/auth/login', {
    schema: {
      tags:        ['Platform'],
      summary:     'Login del equipo NEXOR (plataforma)',
      description: 'Autentica un platform_admin (tabla separada, sin tenant) y emite un JWT SIN tenantId.',
      response:    { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
  }, async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }

    try {
      const admin = await loginPlatformAdmin(parsed.data.email, parsed.data.password)

      // JWT de plataforma: SIN tenantId, SIN userId. Solo platformAdminId + rol.
      const token = app.jwt.sign({ platformAdminId: admin.id, role: 'SUPER_ADMIN' as const })

      return reply.code(200).send({
        token,
        admin: { id: admin.id, email: admin.email, name: admin.name },
      })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({
        error: e.message ?? 'Error interno del servidor',
        code:  e.code ?? 'INTERNAL_ERROR',
      })
    }
  })
}
