/**
 * seed-staging.ts — Datos representativos para load testing (HU-092)
 *
 * Crea 15 tenants de prueba, cada uno con:
 *   - 1 usuario TENANT_ADMIN
 *   - 1 sucursal
 *   - 5 feature flags activos (todos los módulos)
 *   - 5 categorías de transacción VERA (default)
 *   - 5 etapas de pipeline ARI
 *   - 1.000 productos KIRA con stock inicial
 *   - 500 clientes ARI
 *   - 200 deals ARI
 *   - 200 transacciones VERA
 *
 * CREDENCIALES DE LOS USUARIOS DE PRUEBA:
 *   Email:      admin01@load-test.nexor.co … admin15@load-test.nexor.co
 *   Contraseña: LoadTest2024!
 *
 * CÓMO EJECUTAR:
 *   pnpm --filter @nexor/api db:seed:staging
 *
 * NOTA: El script es idempotente — puede ejecutarse varias veces sin duplicar datos.
 *       Los tenants se identifican por su slug `load-test-XX`.
 *       Si ya existen productos/clientes/transacciones se omite la creación.
 *
 * ADVERTENCIA: Solo ejecutar contra el ambiente de STAGING, nunca producción.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] } },
})

const TENANTS        = 15
const PRODUCTS_COUNT = 1_000
const CLIENTS_COUNT  = 500
const DEALS_COUNT    = 200
const TX_COUNT       = 200
const PASSWORD       = 'LoadTest2024!'

const CITIES = ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena']
const UNITS  = ['und', 'kg', 'caja', 'litro', 'par']
const MODULES: ('ARI' | 'NIRA' | 'KIRA' | 'AGENDA' | 'VERA')[] = ['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA']

const PIPELINE_STAGES = [
  { name: 'Prospecto',     color: '#94a3b8', order: 1, isFinalWon: false, isFinalLost: false },
  { name: 'Contactado',    color: '#60a5fa', order: 2, isFinalWon: false, isFinalLost: false },
  { name: 'En negociación',color: '#f59e0b', order: 3, isFinalWon: false, isFinalLost: false },
  { name: 'Ganado',        color: '#22c55e', order: 4, isFinalWon: true,  isFinalLost: false },
  { name: 'Perdido',       color: '#ef4444', order: 5, isFinalWon: false, isFinalLost: true  },
]

const VERA_CATEGORIES = [
  { name: 'Ventas',             type: 'income',  isDefault: true  },
  { name: 'Servicios',          type: 'income',  isDefault: true  },
  { name: 'Compras',            type: 'expense', isDefault: true  },
  { name: 'Gastos operativos',  type: 'expense', isDefault: true  },
  { name: 'Otros',              type: 'income',  isDefault: true  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number, len = 2): string { return String(n).padStart(len, '0') }

function randomDate(daysBack: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack))
  return d
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n🚀 Seed de staging — ${TENANTS} tenants × ${PRODUCTS_COUNT} productos + ${CLIENTS_COUNT} clientes + ${TX_COUNT} transacciones\n`)

  // Pre-hash de contraseña: lo hacemos UNA vez y reutilizamos para todos los usuarios
  const passwordHash = await bcrypt.hash(PASSWORD, 10)

  for (let t = 1; t <= TENANTS; t++) {
    const num    = pad(t)
    const slug   = `load-test-${num}`
    const email  = `admin${num}@load-test.nexor.co`
    const prefix = `LT${num}`

    // ── 1. Tenant ──────────────────────────────────────────────────────────────
    const tenant = await prisma.tenant.upsert({
      where:  { slug },
      update: {},
      create: {
        name:      `Empresa Load Test ${num}`,
        slug,
        legalName: `Empresa Load Test ${num} S.A.S.`,
        taxId:     `9001${pad(t, 5)}-${t}`,
        timezone:  'America/Bogota',
        currency:  'COP',
      },
    })

    // ── 2. Sucursal ────────────────────────────────────────────────────────────
    const branchSlugId = `branch-load-test-${num}`
    const branch = await prisma.branch.upsert({
      where:  { id: branchSlugId },
      update: {},
      create: {
        id:       branchSlugId,
        tenantId: tenant.id,
        name:     `Sede Principal LT-${num}`,
        city:     CITIES[t % CITIES.length]!,
        address:  `Calle ${t * 10} # ${t}-${t + 5}`,
        phone:    `+57 1 ${pad(t, 3)} ${pad(t * 2, 4)}`,
      },
    })

    // ── 3. Usuario TENANT_ADMIN ────────────────────────────────────────────────
    await prisma.user.upsert({
      where:  { email },
      update: {},
      create: {
        tenantId:     tenant.id,
        email,
        name:         `Admin Load Test ${num}`,
        passwordHash,
        role:         'TENANT_ADMIN',
        isActive:     true,
      },
    })

    // ── 4. Feature flags (todos activos) ──────────────────────────────────────
    for (const mod of MODULES) {
      await prisma.featureFlag.upsert({
        where:  { tenantId_module: { tenantId: tenant.id, module: mod } },
        update: { enabled: true },
        create: { tenantId: tenant.id, module: mod, enabled: true },
      })
    }

    // ── 5. Categorías de transacción VERA ──────────────────────────────────────
    for (const cat of VERA_CATEGORIES) {
      await prisma.transactionCategory.upsert({
        where:  { tenantId_name: { tenantId: tenant.id, name: cat.name } },
        update: {},
        create: { tenantId: tenant.id, ...cat, isActive: true },
      })
    }

    // ── 6. Etapas del pipeline ARI ─────────────────────────────────────────────
    let stageIds: string[] = []
    const existingStages = await prisma.pipelineStage.findMany({
      where:   { tenantId: tenant.id },
      select:  { id: true },
      orderBy: { order: 'asc' },
    })
    if (existingStages.length === 0) {
      for (const s of PIPELINE_STAGES) {
        const stage = await prisma.pipelineStage.create({
          data: { tenantId: tenant.id, ...s },
        })
        stageIds.push(stage.id)
      }
    } else {
      stageIds = existingStages.map((s) => s.id)
    }
    const firstStageId = stageIds[0]!

    // ── 7. Productos KIRA (createMany, idempotente) ────────────────────────────
    const existingProducts = await prisma.product.count({ where: { tenantId: tenant.id } })

    if (existingProducts < PRODUCTS_COUNT) {
      const toCreate = PRODUCTS_COUNT - existingProducts
      const productBatches = chunk(
        Array.from({ length: toCreate }, (_, i) => {
          const n = existingProducts + i + 1
          return {
            tenantId:    tenant.id,
            sku:         `${prefix}-P-${pad(n, 5)}`,
            name:        `Producto Load Test ${prefix}-${pad(n, 5)}`,
            unit:        UNITS[n % UNITS.length]!,
            description: `Producto de prueba ${n} para load testing`,
            costPrice:   parseFloat((Math.random() * 50_000 + 1_000).toFixed(0)),
            salePrice:   parseFloat((Math.random() * 80_000 + 2_000).toFixed(0)),
            minStock:    10,
            maxStock:    500,
            category:    `Categoría ${(n % 5) + 1}`,
            isActive:    true,
          }
        }),
        500,  // batch de 500 para evitar timeouts
      )

      for (const batch of productBatches) {
        await prisma.product.createMany({ data: batch, skipDuplicates: true })
      }
    }

    // Obtener los productos del tenant para crear stock y deals
    const products = await prisma.product.findMany({
      where:  { tenantId: tenant.id },
      select: { id: true },
      take:   PRODUCTS_COUNT,
    })

    // ── 8. Stock inicial para cada producto ────────────────────────────────────
    // Upsert de stock en batch (necesita ser individual por la cláusula where compuesta)
    const existingStockCount = await prisma.stock.count({
      where: { productId: { in: products.map((p) => p.id) } },
    })

    if (existingStockCount < products.length) {
      const stockData = products.map((p) => ({
        productId: p.id,
        branchId:  branch.id,
        quantity:  Math.floor(Math.random() * 400) + 50,  // 50-450 unidades
      }))

      // Crear en chunks para evitar timeouts
      for (const batch of chunk(stockData, 500)) {
        await prisma.stock.createMany({ data: batch, skipDuplicates: true })
      }
    }

    // ── 9. Clientes ARI (createMany, idempotente) ──────────────────────────────
    const existingClients = await prisma.client.count({ where: { tenantId: tenant.id } })

    if (existingClients < CLIENTS_COUNT) {
      const toCreate = CLIENTS_COUNT - existingClients
      await prisma.client.createMany({
        data: Array.from({ length: toCreate }, (_, i) => {
          const n = existingClients + i + 1
          return {
            tenantId: tenant.id,
            name:     `Cliente Load Test ${prefix}-${pad(n, 4)}`,
            email:    `cliente${pad(n, 4)}@${slug}.nexor.co`,
            phone:    `+57 310 ${pad(n, 7)}`,
            company:  `Empresa Cliente ${n % 10 + 1} S.A.S.`,
            city:     CITIES[n % CITIES.length]!,
          }
        }),
        skipDuplicates: true,
      })
    }

    // ── 10. Deals ARI (createMany, idempotente) ────────────────────────────────
    const existingDeals = await prisma.deal.count({ where: { tenantId: tenant.id } })

    if (existingDeals < DEALS_COUNT) {
      const toCreate = DEALS_COUNT - existingDeals
      const clients  = await prisma.client.findMany({
        where:  { tenantId: tenant.id },
        select: { id: true },
        take:   CLIENTS_COUNT,
      })
      const adminUser = await prisma.user.findFirst({
        where:  { tenantId: tenant.id, role: 'TENANT_ADMIN' },
        select: { id: true },
      })

      await prisma.deal.createMany({
        data: Array.from({ length: toCreate }, (_, i) => {
          const n         = existingDeals + i + 1
          const clientIdx = n % clients.length
          return {
            tenantId:          tenant.id,
            stageId:           stageIds[n % stageIds.length]!,
            branchId:          branch.id,
            clientId:          clients[clientIdx]!.id,
            assignedTo:        adminUser?.id ?? null,
            title:             `Deal Load Test ${prefix}-${pad(n, 4)}`,
            value:             parseFloat((Math.random() * 5_000_000 + 100_000).toFixed(0)),
            currency:          'COP',
            expectedCloseDate: randomDate(90),
            status:            n % 5 === 0 ? 'closed_won' : (n % 7 === 0 ? 'closed_lost' : 'open'),
          }
        }),
        skipDuplicates: true,
      })
    }

    // ── 11. Transacciones VERA (createMany, idempotente) ──────────────────────
    const existingTx = await prisma.transaction.count({ where: { tenantId: tenant.id } })

    if (existingTx < TX_COUNT) {
      const toCreate = TX_COUNT - existingTx
      const veraCategory = await prisma.transactionCategory.findFirst({
        where: { tenantId: tenant.id, name: 'Ventas' },
      })

      await prisma.transaction.createMany({
        data: Array.from({ length: toCreate }, (_, i) => {
          const n       = existingTx + i + 1
          const isIncome = n % 3 !== 0
          return {
            tenantId:    tenant.id,
            branchId:    branch.id,
            categoryId:  veraCategory?.id ?? null,
            type:        isIncome ? 'income' : 'expense',
            amount:      parseFloat((Math.random() * 2_000_000 + 50_000).toFixed(0)),
            currency:    'COP',
            description: `Transacción Load Test ${prefix}-${pad(n, 4)}`,
            category:    isIncome ? 'Ventas' : 'Gastos operativos',
            date:        randomDate(365),
          }
        }),
        skipDuplicates: true,
      })
    }

    console.log(
      `✅ Tenant ${num}/${TENANTS}: ${tenant.name} — ` +
      `productos=${await prisma.product.count({ where: { tenantId: tenant.id } })}, ` +
      `clientes=${await prisma.client.count({ where: { tenantId: tenant.id } })}, ` +
      `transacciones=${await prisma.transaction.count({ where: { tenantId: tenant.id } })}`,
    )
  }

  console.log('\n🎉 Seed de staging completado.')
  console.log('   Credenciales: admin01@load-test.nexor.co … admin15@load-test.nexor.co')
  console.log(`   Contraseña:   ${PASSWORD}`)
  console.log('   Comando de test: k6 run packages/load-tests/scenarios/main.js\n')
}

main()
  .catch((err) => {
    console.error('❌ Error en seed-staging:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
