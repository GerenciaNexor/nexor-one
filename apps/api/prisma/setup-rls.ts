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

// Necesita DIRECT_DATABASE_URL (superuser) para poder usar FORCE ROW LEVEL SECURITY
const prisma = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] } },
})

/** Tablas de negocio que tienen tenant_id directo y necesitan RLS. */
const BUSINESS_TABLES = [
  'branches',
  'users',
  'feature_flags',
  'integrations',
  'agent_logs',
  'notifications',
  'clients',
  // HU-126 — calificación interna del equipo al cliente (tenant_id propio).
  'client_ratings',
  'pipeline_stages',
  'deals',
  'interactions',
  'quotes',
  'products',
  'stock_movements',
  'suppliers',
  'purchase_orders',
  // HU-125 — calificaciones de proveedor (Entrega/Calidad) con tenant_id propio.
  'supplier_ratings',
  'service_types',
  'availability',
  'appointments',
  'transactions',
  // HU-114 — bandeja y carga masiva (conversation_messages lleva RLS propia
  // por tener su propia columna tenant_id, aunque sea tabla "hija").
  'conversations',
  'conversation_messages',
  'bulk_upload_logs',
  // HU-117 — chat_messages ya recibió RLS por su migración
  // (20260411131542_chat_messages_rls_and_index); se incluye aquí para que
  // db:rls sea la fuente única de verdad y re-aplique su política tras un restore.
  'chat_messages',
  // HU-127 — rollup diario del Dashboard (tenant_id propio).
  'dashboard_daily_rollups',
] as const

async function setupRLS(): Promise<void> {
  console.log('🔒 Configurando Row-Level Security...\n')

  for (const table of BUSINESS_TABLES) {
    // Habilitar RLS y forzarlo incluso para el owner de la tabla
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`)

    // Eliminar politica anterior si existe (permite re-ejecutar el script de forma idempotente)
    await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS tenant_isolation ON "${table}"`)

    // Crear politica con USING (lectura) + WITH CHECK (escritura).
    // NULLIF(..., '') devuelve NULL cuando la variable no esta definida,
    // lo que hace que la comparacion falle de forma segura (fail-safe: sin contexto = sin filas).
    await prisma.$executeRawUnsafe(`
      CREATE POLICY tenant_isolation ON "${table}"
        USING     (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
        WITH CHECK (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
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
