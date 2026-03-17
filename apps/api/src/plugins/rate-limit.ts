import fp from 'fastify-plugin'
import fastifyRateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'

/**
 * Rate limiting global.
 * La clave se construye por tenant (no por IP) para que un tenant no afecte
 * la disponibilidad del servicio para los demas.
 * Si el request aun no esta autenticado (ej: /v1/auth/login) se usa la IP como fallback.
 */
const rateLimitPlugin = fp(async (app: FastifyInstance) => {
  await app.register(fastifyRateLimit, {
    max: Number(process.env['RATE_LIMIT_MAX'] ?? 100),
    timeWindow: '1 minute',
    keyGenerator(request) {
      const user = request.user as { tenantId?: string } | undefined
      return user?.tenantId ?? request.ip
    },
    errorResponseBuilder(_request, context) {
      return {
        error: `Demasiadas solicitudes. Limite: ${context.max} por minuto por empresa.`,
        code: 'RATE_LIMIT_EXCEEDED',
      }
    },
  })
})

export default rateLimitPlugin
