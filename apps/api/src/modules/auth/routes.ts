import type { FastifyInstance } from 'fastify'
import { LoginSchema, RefreshSchema, LogoutSchema } from './schema'
import { login, refresh, logout, getMe } from './service'
import { authenticate } from '../../plugins/jwt'

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /** POST /v1/auth/login */
  app.post('/login', async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada invalidos',
        code: 'VALIDATION_ERROR',
      })
    }

    try {
      const userData = await login(parsed.data.email, parsed.data.password)

      const token = app.jwt.sign({
        userId: userData.userId,
        tenantId: userData.tenantId,
        branchId: userData.branchId,
        role: userData.role,
        ...(userData.module ? { module: userData.module } : {}),
      })

      return reply.code(200).send({
        token,
        refreshToken: userData.refreshToken,
        user: {
          id: userData.userId,
          email: userData.email,
          name: userData.name,
          role: userData.role,
          tenantId: userData.tenantId,
          tenant: userData.tenant,
          branchId: userData.branchId,
        },
      })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply
        .code(e.statusCode ?? 500)
        .send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /** POST /v1/auth/refresh — emite nuevo access token sin re-autenticacion */
  app.post('/refresh', async (request, reply) => {
    const parsed = RefreshSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada invalidos',
        code: 'VALIDATION_ERROR',
      })
    }

    try {
      const userData = await refresh(parsed.data.refreshToken)

      const token = app.jwt.sign({
        userId: userData.userId,
        tenantId: userData.tenantId,
        branchId: userData.branchId,
        role: userData.role,
        ...(userData.module ? { module: userData.module } : {}),
      })

      return reply.code(200).send({ token })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply
        .code(e.statusCode ?? 500)
        .send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /** POST /v1/auth/logout — invalida el refresh token */
  app.post('/logout', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = LogoutSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'refreshToken es requerido',
        code: 'VALIDATION_ERROR',
      })
    }

    await logout(parsed.data.refreshToken)
    return reply.code(200).send({ message: 'Logged out successfully' })
  })

  /** GET /v1/auth/me — perfil del usuario autenticado */
  app.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const profile = await getMe(request.user.userId)
      return reply.code(200).send(profile)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply
        .code(e.statusCode ?? 500)
        .send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
