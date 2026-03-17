/**
 * setup-rls.ts
 * Habilita Row-Level Security en todas las tablas de negocio de NEXOR.
 *
 * CUANDO EJECUTAR:
 *   Despues de cada `prisma migrate dev` o `prisma migrate deploy`.
 *   Script: pnpm --filter @nexor/api db:setup
 *
 * COMO FUNCIONA:
 *   Cada tabla con tenant_id recibe una politica que filtra filas donde
 *   tenant_id = current_setting('app.current_tenant_id').
 *   El middleware de Fastify inyecta ese valor antes de cada query.
 *
 * NOTA DESARROLLO LOCAL:
 *   PostgreSQL superusuarios (postgres) bypasean RLS por defecto.
 *   Las migraciones y el seed pueden correr como superusuario sin problema.
 *   En produccion, la app debe conectarse con un usuario no-superusuario.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/** Tablas de negocio que tienen tenant_id directo y necesitan RLS. */
const BUSINESS_TABLES = [
  'branches',
  'users',
  'feature_flags',
  'integrations',
  'agent_logs',
  'notifications',
  'clients',
  'pipeline_stages',
  'deals',
  'interactions',
  'quotes',
  'products',
  'stock_movements',
  'suppliers',
  'purchase_orders',
  'service_types',
  'availability',
  'appointments',
  'transactions',
] as const

async function setupRLS(): Promise<void> {
  console.log('🔒 Configurando Row-Level Security...\n')

  for (const table of BUSINESS_TABLES) {
    // Habilitar RLS en la tabla
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`
    )

    // Eliminar politica anterior si existe (para poder re-ejecutar el script)
    await prisma.$executeRawUnsafe(
      `DROP POLICY IF EXISTS tenant_isolation ON "${table}"`
    )

    // Crear politica de aislamiento por tenant
    // current_setting con segundo argumento 'true' devuelve NULL en vez de error
    // cuando la variable no esta definida (ej: en migraciones como superusuario)
    await prisma.$executeRawUnsafe(`
      CREATE POLICY tenant_isolation ON "${table}"
        AS PERMISSIVE
        FOR ALL
        TO PUBLIC
        USING (tenant_id = current_setting('app.current_tenant_id', true))
    `)

    console.log(`  ✅ ${table}`)
  }

  console.log(`\n✅ RLS configurado en ${BUSINESS_TABLES.length} tablas`)
  console.log(
    '   La variable app.current_tenant_id debe inyectarse en cada request desde el middleware de Fastify.'
  )
}

setupRLS()
  .catch((e) => {
    console.error('\n❌ Error configurando RLS:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
