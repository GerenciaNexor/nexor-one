import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'

export default fp(async function multipartPlugin(app: FastifyInstance) {
  app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB máximo por archivo
      files:    1,
    },
  })
})
