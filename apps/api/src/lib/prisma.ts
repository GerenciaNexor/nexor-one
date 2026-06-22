import { PrismaClient } from '@prisma/client'
import type { Prisma } from '@prisma/client'
import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Plumbing multi-tenant (HU-122): el contexto de tenant viaja en la MISMA conexión
 * que las queries que protege. Cada request abre una transacción interactiva con
 * `SET LOCAL app.current_tenant_id` y guarda el cliente transaccional en un
 * AsyncLocalStorage; el cliente `prisma` exportado enruta automáticamente las
 * queries por esa transacción. Así RLS es confiable por-request incluso bajo
 * concurrencia (ya no depende del azar del pool, como con `set_config` de sesión).
 */

const globalForPrisma = globalThis as unknown as {
  basePrisma?: PrismaClient
  directPrisma?: PrismaClient
}

/** Cliente base (rol de app, sujeto a RLS). No usar directamente: usar el proxy `prisma`. */
const basePrisma: PrismaClient = globalForPrisma.basePrisma ?? new PrismaClient()

/**
 * Cliente que conecta como superuser (DIRECT_DATABASE_URL) y BYPASEA RLS.
 * Solo para usos legítimos fuera del contexto de request: auth (login/refresh/logout),
 * webhooks/worker y scripts de seed/migración.
 */
export const directPrisma: PrismaClient =
  globalForPrisma.directPrisma ??
  new PrismaClient({
    datasources: { db: { url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] } },
  })

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.basePrisma = basePrisma
  globalForPrisma.directPrisma = directPrisma
}

/** Transacción de tenant activa para la request en curso (si la hay). */
export const tenantTxStore = new AsyncLocalStorage<{ tx: Prisma.TransactionClient }>()

/**
 * `prisma` consciente del request:
 *  - Dentro de una request (hay tx en el ALS) → enruta modelos y $queryRaw/$executeRaw
 *    por la transacción del tenant (misma conexión + SET LOCAL → RLS confiable).
 *  - `$transaction(fn)` dentro de una request → REUSA la tx existente (Prisma no anida
 *    transacciones interactivas), pasando el tx actual al callback del servicio.
 *  - Fuera de una request (worker/scripts) → usa el cliente base; esos flujos deben
 *    usar `withTenantContext` o `directPrisma` según corresponda.
 */
export const prisma: PrismaClient = new Proxy(basePrisma, {
  get(target, prop, receiver) {
    const tx = tenantTxStore.getStore()?.tx

    if (prop === '$transaction') {
      if (tx) {
        return (arg: unknown) => {
          if (typeof arg === 'function') {
            return (arg as (client: Prisma.TransactionClient) => unknown)(tx)
          }
          throw new Error(
            '[prisma] $transaction(array) no soportado dentro de una request; usa la forma interactiva $transaction(fn)',
          )
        }
      }
      return Reflect.get(target, prop, receiver)
    }

    // Modelos y $queryRaw/$executeRaw existen en el tx → enrutar por la transacción.
    if (tx && Reflect.has(tx, prop)) {
      const value = (tx as Record<string | symbol, unknown>)[prop]
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(tx) : value
    }

    // Resto (lifecycle: $connect/$disconnect/$on/$extends) y fuera de request → base.
    const value = Reflect.get(target, prop, receiver)
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value
  },
}) as PrismaClient

/**
 * Ejecuta `fn` dentro de una transacción con SET LOCAL — para escrituras/lecturas FUERA
 * de una request (worker/agente, seeds). Un único mecanismo, no se duplica con el de request.
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`
    return fn(tx)
  })
}

/**
 * Abre la transacción por-request con SET LOCAL y ejecuta `fn` dentro del contexto ALS.
 * El wrapper de rutas (app.ts) la usa para envolver cada handler protegido.
 */
export async function runInTenantTransaction<T>(
  tenantId: string,
  fn: () => Promise<T>,
  options?: { timeout?: number; maxWait?: number },
): Promise<T> {
  return basePrisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`
      return tenantTxStore.run({ tx }, fn)
    },
    {
      timeout: options?.timeout ?? Number(process.env['TENANT_TX_TIMEOUT_MS'] ?? 30_000),
      maxWait: options?.maxWait ?? Number(process.env['TENANT_TX_MAXWAIT_MS'] ?? 10_000),
    },
  )
}
