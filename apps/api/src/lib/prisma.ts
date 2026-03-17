import { PrismaClient } from '@prisma/client'
import type { Prisma } from '@prisma/client'

/**
 * Singleton de PrismaClient.
 * Importar desde aqui en modulos y servicios — nunca instanciar directamente.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient()

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma
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
