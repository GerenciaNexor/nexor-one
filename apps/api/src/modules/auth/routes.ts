import type { FastifyInstance } from 'fastify'
import { LoginSchema, RefreshSchema, LogoutSchema } from './schema'
import { login, refresh, logout, getMe } from './service'
import { authenticate } from '../../plugins/jwt'
import { z2j, stdErrors } from '../../lib/openapi'
import { isIPBlocked, getBlockedUntil, recordFailedAttempt, clearFailedAttempts } from './login-limiter'

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /** POST /v1/auth/login */
  app.post('/login', {
    config: {
      rateLimit: {
        max: process.env['NODE_ENV'] === 'test' ? 200 : 10,
        timeWindow: '1 minute',
        keyGenerator: (req) => req.ip,
      },
    },
    schema: {
      tags:    ['Auth'],
      summary: 'Iniciar sesión',
      description: 'Autentica al usuario y devuelve un JWT de acceso y un refresh token.',
      security: [],  // ruta pública — sin bearer
      body: z2j(LoginSchema),
      response: {
        200: {
          type: 'object',
          properties: {
            token:        { type: 'string', description: 'JWT de acceso (exp 7d por defecto)' },
            refreshToken: { type: 'string', description: 'Token opaco para renovar el JWT' },
            user: {
              type: 'object',
              properties: {
                id:       { type: 'string' },
                email:    { type: 'string' },
                name:     { type: 'string' },
                role:     { type: 'string' },
                tenantId: { type: 'string' },
                branchId: { type: 'string', nullable: true },
              },
              additionalProperties: true,
            },
          },
        },
        ...stdErrors,
      },
    },
  }, async (request, reply) => {
    // ── Verificar bloqueo por intentos fallidos consecutivos ─────────────────
    if (isIPBlocked(request.ip)) {
      const blockedUntil = getBlockedUntil(request.ip)
      return reply.code(429).send({
        error: 'IP bloqueada temporalmente por demasiados intentos fallidos.',
        code:  'IP_BLOCKED',
        retryAfter: blockedUntil ? Math.ceil((blockedUntil - Date.now()) / 1000) : 900,
      })
    }

    const parsed = LoginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada invalidos',
        code: 'VALIDATION_ERROR',
      })
    }

    try {
      const userData = await login(parsed.data.email, parsed.data.password)

      // Credenciales correctas — limpiar contador de fallos
      clearFailedAttempts(request.ip)

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
      // Registrar intento fallido de autenticación (401 = credenciales inválidas)
      if ((e.statusCode ?? 500) === 401) {
        recordFailedAttempt(request.ip)
      }
      return reply
        .code(e.statusCode ?? 500)
        .send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /** POST /v1/auth/refresh — emite nuevo access token sin re-autenticacion */
  app.post('/refresh', {
    schema: {
      tags:    ['Auth'],
      summary: 'Renovar access token',
      description: 'Intercambia un refresh token válido por un nuevo JWT de acceso.',
      security: [],
      body: z2j(RefreshSchema),
      response: {
        200: {
          type: 'object',
          properties: { token: { type: 'string', description: 'Nuevo JWT de acceso' } },
        },
        ...stdErrors,
      },
    },
  }, async (request, reply) => {
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
  app.post('/logout', {
    schema: {
      tags:    ['Auth'],
      summary: 'Cerrar sesión',
      description: 'Invalida el refresh token. El JWT de acceso expira naturalmente.',
      body: z2j(LogoutSchema),
      response: {
        200: { type: 'object', properties: { message: { type: 'string' } } },
        ...stdErrors,
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
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
  app.get('/me', {
    schema: {
      tags:     ['Auth'],
      summary:  'Perfil del usuario autenticado',
      description: 'Devuelve los datos del usuario activo, su tenant y sucursal.',
      response: {
        200: { type: 'object', additionalProperties: true },
        ...stdErrors,
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
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
