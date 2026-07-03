/**
 * HU-134 — Migra los SUPER_ADMIN existentes de `users` → `platform_admins` y los
 * retira de `users`. Idempotente. directPrisma (superuser) porque platform_admins
 * tiene RLS deny-all para nexor_app.
 *
 * DEBE correr como paso del despliegue de HU-134, DESPUÉS de `migrate deploy` + `db:rls`
 * y del despliegue del nuevo código (que ya expone /v1/platform/auth/login). Si se corre
 * antes de que el código nuevo esté vivo, el super admin no podrá autenticarse.
 *
 *   pnpm --filter @nexor/api db:migrate-superadmins
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] } },
})

async function main(): Promise<void> {
  const supers = await db.user.findMany({
    where:  { role: 'SUPER_ADMIN' },
    select: { id: true, email: true, name: true, passwordHash: true, isActive: true },
  })
  console.log(`SUPER_ADMIN encontrados en users: ${supers.length}`)

  for (const u of supers) {
    await db.platformAdmin.upsert({
      where:  { email: u.email },
      update: { name: u.name, passwordHash: u.passwordHash, isActive: u.isActive },
      create: { email: u.email, name: u.name, passwordHash: u.passwordHash, isActive: u.isActive },
    })
    console.log(`  → platform_admins ← ${u.email}`)
  }

  const del = await db.user.deleteMany({ where: { role: 'SUPER_ADMIN' } })
  console.log(`Retirados de users: ${del.count}`)
  console.log('✅ Migración de identidades de plataforma completa. users.tenant_id sigue NOT NULL.')
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => { console.error('❌', e); await db.$disconnect(); process.exit(1) })
