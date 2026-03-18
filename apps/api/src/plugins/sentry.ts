import * as Sentry from '@sentry/node'
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'

/**
 * Inicializa Sentry para captura de errores en produccion.
 * En desarrollo (NODE_ENV != 'production') Sentry queda deshabilitado
 * y ningun evento se envia al servidor remoto.
 *
 * Contexto por request:
 *   - user.id  → userId del JWT
 *   - user.data.tenantId → tenant del request
 *
 * Datos sensibles eliminados via beforeSend:
 *   - password, passwordHash, token*, refreshToken, authorization
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'tokenEncrypted',
  'token_encrypted',
  'refreshToken',
  'refresh_token',
  'authorization',
  'cookie',
])

function scrub(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map((v) => scrub(v, depth + 1))
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    clean[key] = SENSITIVE_KEYS.has(key) ? '[Filtered]' : scrub(value, depth + 1)
  }
  return clean
}

export function initSentry(): void {
  Sentry.init({
    dsn: process.env['SENTRY_DSN'],
    enabled: process.env['NODE_ENV'] === 'production' && Boolean(process.env['SENTRY_DSN']),
    environment: process.env['NODE_ENV'] ?? 'development',
    tracesSampleRate: 0.1,

    beforeSend(event) {
      // Limpiar datos sensibles del request capturado
      if (event.request?.data) {
        event.request.data = scrub(event.request.data) as typeof event.request.data
      }
      if (event.request?.headers) {
        const headers = { ...event.request.headers }
        delete headers['authorization']
        delete headers['cookie']
        event.request.headers = headers
      }
      return event
    },
  })
}

/**
 * Plugin de Fastify que adjunta tenant_id y user_id al scope de Sentry
 * en cada request autenticado, y captura errores no controlados.
 */
export default fp(async function sentryPlugin(app: FastifyInstance) {
  // Adjuntar contexto de usuario/tenant tras autenticacion
  app.addHook('onRequest', async (request) => {
    Sentry.withScope((scope) => {
      // request.user puede no existir en rutas publicas
      const user = request.user as
        | { userId?: string; tenantId?: string }
        | undefined

      if (user?.userId) {
        scope.setUser({ id: user.userId })
      }
      if (user?.tenantId) {
        scope.setTag('tenant_id', user.tenantId)
      }
    })
  })

  // Capturar errores no controlados que llegan al handler de errores de Fastify
  app.addHook('onError', async (request, _reply, error) => {
    // No reportar errores operacionales esperados (4xx)
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500
    if (statusCode < 500) return

    Sentry.withScope((scope) => {
      const user = request.user as
        | { userId?: string; tenantId?: string }
        | undefined

      if (user?.userId) scope.setUser({ id: user.userId })
      if (user?.tenantId) scope.setTag('tenant_id', user.tenantId)

      scope.setTag('method', request.method)
      scope.setTag('url', request.url)

      Sentry.captureException(error)
    })
  })
})
