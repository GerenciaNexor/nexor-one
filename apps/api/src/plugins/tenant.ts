import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma, directPrisma } from '../lib/prisma'
import { isPlatformAdminActive } from '../modules/platform/service'

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

  const { tenantId, platformAdminId } = request.user

  // 2a. HU-134 — un token de PLATAFORMA (platformAdminId sin tenantId) NO puede
  // acceder a recursos de tenant. La identidad de plataforma opera solo en /v1/platform
  // y /v1/admin; el acceso a datos de una empresa es exclusivamente vía impersonación
  // (que sí lleva tenantId). Aislamiento por diseño, no por menús ocultos.
  if (platformAdminId && !tenantId) {
    return reply.code(403).send({
      error: 'Identidad de plataforma: sin acceso directo a recursos de una empresa. Usa la impersonación.',
      code:  'PLATFORM_IDENTITY_FORBIDDEN',
    })
  }

  // 2b. Validar que el payload contenga tenantId (garantia critica de multi-tenancy)
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

  // 3b. Verificar que la identidad activa este habilitada.
  // directPrisma: a este punto el set_config de RLS aun no se ejecuto — en conexiones
  // recicladas del pool, un RLS residual del tenant anterior descartaria la fila.
  if (platformAdminId) {
    // HU-134 — token de IMPERSONACIÓN (platformAdminId + tenantId): el "usuario" es el
    // operador de plataforma, que NO vive en `users`. Verificar contra platform_admins.
    if (!(await isPlatformAdminActive(platformAdminId))) {
      return reply.code(403).send({
        error: 'Cuenta de plataforma desactivada.',
        code:  'ACCOUNT_DISABLED',
      })
    }
  } else {
    const { userId } = request.user
    const activeUser = await directPrisma.user.findUnique({
      where:  { id: userId },
      select: { isActive: true },
    })
    if (!activeUser || !activeUser.isActive) {
      return reply.code(403).send({
        error: 'Cuenta desactivada. Contacta al administrador.',
        code: 'ACCOUNT_DISABLED',
      })
    }
  }

  // 4. El contexto de RLS ya NO se inyecta aquí (HU-122).
  // `set_config(..., is_local=false)` sobre el pool de Prisma era inseguro: el valor
  // quedaba en una conexión y las queries siguientes podían tomar otra (RLS las vaciaba)
  // o reusar una con el tenant de otra request (fuga cross-tenant). Ahora cada handler
  // protegido corre dentro de una transacción con `SET LOCAL` (ver el wrapper onRoute en
  // app.ts → runInTenantTransaction), garantizando que contexto y queries comparten conexión.
}
