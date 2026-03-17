import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'

/**
 * onRequest hook para rutas protegidas bajo /v1/ (excepto /v1/auth).
 *
 * Que hace:
 * 1. Verifica la firma y vigencia del JWT Bearer
 * 2. Valida que el payload contenga tenantId
 * 3. Consulta la DB y verifica que el tenant este activo
 * 4. Inyecta app.current_tenant_id en la sesion de PostgreSQL para que RLS filtre automaticamente
 *
 * Nivel de aislamiento:
 * - Capa 1 (aplicacion): request.user.tenantId disponible en todos los handlers
 * - Capa 2 (base de datos): RLS con current_setting('app.current_tenant_id') filtra filas automaticamente
 */
export async function tenantHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // 1. Verificar JWT
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'Token invalido o expirado', code: 'UNAUTHORIZED' })
  }

  const { tenantId } = request.user

  // 2. Validar que el payload contenga tenantId (garantia critica de multi-tenancy)
  if (!tenantId) {
    return reply.code(401).send({
      error: 'Token invalido: falta el identificador de empresa',
      code: 'INVALID_TOKEN',
    })
  }

  // 3. Verificar que el tenant exista y este activo
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { isActive: true },
  })

  if (!tenant) {
    return reply.code(401).send({ error: 'Token invalido o expirado', code: 'UNAUTHORIZED' })
  }

  if (!tenant.isActive) {
    return reply.code(403).send({
      error: 'Empresa desactivada. Contacta al soporte de NEXOR.',
      code: 'TENANT_DISABLED',
    })
  }

  // 4. Inyectar tenant_id en la sesion de PostgreSQL para activar RLS.
  // set_config(name, value, is_local=false) establece el parametro a nivel de sesion.
  // Como cada request autentica y sobreescribe el valor antes de cualquier query,
  // la sesion de la conexion siempre tendra el tenant correcto.
  await prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`
}
