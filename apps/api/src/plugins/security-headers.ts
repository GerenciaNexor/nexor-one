import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'

const securityHeadersPlugin = fp(async (app: FastifyInstance) => {
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'SAMEORIGIN')
    reply.header('X-XSS-Protection', '0')
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    reply.header('X-DNS-Prefetch-Control', 'off')
    if (process.env['NODE_ENV'] === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
  })
})

export default securityHeadersPlugin
