/**
 * Script one-shot:
 *   - Borra el tenant 'demo-farmacia' (cascade → admin@demo.nexor.co)
 *   - Crea tenant 'Nexor' + sucursal principal + usuario TENANT_ADMIN
 *
 * Uso: pnpm --filter @nexor/api exec tsx --env-file=.env prisma/create-admin.ts
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] } },
})

const NEW_EMAIL = 'jeiber2001@gmail.com'
const NEW_PASSWORD = '123456'
const NEW_NAME = 'Jeiber Jimenez'
const NEW_TENANT_NAME = 'Nexor'
const NEW_TENANT_SLUG = 'nexor'

async function main(): Promise<void> {
  console.log('🧨 Limpieza inicial...\n')

  // 1. Deshabilitar admin@demo.nexor.co (no se puede borrar — FKs RESTRICT
  //    desde purchase_orders/stocks bloquean la eliminación de tenant y usuario demo).
  //    Renombramos el email para que quede claro y para evitar confusiones futuras.
  const oldDemoAdmin = await prisma.user.findUnique({ where: { email: 'admin@demo.nexor.co' } })
  if (oldDemoAdmin) {
    await prisma.user.update({
      where: { email: 'admin@demo.nexor.co' },
      data: { isActive: false, email: `disabled+${oldDemoAdmin.id}@demo.nexor.co` },
    })
    console.log(`   ✓ admin@demo.nexor.co deshabilitado (isActive=false, email renombrado)`)
  } else {
    console.log(`   ℹ admin@demo.nexor.co no existía`)
  }

  // 2. Si el usuario destino ya existe, lo reseteamos (update directo más abajo)
  const stale = await prisma.user.findUnique({ where: { email: NEW_EMAIL } })
  if (stale) {
    console.log(`   ℹ ${NEW_EMAIL} ya existe — se actualizará in-place`)
  }

  // 3. Si el tenant 'nexor' ya existe de un intento previo SIN datos relacionados, borrarlo.
  //    Si tiene datos, dejarlo (upsert los reutiliza).
  const oldNexor = await prisma.tenant.findUnique({ where: { slug: NEW_TENANT_SLUG } })
  if (oldNexor) {
    try {
      await prisma.tenant.delete({ where: { slug: NEW_TENANT_SLUG } })
      console.log(`   ✓ Tenant '${NEW_TENANT_SLUG}' previo borrado`)
    } catch {
      console.log(`   ℹ Tenant '${NEW_TENANT_SLUG}' ya existía con datos — se reutiliza`)
    }
  }

  console.log('\n🏗  Creando estructura nueva...\n')

  // 4. Tenant nuevo (upsert por si quedó de un intento previo con datos)
  const tenant = await prisma.tenant.upsert({
    where: { slug: NEW_TENANT_SLUG },
    update: { name: NEW_TENANT_NAME },
    create: {
      name: NEW_TENANT_NAME,
      slug: NEW_TENANT_SLUG,
      timezone: 'America/Bogota',
      currency: 'COP',
    },
  })
  console.log(`   ✓ Tenant:   ${tenant.name}  (${tenant.id})`)

  // 5. Sucursal principal (reusa la primera si existe)
  const existingBranch = await prisma.branch.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'asc' },
  })
  const branch = existingBranch ?? await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      name: 'Sede Principal',
      city: 'Bogotá',
    },
  })
  console.log(`   ✓ Sucursal: ${branch.name}  (${branch.id})`)

  // 6. Usuario admin (upsert: si ya existía, lo reactivamos y reseteamos password)
  const passwordHash = await bcrypt.hash(NEW_PASSWORD, 12)
  const user = await prisma.user.upsert({
    where: { email: NEW_EMAIL },
    update: {
      tenantId: tenant.id,
      branchId: branch.id,
      name: NEW_NAME,
      passwordHash,
      role: 'TENANT_ADMIN',
      isActive: true,
    },
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: NEW_EMAIL,
      name: NEW_NAME,
      passwordHash,
      role: 'TENANT_ADMIN',
    },
  })
  console.log(`   ✓ Usuario:  ${user.email}  (${user.role})`)

  console.log('\n✅ Listo. Credenciales:')
  console.log(`   Email:      ${NEW_EMAIL}`)
  console.log(`   Contraseña: ${NEW_PASSWORD}\n`)
}

main()
  .catch((err) => {
    console.error('\n❌ Error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
