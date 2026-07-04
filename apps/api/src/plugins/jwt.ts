import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Role } from '@nexor/shared'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // Dos identidades (HU-134):
    //  · Token de CLIENTE  → { userId, tenantId, branchId, role, module? }
    //  · Token de PLATAFORMA → { platformAdminId, role: 'SUPER_ADMIN' }  (SIN tenantId)
    //  · Token de IMPERSONACIÓN → { platformAdminId, tenantId, role: 'TENANT_ADMIN', imp: true }
    // userId/tenantId son opcionales a nivel de tipo porque el token de plataforma no
    // los lleva; el tenantHook garantiza que existan en el camino de tenant.
    payload: {
      userId?: string
      tenantId?: string
      branchId?: string | null
      role: Role
      module?: string
      platformAdminId?: string
      imp?: boolean
    }
    user: {
      userId: string
      tenantId: string
      branchId: string | null
      role: Role
      module?: string
      platformAdminId?: string
      imp?: boolean
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
