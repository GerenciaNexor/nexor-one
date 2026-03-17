import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Role } from '@nexor/shared'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string
      tenantId: string
      branchId: string | null
      role: Role
      module?: string
    }
    user: {
      userId: string
      tenantId: string
      branchId: string | null
      role: Role
      module?: string
    }
  }
}

const jwtPlugin = fp(async (app: FastifyInstance) => {
  const secret = process.env['JWT_SECRET']
  if (!secret) throw new Error('JWT_SECRET no esta configurado en las variables de entorno')

  await app.register(fastifyJwt, {
    secret,
    sign: { expiresIn: process.env['JWT_EXPIRES_IN'] ?? '7d' },
  })
})

/**
 * preHandler que valida el Bearer token y carga el payload en request.user.
 * Usar en rutas protegidas: `{ preHandler: [authenticate] }`
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Token invalido o expirado', code: 'UNAUTHORIZED' })
  }
}

export default jwtPlugin
