import fp from 'fastify-plugin'
import fastifyRateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'

/**
 * Rate limiting global.
 * La clave se construye por tenant (no por IP) para que un tenant no afecte
 * la disponibilidad del servicio para los demas.
 * Si el request aun no esta autenticado (ej: /v1/auth/login) se usa la IP como fallback.
 */
// En E2E (NODE_ENV=test) todos los tests comparten el mismo tenant y acumulan muchas
// llamadas por minuto; un límite de 100 los hace flaky (p. ej. la suite multi-tenant corre
// tras los tests de UI sin respiro). Se eleva en test — mismo criterio que el login
// (auth/routes.ts usa test ? 200 : 10). En prod manda RATE_LIMIT_MAX (default 100).
const DEFAULT_MAX = process.env['NODE_ENV'] === 'test' ? 2000 : 100

const rateLimitPlugin = fp(async (app: FastifyInstance) => {
  await app.register(fastifyRateLimit, {
    max: Number(process.env['RATE_LIMIT_MAX'] ?? DEFAULT_MAX),
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
