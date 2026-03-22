import { PrismaClient } from '@prisma/client'
import type { Prisma } from '@prisma/client'

/**
 * Singleton de PrismaClient.
 * Importar desde aqui en modulos y servicios — nunca instanciar directamente.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; directPrisma?: PrismaClient }

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient()

/**
 * Cliente Prisma que conecta como superuser (DIRECT_DATABASE_URL).
 * Bypasea RLS — usar SOLO en auth (login/refresh/logout) donde aún
 * no existe contexto de tenant, o en scripts de migración/seed.
 */
export const directPrisma: PrismaClient =
  globalForPrisma.directPrisma ??
  new PrismaClient({
    datasources: {
      db: { url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] },
    },
  })

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.directPrisma = directPrisma
}

/**
 * Ejecuta fn dentro de una transaccion interactiva que primero inyecta
 * el tenant_id en la sesion de PostgreSQL mediante SET LOCAL.
 *
 * Esto garantiza que RLS filtre correctamente sin importar el connection pool,
 * porque SET LOCAL solo vive en la transaccion actual.
 *
 * Uso en servicios que necesitan aislamiento garantizado:
 *   const result = await withTenantContext(tenantId, async (tx) => {
 *     return tx.client.findMany({ where: { tenantId } })
 *   })
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`
    return fn(tx)
  })
}
