/**
 * seed-full-demo.ts — Demo completo de dos empresas independientes
 *
 * Crea desde cero:
 *   - 2 tenants con datos realistas
 *   - 2 sucursales por empresa
 *   - 3 usuarios por empresa (TENANT_ADMIN, AREA_MANAGER, OPERATIVE)
 *   - Feature flags KIRA + NIRA activados
 *   - 12 / 10 productos con stock (algunos bajo mínimo)
 *   - 5 movimientos de inventario con historial
 *   - 4 / 3 proveedores con scores calculados
 *   - 5 órdenes de compra en distintos estados
 *   - 3 notificaciones sin leer por empresa
 *
 * CREDENCIALES  (contraseña: Demo2024!)
 *   Farmacia El Pinar S.A.S.        → admin@pinar.demo.co / manager@pinar.demo.co / bodega@pinar.demo.co
 *   Droguería Salud Total Ltda.     → admin@salud.demo.co / manager@salud.demo.co / bodega@salud.demo.co
 *
 * EJECUTAR:
 *   cd apps/api && npx tsx prisma/seed-full-demo.ts
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] } },
})

const PASS = 'Demo2024!'
const NOW  = new Date()

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface ProductDef {
  sku: string; name: string; category: string; unit: string
  salePrice: number; costPrice: number; minStock: number; maxStock: number
  abcClass?: string
}

interface SupplierDef {
  name: string; contactName: string; email: string; phone: string
  taxId: string; address: string; paymentTerms: number
  priceScore: number; deliveryScore: number; qualityScore: number
  overallScore: number; totalOrders: number; onTimeDeliveries: number
}

interface PODef {
  supplierIdx: number
  status: string
  expectedDays: number | null   // null = sin fecha
  orderNumSuffix: string
  items: Array<{ skuIdx: number; qty: number; cost: number }>
}

interface TenantConfig {
  slug: string; name: string; legalName: string; taxId: string; city: string
  adminEmail: string; managerEmail: string; operativeEmail: string
  adminName: string; managerName: string; operativeName: string
  branchOneName: string; branchTwoName: string
  branchOneAddress: string; branchTwoAddress: string
  phone1: string; phone2: string
  products: ProductDef[]
  stockQtys: Record<string, number>
  suppliers: SupplierDef[]
  poData: PODef[]
}

// ─── Función principal de seed por tenant ────────────────────────────────────

async function seedTenant(cfg: TenantConfig) {
  const hash = await bcrypt.hash(PASS, 12)

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`🏢  ${cfg.name}`)
  console.log('═'.repeat(60))

  // 1. Tenant ─────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where:  { slug: cfg.slug },
    update: {},
    create: {
      name: cfg.name, slug: cfg.slug, legalName: cfg.legalName,
      taxId: cfg.taxId, timezone: 'America/Bogota', currency: 'COP',
    },
  })
  console.log(`✅ Tenant:      ${tenant.name}  (${tenant.id})`)

  // 2. Sucursales ─────────────────────────────────────────────────────────────
  const b1Id = `seed-${cfg.slug}-b1`
  const b2Id = `seed-${cfg.slug}-b2`

  const branch1 = await prisma.branch.upsert({
    where:  { id: b1Id },
    update: {},
    create: { id: b1Id, tenantId: tenant.id, name: cfg.branchOneName, city: cfg.city, address: cfg.branchOneAddress, phone: cfg.phone1 },
  })
  const branch2 = await prisma.branch.upsert({
    where:  { id: b2Id },
    update: {},
    create: { id: b2Id, tenantId: tenant.id, name: cfg.branchTwoName, city: cfg.city, address: cfg.branchTwoAddress, phone: cfg.phone2 },
  })
  console.log(`✅ Sucursales:  ${branch1.name} | ${branch2.name}`)

  // 3. Usuarios ────────────────────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where:  { email: cfg.adminEmail },
    update: {},
    create: { tenantId: tenant.id, branchId: branch1.id, email: cfg.adminEmail, name: cfg.adminName, passwordHash: hash, role: 'TENANT_ADMIN' },
  })
  const manager = await prisma.user.upsert({
    where:  { email: cfg.managerEmail },
    update: {},
    create: { tenantId: tenant.id, branchId: branch1.id, email: cfg.managerEmail, name: cfg.managerName, passwordHash: hash, role: 'AREA_MANAGER', module: 'KIRA' },
  })
  const operative = await prisma.user.upsert({
    where:  { email: cfg.operativeEmail },
    update: {},
    create: { tenantId: tenant.id, branchId: branch2.id, email: cfg.operativeEmail, name: cfg.operativeName, passwordHash: hash, role: 'OPERATIVE', module: 'KIRA' },
  })
  console.log(`✅ Usuarios:    ${admin.name} | ${manager.name} | ${operative.name}`)

  // 4. Feature flags ──────────────────────────────────────────────────────────
  for (const module of ['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'] as const) {
    const enabled = module === 'KIRA' || module === 'NIRA'
    await prisma.featureFlag.upsert({
      where:  { tenantId_module: { tenantId: tenant.id, module } },
      update: { enabled },
      create: { tenantId: tenant.id, module, enabled },
    })
  }
  console.log(`✅ Flags:       KIRA ✓  NIRA ✓  (ARI/AGENDA/VERA desactivados)`)

  // 5. Pipeline stages ────────────────────────────────────────────────────────
  const stages = [
    { name: 'Lead',         order: 1, color: '#6366f1', isFinalWon: false, isFinalLost: false },
    { name: 'Contactado',   order: 2, color: '#8b5cf6', isFinalWon: false, isFinalLost: false },
    { name: 'Negociación',  order: 3, color: '#f59e0b', isFinalWon: false, isFinalLost: false },
    { name: 'Ganado',       order: 4, color: '#10b981', isFinalWon: true,  isFinalLost: false },
    { name: 'Facturado',    order: 5, color: '#059669', isFinalWon: false, isFinalLost: false },
    { name: 'Perdido',      order: 6, color: '#ef4444', isFinalWon: false, isFinalLost: true  },
  ]
  for (const s of stages) {
    const exists = await prisma.pipelineStage.findFirst({ where: { tenantId: tenant.id, name: s.name } })
    if (!exists) await prisma.pipelineStage.create({ data: { tenantId: tenant.id, ...s } })
  }
  console.log(`✅ Pipeline:    ${stages.length} etapas creadas`)

  // 6. Productos ───────────────────────────────────────────────────────────────
  const productMap = new Map<string, string>()   // sku → id
  for (const p of cfg.products) {
    const existing = await prisma.product.findFirst({
      where: { tenantId: tenant.id, sku: p.sku },
      select: { id: true },
    })
    if (existing) {
      productMap.set(p.sku, existing.id)
    } else {
      const created = await prisma.product.create({ data: { tenantId: tenant.id, ...p } })
      productMap.set(p.sku, created.id)
    }
  }
  console.log(`✅ Productos:   ${cfg.products.length} en catálogo`)

  // 7. Stock ───────────────────────────────────────────────────────────────────
  let belowMin = 0
  for (const [sku, qty] of Object.entries(cfg.stockQtys)) {
    const productId = productMap.get(sku)!
    await prisma.stock.upsert({
      where:  { productId_branchId: { productId, branchId: branch1.id } },
      create: { productId, branchId: branch1.id, quantity: qty },
      update: { quantity: qty },
    })
    const prod = cfg.products.find((p) => p.sku === sku)!
    if (qty < prod.minStock) belowMin++
  }
  console.log(`✅ Stock:       ${Object.keys(cfg.stockQtys).length} productos  (${belowMin} bajo mínimo ⚠)`)

  // 8. Movimientos de inventario ───────────────────────────────────────────────
  const movSkus = cfg.products.slice(0, 5).map((p) => p.sku)
  const movDefs = [
    { sku: movSkus[0], type: 'entrada', qty: 50,  qBefore: 70,  qAfter: 120, daysAgo: 14, notes: 'Compra proveedor — ingreso inicial' },
    { sku: movSkus[1], type: 'salida',  qty: 15,  qBefore: 85,  qAfter: 70,  daysAgo: 10, notes: 'Venta al mostrador' },
    { sku: movSkus[2], type: 'entrada', qty: 30,  qBefore: 20,  qAfter: 50,  daysAgo: 7,  notes: 'Reabastecimiento urgente' },
    { sku: movSkus[3], type: 'ajuste',  qty: -5,  qBefore: 25,  qAfter: 20,  daysAgo: 5,  notes: 'Ajuste por producto vencido' },
    { sku: movSkus[4], type: 'salida',  qty: 20,  qBefore: 80,  qAfter: 60,  daysAgo: 2,  notes: 'Despacho interno a sucursal' },
  ]

  let movsCreated = 0
  for (const m of movDefs) {
    const productId = productMap.get(m.sku)
    if (!productId) continue
    const exists = await prisma.stockMovement.findFirst({
      where: { tenantId: tenant.id, productId, notes: m.notes },
    })
    if (!exists) {
      await prisma.stockMovement.create({
        data: {
          tenantId:       tenant.id,
          productId,
          branchId:       branch1.id,
          userId:         m.type === 'ajuste' ? manager.id : operative.id,
          type:           m.type,
          quantity:       m.qty,
          quantityBefore: m.qBefore,
          quantityAfter:  m.qAfter,
          notes:          m.notes,
          createdAt:      addDays(NOW, -m.daysAgo),
        },
      })
      movsCreated++
    }
  }
  console.log(`✅ Movimientos: ${movsCreated} registros de inventario`)

  // 9. Proveedores + scores ────────────────────────────────────────────────────
  const supplierIds: string[] = []
  for (const s of cfg.suppliers) {
    const existing = await prisma.supplier.findFirst({
      where: { tenantId: tenant.id, name: s.name },
      select: { id: true },
    })
    if (existing) {
      supplierIds.push(existing.id)
      continue
    }
    const { priceScore, deliveryScore, qualityScore, overallScore, totalOrders, onTimeDeliveries, ...supplierData } = s
    const created = await prisma.supplier.create({ data: { tenantId: tenant.id, ...supplierData } })
    await prisma.supplierScore.upsert({
      where:  { supplierId: created.id },
      update: { priceScore, deliveryScore, qualityScore, overallScore, totalOrders, onTimeDeliveries, calculatedAt: NOW },
      create: { supplierId: created.id, priceScore, deliveryScore, qualityScore, overallScore, totalOrders, onTimeDeliveries, calculatedAt: NOW },
    })
    supplierIds.push(created.id)
  }
  console.log(`✅ Proveedores: ${supplierIds.length} con scores calculados`)

  // 10. Órdenes de compra ──────────────────────────────────────────────────────
  const poSkus = cfg.products.map((p) => p.sku)
  let posCreated = 0

  for (const po of cfg.poData) {
    const prefix = cfg.slug.split('-').pop()!.toUpperCase()
    const orderNumber = `OC-${prefix}-${po.orderNumSuffix}`
    const exists = await prisma.purchaseOrder.findFirst({
      where: { tenantId: tenant.id, orderNumber },
    })
    if (exists) continue

    const supplierId = supplierIds[po.supplierIdx]
    const items = po.items.map((item) => {
      const productId = productMap.get(poSkus[item.skuIdx])!
      const isReceived = po.status === 'received'
      return {
        productId,
        quantityOrdered:  item.qty,
        quantityReceived: isReceived ? item.qty : 0,
        unitCost:         item.cost,
        total:            item.qty * item.cost,
      }
    })

    const subtotal = items.reduce((s, i) => s + i.total, 0)
    const tax      = Math.round(subtotal * 0.19)
    const total    = subtotal + tax

    const isApprovedOrReceived = ['approved', 'received'].includes(po.status)
    const expectedDelivery     = po.expectedDays != null ? addDays(NOW, po.expectedDays) : null
    const deliveredAt          = po.status === 'received'
      ? addDays(NOW, (po.expectedDays ?? -3) + 2)
      : null

    await prisma.purchaseOrder.create({
      data: {
        tenantId:        tenant.id,
        supplierId,
        branchId:        branch1.id,
        createdBy:       admin.id,
        approvedBy:      isApprovedOrReceived ? manager.id : null,
        orderNumber,
        status:          po.status,
        subtotal,
        tax,
        total,
        expectedDelivery,
        deliveredAt,
        items: { create: items },
      },
    })
    posCreated++
  }
  console.log(`✅ Órdenes:     ${posCreated} OC (draft/pending/approved/received)`)

  // 11. Notificaciones ─────────────────────────────────────────────────────────
  const notifExists = await prisma.notification.findFirst({ where: { tenantId: tenant.id } })
  if (!notifExists) {
    const belowMinProduct = cfg.products.find((p) => (cfg.stockQtys[p.sku] ?? 0) < p.minStock)
    await prisma.notification.createMany({
      data: [
        {
          tenantId: tenant.id, userId: manager.id, module: 'KIRA', type: 'STOCK_CRITICO',
          title: 'Stock crítico detectado',
          message: belowMinProduct
            ? `${belowMinProduct.name} tiene ${cfg.stockQtys[belowMinProduct.sku]} unidades (mínimo: ${belowMinProduct.minStock}).`
            : 'Hay productos por debajo del stock mínimo.',
          isRead: false, link: '/kira/stock',
          createdAt: addDays(NOW, -1),
        },
        {
          tenantId: tenant.id, userId: admin.id, module: 'NIRA', type: 'ENTREGA_VENCIDA',
          title: 'Orden de compra sin recibir',
          message: 'Una o más órdenes tienen fecha de entrega próxima o vencida y no han sido confirmadas.',
          isRead: false, link: '/nira/purchase-orders',
          createdAt: addDays(NOW, -2),
        },
        {
          tenantId: tenant.id, userId: manager.id, module: 'KIRA', type: 'REABASTECIMIENTO_REQUERIDO',
          title: 'Reabastecimiento requerido',
          message: `Se detectaron ${belowMin} producto(s) bajo el umbral mínimo de inventario.`,
          isRead: false, link: '/kira/stock',
          createdAt: addDays(NOW, -3),
        },
      ],
    })
    console.log(`✅ Alertas:     3 notificaciones sin leer`)
  }

  return { tenantId: tenant.id, slug: cfg.slug }
}

// ─── Datos Tenant 1: Farmacia El Pinar S.A.S. ────────────────────────────────

const pinarProducts: ProductDef[] = [
  { sku: 'PIN-TYLEN-500',  name: 'Acetaminofén 500mg x 20',          category: 'Analgésicos',      unit: 'caja',      salePrice: 8500,   costPrice: 5200,  minStock: 50,  maxStock: 200, abcClass: 'A' },
  { sku: 'PIN-IBUPRO-400', name: 'Ibuprofeno 400mg x 10',            category: 'Analgésicos',      unit: 'caja',      salePrice: 9800,   costPrice: 6000,  minStock: 40,  maxStock: 150, abcClass: 'A' },
  { sku: 'PIN-OMEP-20',    name: 'Omeprazol 20mg x 14',              category: 'Gastro',           unit: 'caja',      salePrice: 15000,  costPrice: 9500,  minStock: 30,  maxStock: 100, abcClass: 'B' },
  { sku: 'PIN-AMOX-500',   name: 'Amoxicilina 500mg x 21',           category: 'Antibióticos',     unit: 'caja',      salePrice: 28000,  costPrice: 18000, minStock: 20,  maxStock: 80,  abcClass: 'B' },
  { sku: 'PIN-LOSAR-50',   name: 'Losartán 50mg x 30',               category: 'Cardio',           unit: 'caja',      salePrice: 22000,  costPrice: 14000, minStock: 60,  maxStock: 200, abcClass: 'A' },
  { sku: 'PIN-METF-850',   name: 'Metformina 850mg x 30',            category: 'Diabetes',         unit: 'caja',      salePrice: 18500,  costPrice: 11000, minStock: 40,  maxStock: 150, abcClass: 'A' },
  { sku: 'PIN-VITC-1000',  name: 'Vitamina C 1000mg x 30',           category: 'Vitaminas',        unit: 'frasco',    salePrice: 25000,  costPrice: 15000, minStock: 25,  maxStock: 100, abcClass: 'C' },
  { sku: 'PIN-SUERO-ORAL', name: 'Suero Oral Sabor Limón',           category: 'Hidratación',      unit: 'sobre',     salePrice: 2500,   costPrice: 1200,  minStock: 100, maxStock: 500, abcClass: 'C' },
  { sku: 'PIN-ALCO-GEL',   name: 'Gel Antibacterial 500ml',          category: 'Higiene',          unit: 'frasco',    salePrice: 12000,  costPrice: 7500,  minStock: 30,  maxStock: 120, abcClass: 'C' },
  { sku: 'PIN-CLAR-500',   name: 'Claritromicina 500mg x 14',        category: 'Antibióticos',     unit: 'caja',      salePrice: 35000,  costPrice: 22000, minStock: 15,  maxStock: 60,  abcClass: 'B' },
  { sku: 'PIN-ATOR-20',    name: 'Atorvastatina 20mg x 30',          category: 'Cardio',           unit: 'caja',      salePrice: 26000,  costPrice: 16500, minStock: 30,  maxStock: 120, abcClass: 'A' },
  { sku: 'PIN-DICLO-50',   name: 'Diclofenaco Sódico 50mg x 30',    category: 'Analgésicos',      unit: 'caja',      salePrice: 11000,  costPrice: 6500,  minStock: 35,  maxStock: 140, abcClass: 'B' },
]

const pinarStock: Record<string, number> = {
  'PIN-TYLEN-500':  120,   // OK
  'PIN-IBUPRO-400': 85,    // OK
  'PIN-OMEP-20':    12,    // ⚠ bajo mínimo (min=30)
  'PIN-AMOX-500':   5,     // ⚠ bajo mínimo (min=20)
  'PIN-LOSAR-50':   75,    // OK
  'PIN-METF-850':   50,    // OK
  'PIN-VITC-1000':  8,     // ⚠ bajo mínimo (min=25)
  'PIN-SUERO-ORAL': 210,   // OK
  'PIN-ALCO-GEL':   40,    // OK
  'PIN-CLAR-500':   18,    // OK
  'PIN-ATOR-20':    60,    // OK
  'PIN-DICLO-50':   25,    // ⚠ bajo mínimo (min=35)
}

const pinarSuppliers: SupplierDef[] = [
  {
    name: 'Distribuidora Farmacéutica Andina S.A.', contactName: 'Carlos Mendoza',
    email: 'ventas@dfandina.co', phone: '+57 1 345 6789', taxId: '800234567-1',
    address: 'Zona Industrial Puente Aranda, Bogotá', paymentTerms: 30,
    priceScore: 8.5, deliveryScore: 9.2, qualityScore: 8.8, overallScore: 8.8, totalOrders: 48, onTimeDeliveries: 44,
  },
  {
    name: 'MediLab Colombia Ltda.', contactName: 'Patricia Torres',
    email: 'compras@medilab.co', phone: '+57 1 456 7890', taxId: '900345678-2',
    address: 'Carrera 68 # 22-31, Bogotá', paymentTerms: 15,
    priceScore: 7.0, deliveryScore: 6.5, qualityScore: 9.0, overallScore: 7.5, totalOrders: 22, onTimeDeliveries: 15,
  },
  {
    name: 'Pharma Express Colombia S.A.S.', contactName: 'Jhon Castaño',
    email: 'jcastano@pharmaexpress.co', phone: '+57 310 234 5678', taxId: '901234567-3',
    address: 'Av. El Dorado # 90-10, Bogotá', paymentTerms: 45,
    priceScore: 9.5, deliveryScore: 8.0, qualityScore: 8.0, overallScore: 8.5, totalOrders: 35, onTimeDeliveries: 30,
  },
  {
    name: 'Suministros Médicos del Norte', contactName: 'Sandra Ríos',
    email: 'ventas@smnorte.co', phone: '+57 301 456 7890', taxId: '830987654-4',
    address: 'Calle 53 # 12-30, Bogotá', paymentTerms: 30,
    priceScore: 6.0, deliveryScore: 5.5, qualityScore: 7.0, overallScore: 6.2, totalOrders: 10, onTimeDeliveries: 6,
  },
]

const pinarPOs: PODef[] = [
  {
    supplierIdx: 0, status: 'received', expectedDays: -5, orderNumSuffix: '2026-001',
    items: [{ skuIdx: 0, qty: 100, cost: 5200 }, { skuIdx: 4, qty: 50, cost: 14000 }],
  },
  {
    supplierIdx: 2, status: 'approved', expectedDays: 7, orderNumSuffix: '2026-002',
    items: [{ skuIdx: 2, qty: 60, cost: 9500 }, { skuIdx: 6, qty: 30, cost: 15000 }],
  },
  {
    supplierIdx: 0, status: 'pending_approval', expectedDays: 14, orderNumSuffix: '2026-003',
    items: [{ skuIdx: 3, qty: 40, cost: 18000 }, { skuIdx: 9, qty: 20, cost: 22000 }, { skuIdx: 10, qty: 50, cost: 16500 }],
  },
  {
    supplierIdx: 1, status: 'draft', expectedDays: null, orderNumSuffix: '2026-004',
    items: [{ skuIdx: 7, qty: 200, cost: 1200 }, { skuIdx: 8, qty: 50, cost: 7500 }],
  },
  {
    supplierIdx: 2, status: 'received', expectedDays: -10, orderNumSuffix: '2026-005',
    items: [{ skuIdx: 5, qty: 80, cost: 11000 }, { skuIdx: 11, qty: 60, cost: 6500 }],
  },
]

// ─── Datos Tenant 2: Droguería Salud Total Ltda. ─────────────────────────────

const saludProducts: ProductDef[] = [
  { sku: 'SAL-HIDRO-100',   name: 'Hidrocortisona Crema 1% 30g',         category: 'Dermatología',     unit: 'tubo',      salePrice: 18000,  costPrice: 11000, minStock: 20,  maxStock: 80,  abcClass: 'B' },
  { sku: 'SAL-CLOT-200',    name: 'Clotrimazol Crema 1% 20g',            category: 'Dermatología',     unit: 'tubo',      salePrice: 12500,  costPrice: 7800,  minStock: 25,  maxStock: 100, abcClass: 'B' },
  { sku: 'SAL-ENALAS-5',    name: 'Enalapril 5mg x 30',                  category: 'Cardio',           unit: 'caja',      salePrice: 14000,  costPrice: 8500,  minStock: 40,  maxStock: 160, abcClass: 'A' },
  { sku: 'SAL-ASPIR-100',   name: 'Ácido Acetilsalicílico 100mg x 30',   category: 'Cardio',           unit: 'caja',      salePrice: 7500,   costPrice: 4200,  minStock: 60,  maxStock: 240, abcClass: 'A' },
  { sku: 'SAL-GLIB-5',      name: 'Glibenclamida 5mg x 30',              category: 'Diabetes',         unit: 'caja',      salePrice: 16500,  costPrice: 10000, minStock: 30,  maxStock: 120, abcClass: 'A' },
  { sku: 'SAL-INSUL-N',     name: 'Insulina NPH 100UI/ml 10ml',          category: 'Diabetes',         unit: 'vial',      salePrice: 48000,  costPrice: 32000, minStock: 15,  maxStock: 60,  abcClass: 'A' },
  { sku: 'SAL-SALBUT-INH',  name: 'Salbutamol Inhalador 100mcg',         category: 'Respiratorio',     unit: 'inhalador', salePrice: 32000,  costPrice: 20000, minStock: 20,  maxStock: 80,  abcClass: 'B' },
  { sku: 'SAL-PREDNI-5',    name: 'Prednisolona 5mg x 20',               category: 'Antiinflamatorio', unit: 'caja',      salePrice: 21000,  costPrice: 13000, minStock: 20,  maxStock: 80,  abcClass: 'B' },
  { sku: 'SAL-DOXIC-100',   name: 'Doxiciclina 100mg x 10',              category: 'Antibióticos',     unit: 'caja',      salePrice: 24000,  costPrice: 15000, minStock: 15,  maxStock: 60,  abcClass: 'C' },
  { sku: 'SAL-PANTO-40',    name: 'Pantoprazol 40mg x 14',               category: 'Gastro',           unit: 'caja',      salePrice: 38000,  costPrice: 24000, minStock: 20,  maxStock: 80,  abcClass: 'B' },
]

const saludStock: Record<string, number> = {
  'SAL-HIDRO-100':  25,    // OK
  'SAL-CLOT-200':   10,    // ⚠ bajo mínimo (min=25)
  'SAL-ENALAS-5':   90,    // OK
  'SAL-ASPIR-100':  145,   // OK
  'SAL-GLIB-5':     8,     // ⚠ bajo mínimo (min=30)
  'SAL-INSUL-N':    20,    // OK
  'SAL-SALBUT-INH': 6,     // ⚠ bajo mínimo (min=20)
  'SAL-PREDNI-5':   35,    // OK
  'SAL-DOXIC-100':  22,    // OK
  'SAL-PANTO-40':   15,    // ⚠ bajo mínimo (min=20)
}

const saludSuppliers: SupplierDef[] = [
  {
    name: 'Laboratorio Riosalud S.A.', contactName: 'Fernando Reyes',
    email: 'fereyes@riosalud.com.co', phone: '+57 4 444 5566', taxId: '811234567-1',
    address: 'Cra 52 # 4Sur-20, Medellín', paymentTerms: 30,
    priceScore: 9.0, deliveryScore: 8.5, qualityScore: 9.5, overallScore: 9.0, totalOrders: 60, onTimeDeliveries: 56,
  },
  {
    name: 'BioFarma del Pacífico Ltda.', contactName: 'Claudia Osorio',
    email: 'cosorio@biofarma.co', phone: '+57 321 678 9012', taxId: '900876543-2',
    address: 'Cll 10 # 24-35, Medellín', paymentTerms: 15,
    priceScore: 7.5, deliveryScore: 7.0, qualityScore: 8.0, overallScore: 7.5, totalOrders: 18, onTimeDeliveries: 13,
  },
  {
    name: 'Especialidades Farmacéuticas del Oriente', contactName: 'Andrés Valencia',
    email: 'avalencia@efo.com.co', phone: '+57 4 678 9012', taxId: '860765432-3',
    address: 'Av. Las Vegas # 45-20, Medellín', paymentTerms: 45,
    priceScore: 8.0, deliveryScore: 9.0, qualityScore: 8.5, overallScore: 8.5, totalOrders: 28, onTimeDeliveries: 26,
  },
]

const saludPOs: PODef[] = [
  {
    supplierIdx: 0, status: 'received', expectedDays: -7, orderNumSuffix: '2026-001',
    items: [{ skuIdx: 2, qty: 80, cost: 8500 }, { skuIdx: 5, qty: 30, cost: 32000 }],
  },
  {
    supplierIdx: 2, status: 'approved', expectedDays: 10, orderNumSuffix: '2026-002',
    items: [{ skuIdx: 6, qty: 40, cost: 20000 }, { skuIdx: 7, qty: 30, cost: 13000 }],
  },
  {
    supplierIdx: 0, status: 'pending_approval', expectedDays: 12, orderNumSuffix: '2026-003',
    items: [{ skuIdx: 1, qty: 50, cost: 7800 }, { skuIdx: 4, qty: 60, cost: 10000 }, { skuIdx: 9, qty: 40, cost: 24000 }],
  },
  {
    supplierIdx: 1, status: 'draft', expectedDays: null, orderNumSuffix: '2026-004',
    items: [{ skuIdx: 0, qty: 40, cost: 11000 }, { skuIdx: 8, qty: 30, cost: 15000 }],
  },
  {
    supplierIdx: 2, status: 'received', expectedDays: -15, orderNumSuffix: '2026-005',
    items: [{ skuIdx: 3, qty: 120, cost: 4200 }],
  },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seed completo — dos empresas demo\n')

  await seedTenant({
    slug: 'demo-pinar', name: 'Farmacia El Pinar S.A.S.',
    legalName: 'Farmacia El Pinar Sociedad por Acciones Simplificada',
    taxId: '900456789-1', city: 'Bogotá',
    adminEmail:     'admin@pinar.demo.co',
    managerEmail:   'manager@pinar.demo.co',
    operativeEmail: 'bodega@pinar.demo.co',
    adminName:     'Laura Herrera',
    managerName:   'Ricardo Gómez',
    operativeName: 'Valentina Cruz',
    branchOneName: 'Sede Principal El Pinar',
    branchTwoName: 'Sucursal Norte El Pinar',
    branchOneAddress: 'Carrera 15 # 100-45, Bogotá D.C.',
    branchTwoAddress: 'Calle 147 # 18-23, Bogotá D.C.',
    phone1: '+57 1 234 5678', phone2: '+57 1 567 8901',
    products: pinarProducts, stockQtys: pinarStock,
    suppliers: pinarSuppliers, poData: pinarPOs,
  })

  await seedTenant({
    slug: 'demo-salud', name: 'Droguería Salud Total Ltda.',
    legalName: 'Droguería Salud Total Limitada',
    taxId: '830567890-2', city: 'Medellín',
    adminEmail:     'admin@salud.demo.co',
    managerEmail:   'manager@salud.demo.co',
    operativeEmail: 'bodega@salud.demo.co',
    adminName:     'Mónica Ríos',
    managerName:   'Javier Morales',
    operativeName: 'Diana Zapata',
    branchOneName: 'Sede Principal Salud Total',
    branchTwoName: 'Sede Sur Salud Total',
    branchOneAddress: 'Calle 50 # 45-67, Medellín',
    branchTwoAddress: 'Carrera 80 # 30-15, Medellín',
    phone1: '+57 4 345 6789', phone2: '+57 4 678 9012',
    products: saludProducts, stockQtys: saludStock,
    suppliers: saludSuppliers, poData: saludPOs,
  })

  // ─── Resumen final ──────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('🎉 Seed completado. Credenciales (contraseña: Demo2024!)')
  console.log('═'.repeat(60))
  console.log('\n🏢  Farmacia El Pinar S.A.S.  (Bogotá)')
  console.log('    admin@pinar.demo.co    → TENANT_ADMIN')
  console.log('    manager@pinar.demo.co  → AREA_MANAGER  (KIRA)')
  console.log('    bodega@pinar.demo.co   → OPERATIVE     (KIRA)')
  console.log('\n🏢  Droguería Salud Total Ltda.  (Medellín)')
  console.log('    admin@salud.demo.co    → TENANT_ADMIN')
  console.log('    manager@salud.demo.co  → AREA_MANAGER  (KIRA)')
  console.log('    bodega@salud.demo.co   → OPERATIVE     (KIRA)')
  console.log('\n' + '═'.repeat(60))
}

main()
  .catch((e) => { console.error('\n❌ Error en el seed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
