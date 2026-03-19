/**
 * seed.ts — Datos de prueba para desarrollo local
 *
 * Crea:
 *   - 1 tenant de ejemplo (Farmacia Demo S.A.S.)
 *   - 1 sucursal (Sede Principal)
 *   - 1 usuario administrador con credenciales conocidas
 *   - Feature flags para los 5 modulos (desactivados por defecto)
 *   - Etapas del pipeline de ventas (ARI)
 *
 * CREDENCIALES DEL USUARIO DE PRUEBA:
 *   Email:      admin@demo.nexor.co
 *   Contrasena: Admin123!
 *
 * COMO EJECUTAR:
 *   pnpm --filter @nexor/api db:seed
 *   (o como parte de: pnpm --filter @nexor/api db:setup)
 *
 * NOTA: Es seguro ejecutar este script varias veces — usa upsert.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

// Los seeds se ejecutan como superuser (DIRECT_DATABASE_URL) para bypass RLS.
// Si DIRECT_DATABASE_URL no está definida, cae al DATABASE_URL (dev sin RLS activo).
const prisma = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] } },
})

async function main(): Promise<void> {
  console.log('🌱 Iniciando seed de datos de prueba...\n')

  // ---------------------------------------------------------------------------
  // 1. Tenant
  // ---------------------------------------------------------------------------
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-farmacia' },
    update: {},
    create: {
      name: 'Farmacia Demo S.A.S.',
      slug: 'demo-farmacia',
      legalName: 'Farmacia Demo Sociedad por Acciones Simplificada',
      taxId: '900123456-7',
      timezone: 'America/Bogota',
      currency: 'COP',
    },
  })
  console.log(`✅ Tenant:    ${tenant.name}`)
  console.log(`   ID:        ${tenant.id}`)
  console.log(`   Slug:      ${tenant.slug}\n`)

  // ---------------------------------------------------------------------------
  // 2. Sucursal principal
  // ---------------------------------------------------------------------------
  const branch = await prisma.branch.upsert({
    where: { id: 'seed-branch-demo-001' },
    update: {},
    create: {
      id: 'seed-branch-demo-001',
      tenantId: tenant.id,
      name: 'Sede Principal',
      city: 'Bogotá',
      address: 'Calle 100 # 15-23, Bogotá D.C.',
      phone: '+57 1 234 5678',
    },
  })
  console.log(`✅ Sucursal:  ${branch.name} — ${branch.city}`)
  console.log(`   ID:        ${branch.id}\n`)

  // ---------------------------------------------------------------------------
  // 3. Usuario administrador
  // ---------------------------------------------------------------------------
  const DEMO_PASSWORD = 'Admin123!'
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.nexor.co' },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'admin@demo.nexor.co',
      name: 'Administrador Demo',
      passwordHash,
      role: 'TENANT_ADMIN',
    },
  })
  console.log(`✅ Usuario:   ${admin.name}`)
  console.log(`   Email:     ${admin.email}`)
  console.log(`   Rol:       ${admin.role}`)
  console.log(`   Contrasena: ${DEMO_PASSWORD}\n`)

  // ---------------------------------------------------------------------------
  // 4. Feature flags (uno por modulo, desactivados por defecto)
  // ---------------------------------------------------------------------------
  const modules = ['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'] as const

  for (const module of modules) {
    await prisma.featureFlag.upsert({
      where: { tenantId_module: { tenantId: tenant.id, module } },
      update: {},
      create: {
        tenantId: tenant.id,
        module,
        enabled: false,
      },
    })
  }
  console.log(`✅ Feature flags: ${modules.length} modulos creados (desactivados)`)
  console.log(`   Modulos: ${modules.join(', ')}\n`)

  // ---------------------------------------------------------------------------
  // 5. Etapas del pipeline de ventas (ARI)
  // ---------------------------------------------------------------------------
  const pipelineStages = [
    { name: 'Lead',        order: 1, color: '#6366f1', isFinalWon: false, isFinalLost: false },
    { name: 'Contactado',  order: 2, color: '#8b5cf6', isFinalWon: false, isFinalLost: false },
    { name: 'Negociacion', order: 3, color: '#f59e0b', isFinalWon: false, isFinalLost: false },
    { name: 'Ganado',      order: 4, color: '#10b981', isFinalWon: true,  isFinalLost: false },
    { name: 'Facturado',   order: 5, color: '#059669', isFinalWon: false, isFinalLost: false },
    { name: 'Perdido',     order: 6, color: '#ef4444', isFinalWon: false, isFinalLost: true  },
  ]

  for (const stage of pipelineStages) {
    const existing = await prisma.pipelineStage.findFirst({
      where: { tenantId: tenant.id, name: stage.name },
    })
    if (!existing) {
      await prisma.pipelineStage.create({
        data: { tenantId: tenant.id, ...stage },
      })
    }
  }
  console.log(`✅ Pipeline:  ${pipelineStages.length} etapas creadas`)
  console.log(`   Etapas: ${pipelineStages.map((s) => s.name).join(' → ')}\n`)

  // ---------------------------------------------------------------------------
  // Resumen
  // ---------------------------------------------------------------------------
  console.log('═'.repeat(55))
  console.log('🎉 Seed completado. Datos de acceso al sistema:')
  console.log('═'.repeat(55))
  console.log(`  URL API:     http://localhost:3001`)
  console.log(`  URL Web:     http://localhost:3000`)
  console.log(`  Email:       admin@demo.nexor.co`)
  console.log(`  Contrasena:  Admin123!`)
  console.log(`  Tenant slug: demo-farmacia`)
  console.log(`  Tenant ID:   ${tenant.id}`)
  console.log('═'.repeat(55))
}

main()
  .catch((e) => {
    console.error('\n❌ Error en el seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
