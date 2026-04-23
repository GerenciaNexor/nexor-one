/**
 * seed-e2e.ts — Datos exclusivos para tests E2E
 *
 * Ejecutar DESPUÉS de seed.ts:
 *   pnpm --filter @nexor/api db:seed-e2e
 *
 * Crea:
 *   - Habilita los 5 módulos para el tenant demo (admin@demo.nexor.co)
 *   - Crea un segundo tenant "Empresa Test B" para pruebas de aislamiento multi-tenant
 *   - Credenciales tenant B: admin@empresa-b.nexor.co / AdminB456!
 *
 * Es idempotente — seguro ejecutar varias veces.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] } },
})

const MODULES = ['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'] as const

const VERA_CATEGORIES = [
  { name: 'Ventas',            type: 'income',  color: '#10b981' },
  { name: 'Servicios',         type: 'income',  color: '#3b82f6' },
  { name: 'Compras',           type: 'expense', color: '#ef4444' },
  { name: 'Gastos operativos', type: 'expense', color: '#f59e0b' },
  { name: 'Otros',             type: 'both',    color: '#94a3b8' },
] as const

async function enableModules(tenantId: string, label: string) {
  for (const module of MODULES) {
    await prisma.featureFlag.upsert({
      where:  { tenantId_module: { tenantId, module } },
      update: { enabled: true },
      create: { tenantId, module, enabled: true },
    })
  }
  console.log(`✅ Módulos habilitados para: ${label}`)
}

async function seedVeraCategories(tenantId: string) {
  await prisma.transactionCategory.createMany({
    data: VERA_CATEGORIES.map((c) => ({ ...c, tenantId, isDefault: true })),
    skipDuplicates: true,
  })
}

async function main(): Promise<void> {
  console.log('🌱 Seed E2E iniciado...\n')

  // ── 1. Habilitar módulos del tenant demo ──────────────────────────────────
  const demo = await prisma.tenant.findUnique({ where: { slug: 'demo-farmacia' } })
  if (!demo) {
    console.error('❌ Tenant demo no encontrado. Ejecuta primero: pnpm --filter @nexor/api db:seed')
    process.exit(1)
  }
  await enableModules(demo.id, 'demo-farmacia')
  await seedVeraCategories(demo.id)
  console.log(`   Categorías VERA aseguradas para tenant demo`)

  // ── 2. Tenant B (aislamiento multi-tenant) ────────────────────────────────
  const tenantB = await prisma.tenant.upsert({
    where:  { slug: 'test-empresa-b' },
    update: {},
    create: {
      name:      'Empresa Test B',
      slug:      'test-empresa-b',
      legalName: 'Empresa Test B S.A.S.',
      taxId:     '900000099-1',
      timezone:  'America/Bogota',
      currency:  'COP',
    },
  })
  console.log(`\n✅ Tenant B:  ${tenantB.name}`)
  console.log(`   ID:        ${tenantB.id}`)

  const branchB = await prisma.branch.upsert({
    where:  { id: 'seed-e2e-branch-b-001' },
    update: {},
    create: {
      id:       'seed-e2e-branch-b-001',
      tenantId: tenantB.id,
      name:     'Sede Principal B',
      city:     'Medellín',
    },
  })

  const passwordHash = await bcrypt.hash('AdminB456!', 12)
  const adminB = await prisma.user.upsert({
    where:  { email: 'admin@empresa-b.nexor.co' },
    update: {},
    create: {
      tenantId:     tenantB.id,
      branchId:     branchB.id,
      email:        'admin@empresa-b.nexor.co',
      name:         'Admin Empresa B',
      passwordHash,
      role:         'TENANT_ADMIN',
    },
  })
  console.log(`✅ Admin B:   ${adminB.email} / AdminB456!`)

  await enableModules(tenantB.id, 'test-empresa-b')
  await seedVeraCategories(tenantB.id)

  // Pipeline stages para tenant B (mínimo para ARI)
  for (const stage of [
    { name: 'Lead',    order: 1, color: '#6366f1', isFinalWon: false, isFinalLost: false },
    { name: 'Ganado',  order: 4, color: '#10b981', isFinalWon: true,  isFinalLost: false },
    { name: 'Perdido', order: 6, color: '#ef4444', isFinalWon: false, isFinalLost: true  },
  ]) {
    const exists = await prisma.pipelineStage.findFirst({ where: { tenantId: tenantB.id, name: stage.name } })
    if (!exists) await prisma.pipelineStage.create({ data: { tenantId: tenantB.id, ...stage } })
  }
  console.log(`✅ Pipeline y categorías VERA creados para tenant B`)

  // ── 3. SUPER_ADMIN para tests de seguridad (HU-086) ──────────────────────
  const superHash = await bcrypt.hash('SuperAdmin123!', 12)
  await prisma.user.upsert({
    where:  { email: 'super@nexor.co' },
    update: {},
    create: {
      tenantId:     demo.id,
      branchId:     null,
      email:        'super@nexor.co',
      name:         'Super Admin Nexor',
      passwordHash: superHash,
      role:         'SUPER_ADMIN',
    },
  })
  console.log(`\n✅ Super Admin: super@nexor.co / SuperAdmin123!`)

  // ── 4. AGENDA seed para demo tenant — service type + disponibilidad ───────
  // La suite HU-086 crea citas en beforeAll; necesita un service type
  // y bloques de disponibilidad para que la validación del slot pase.
  await prisma.serviceType.upsert({
    where:  { id: 'seed-e2e-svc-001' },
    update: {},
    create: {
      id:              'seed-e2e-svc-001',
      tenantId:        demo.id,
      name:            'Consulta E2E',
      durationMinutes: 30,
      isActive:        true,
    },
  })

  const BRANCH_DEMO = 'seed-branch-demo-001'
  for (let d = 0; d <= 6; d++) {
    await prisma.availability.upsert({
      where:  { id: `seed-e2e-avail-${d}` },
      update: {},
      create: {
        id:        `seed-e2e-avail-${d}`,
        tenantId:  demo.id,
        branchId:  BRANCH_DEMO,
        userId:    null,
        dayOfWeek: d,
        startTime: new Date('1970-01-01T08:00:00.000Z'),
        endTime:   new Date('1970-01-01T20:00:00.000Z'),
        isActive:  true,
      },
    })
  }
  console.log(`✅ AGENDA: service type + disponibilidad (lun-dom 08-20) para demo`)

  // ── Resumen ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(55))
  console.log('🎉 Seed E2E completado.')
  console.log('═'.repeat(55))
  console.log(`  Tenant A:   admin@demo.nexor.co    / Admin123!`)
  console.log(`  Tenant B:   admin@empresa-b.nexor.co / AdminB456!`)
  console.log(`  Super Admin: super@nexor.co         / SuperAdmin123!`)
  console.log('═'.repeat(55))
}

main()
  .catch((e) => { console.error('\n❌ Error en seed E2E:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
