/**
 * seed-kira-dev.ts — Datos de prueba para el módulo KIRA
 *
 * Extiende el seed base (seed.ts) con:
 *   - KIRA feature flag activado
 *   - 2 usuarios KIRA: area_manager y operative
 *   - 10 productos de farmacia con costos y stock mínimo
 *   - Stock inicial en la sucursal principal
 *
 * CREDENCIALES:
 *   admin@demo.nexor.co     / Admin123!   → TENANT_ADMIN
 *   manager@demo.nexor.co   / Admin123!   → AREA_MANAGER (KIRA)
 *   operative@demo.nexor.co / Admin123!   → OPERATIVE (KIRA)
 *
 * EJECUTAR:
 *   cd apps/api && npx tsx prisma/seed-kira-dev.ts
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const PASS   = 'Admin123!'

async function main() {
  console.log('🌱 KIRA dev seed...\n')

  // ── Leer tenant y sucursal ya creados por seed.ts ──────────────────────────
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'demo-farmacia' } })
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: 'seed-branch-demo-001' } })

  console.log(`Tenant: ${tenant.name} (${tenant.id})`)
  console.log(`Branch: ${branch.name} (${branch.id})\n`)

  // ── 1. Activar KIRA ────────────────────────────────────────────────────────
  await prisma.featureFlag.update({
    where: { tenantId_module: { tenantId: tenant.id, module: 'KIRA' } },
    data:  { enabled: true },
  })
  console.log('✅ Feature flag KIRA → activado')

  // ── 2. Usuarios KIRA ───────────────────────────────────────────────────────
  const hash = await bcrypt.hash(PASS, 12)

  const manager = await prisma.user.upsert({
    where:  { email: 'manager@demo.nexor.co' },
    update: {},
    create: {
      tenantId: tenant.id, branchId: branch.id,
      email: 'manager@demo.nexor.co', name: 'Carlos Jefe de Bodega',
      passwordHash: hash, role: 'AREA_MANAGER', module: 'KIRA',
    },
  })
  console.log(`✅ AREA_MANAGER: ${manager.email}`)

  const operative = await prisma.user.upsert({
    where:  { email: 'operative@demo.nexor.co' },
    update: {},
    create: {
      tenantId: tenant.id, branchId: branch.id,
      email: 'operative@demo.nexor.co', name: 'Ana Bodeguera',
      passwordHash: hash, role: 'OPERATIVE', module: 'KIRA',
    },
  })
  console.log(`✅ OPERATIVE:    ${operative.email}`)

  // ── 3. Productos ───────────────────────────────────────────────────────────
  const productos = [
    { sku: 'TYLENOL-500',  name: 'Acetaminofén 500mg x 20',  category: 'Analgésicos',  unit: 'caja',  salePrice: 8500,   costPrice: 5200,  minStock: 50,  maxStock: 200 },
    { sku: 'IBUPRO-400',   name: 'Ibuprofeno 400mg x 10',    category: 'Analgésicos',  unit: 'caja',  salePrice: 9800,   costPrice: 6000,  minStock: 40,  maxStock: 150 },
    { sku: 'OMEP-20',      name: 'Omeprazol 20mg x 14',      category: 'Gastro',       unit: 'caja',  salePrice: 15000,  costPrice: 9500,  minStock: 30,  maxStock: 100 },
    { sku: 'AMOX-500',     name: 'Amoxicilina 500mg x 21',   category: 'Antibióticos', unit: 'caja',  salePrice: 28000,  costPrice: 18000, minStock: 20,  maxStock: 80  },
    { sku: 'LOSARTAN-50',  name: 'Losartán 50mg x 30',       category: 'Cardio',       unit: 'caja',  salePrice: 22000,  costPrice: 14000, minStock: 60,  maxStock: 200 },
    { sku: 'METFORM-850',  name: 'Metformina 850mg x 30',    category: 'Diabetes',     unit: 'caja',  salePrice: 18500,  costPrice: 11000, minStock: 40,  maxStock: 150 },
    { sku: 'VITMCX-100',   name: 'Vitamina C 1000mg x 30',   category: 'Vitaminas',    unit: 'frasco',salePrice: 25000,  costPrice: 15000, minStock: 25,  maxStock: 100 },
    { sku: 'SUERO-500',    name: 'Suero Oral Sabor Limón',   category: 'Hidratación',  unit: 'sobre', salePrice: 2500,   costPrice: 1200,  minStock: 100, maxStock: 500 },
    { sku: 'ALCOHOL-GEL',  name: 'Gel Antibacterial 500ml',  category: 'Higiene',      unit: 'frasco',salePrice: 12000,  costPrice: 7500,  minStock: 30,  maxStock: 120 },
    { sku: 'TAPABOCAS-X3', name: 'Tapabocas Triple Capa x3', category: 'Protección',   unit: 'paquete',salePrice: 5000,  costPrice: 2800,  minStock: 50,  maxStock: 300 },
  ]

  console.log('\n📦 Creando productos...')
  const productMap = new Map<string, string>()

  for (const p of productos) {
    const existing = await prisma.product.findFirst({
      where: { tenantId: tenant.id, sku: p.sku },
      select: { id: true },
    })
    let id: string
    if (existing) {
      id = existing.id
      console.log(`   ↩ Existente: ${p.sku}`)
    } else {
      const created = await prisma.product.create({
        data: { tenantId: tenant.id, ...p },
      })
      id = created.id
      console.log(`   ✅ Creado:   ${p.sku} — ${p.name}`)
    }
    productMap.set(p.sku, id)
  }

  // ── 4. Stock inicial (algunos bajo mínimo para probar alertas) ─────────────
  const stocks: Record<string, number> = {
    'TYLENOL-500':  120,  // OK
    'IBUPRO-400':   85,   // OK
    'OMEP-20':      15,   // BAJO MÍNIMO (min=30) ← alerta
    'AMOX-500':     8,    // BAJO MÍNIMO (min=20) ← alerta
    'LOSARTAN-50':  70,   // OK
    'METFORM-850':  45,   // OK
    'VITMCX-100':   5,    // BAJO MÍNIMO (min=25) ← alerta
    'SUERO-500':    200,  // OK
    'ALCOHOL-GEL':  35,   // OK
    'TAPABOCAS-X3': 80,   // OK
  }

  console.log('\n📊 Configurando stock...')
  for (const [sku, qty] of Object.entries(stocks)) {
    const productId = productMap.get(sku)!
    await prisma.stock.upsert({
      where:  { productId_branchId: { productId, branchId: branch.id } },
      create: { productId, branchId: branch.id, quantity: qty },
      update: { quantity: qty },
    })
    const min = productos.find((p) => p.sku === sku)!.minStock
    const alert = qty < min ? ' ⚠ BAJO MÍNIMO' : ''
    console.log(`   ${sku.padEnd(14)} ${String(qty).padStart(4)} / ${min} min${alert}`)
  }

  // ── Resumen ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(55))
  console.log('🎉 KIRA dev seed completado')
  console.log('═'.repeat(55))
  console.log('  TENANT_ADMIN  admin@demo.nexor.co     / Admin123!')
  console.log('  AREA_MANAGER  manager@demo.nexor.co   / Admin123!')
  console.log('  OPERATIVE     operative@demo.nexor.co / Admin123!')
  console.log(`\n  Productos: ${productos.length}  |  3 con stock crítico`)
  console.log('═'.repeat(55))
}

main()
  .catch((e) => { console.error('❌', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
