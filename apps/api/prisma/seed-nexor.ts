/**
 * seed-nexor.ts — Borra TODA la base y siembra una sola empresa: "Nexor".
 *
 * Crea desde cero (tras TRUNCATE de todas las tablas de negocio):
 *   - Tenant Nexor + 2 sucursales
 *   - 7 usuarios (TENANT_ADMIN + un AREA_MANAGER por módulo + 1 OPERATIVE)
 *   - Feature flags: los 5 módulos activos
 *   - KIRA: 10 productos con stock en ambas sucursales (algunos bajo mínimo) + movimientos
 *   - NIRA: 4 proveedores con score + 4 órdenes de compra en distintos estados
 *           + proveedor preferido por producto y preferido global (HU-123)
 *   - ARI: 5 etapas de pipeline + 6 clientes + 4 negocios + interacciones + 2 cotizaciones
 *   - AGENDA: 3 tipos de servicio + disponibilidad + 4 citas
 *   - VERA: categorías + centros de costo + 14 transacciones + presupuesto mensual
 *   - Notificaciones de ejemplo
 *
 * CREDENCIALES (contraseña: Nexor2024!)
 *   admin@nexor.co (TENANT_ADMIN) · ventas@ (ARI) · compras@ (NIRA) · inventario@ (KIRA)
 *   agenda@ (AGENDA) · finanzas@ (VERA) · operativo@ (OPERATIVE/KIRA)
 *
 * EJECUTAR:  cd apps/api && npx tsx prisma/seed-nexor.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'] } },
})

const PASS = 'Nexor2024!'
const HASH = bcrypt.hashSync(PASS, 10)
const NOW = new Date()
const day = (n: number): Date => { const d = new Date(NOW); d.setDate(d.getDate() + n); return d }
const at = (n: number, h: number, m = 0): Date => { const d = new Date(NOW); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d }

// Todas las tablas de negocio (sin _prisma_migrations).
const TABLES = [
  'notifications', 'agent_logs', 'integrations', 'refresh_tokens',
  'quote_items', 'quotes', 'interactions', 'deals', 'pipeline_stages', 'clients',
  'stock_movements', 'stocks', 'purchase_order_items', 'purchase_orders',
  'supplier_scores', 'products', 'suppliers',
  'appointment_cancel_tokens', 'appointments', 'availability', 'blocked_dates',
  'service_professionals', 'service_types',
  'transactions', 'transaction_categories', 'cost_centers', 'monthly_budgets',
  'bulk_upload_logs', 'chat_messages', 'conversation_messages', 'conversations',
  'feature_flags', 'users', 'branches', 'tenants',
]

async function wipe(): Promise<void> {
  const list = TABLES.map((t) => `"${t}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

async function main(): Promise<void> {
  const who = await prisma.$queryRawUnsafe<{ current_user: string }[]>('SELECT current_user')
  console.log(`Conectado como: ${who[0]?.current_user}`)
  console.log('🧹 Borrando TODOS los datos...')
  await wipe()

  // ── Tenant + sucursales ─────────────────────────────────────────────────
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Nexor', slug: 'nexor', legalName: 'Nexor S.A.S.', taxId: '901456789-1',
      currency: 'COP', timezone: 'America/Bogota',
    },
  })
  const bogota = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Nexor Principal', city: 'Bogotá', address: 'Cra 7 #71-21', phone: '6015551001' } })
  const medellin = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Nexor Norte', city: 'Medellín', address: 'Cl 10 #43-10', phone: '6045551002' } })

  // ── Usuarios ────────────────────────────────────────────────────────────
  const mkUser = (email: string, name: string, role: 'TENANT_ADMIN' | 'AREA_MANAGER' | 'OPERATIVE', module: 'ARI' | 'NIRA' | 'KIRA' | 'AGENDA' | 'VERA' | null, branchId: string) =>
    prisma.user.create({ data: { tenantId: tenant.id, branchId, email, name, passwordHash: HASH, role, module: module ?? undefined } })

  const admin = await mkUser('admin@nexor.co', 'Admin Nexor', 'TENANT_ADMIN', null, bogota.id)
  const uVentas = await mkUser('ventas@nexor.co', 'Laura Gómez', 'AREA_MANAGER', 'ARI', bogota.id)
  const uCompras = await mkUser('compras@nexor.co', 'Carlos Ruiz', 'AREA_MANAGER', 'NIRA', bogota.id)
  const uInv = await mkUser('inventario@nexor.co', 'Marta Díaz', 'AREA_MANAGER', 'KIRA', bogota.id)
  const uAgenda = await mkUser('agenda@nexor.co', 'Sofía León', 'AREA_MANAGER', 'AGENDA', bogota.id)
  const uFin = await mkUser('finanzas@nexor.co', 'Andrés Peña', 'AREA_MANAGER', 'VERA', bogota.id)
  const uOper = await mkUser('operativo@nexor.co', 'Pedro Bodega', 'OPERATIVE', 'KIRA', medellin.id)

  // ── Feature flags (todos activos) ────────────────────────────────────────
  await prisma.featureFlag.createMany({
    data: (['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'] as const).map((module) => ({ tenantId: tenant.id, module, enabled: true })),
  })

  // ── NIRA: proveedores + scores ──────────────────────────────────────────
  const supplierDefs = [
    { name: 'Distribuidora Andina', contact: 'Jorge Mesa', email: 'ventas@andina.co', phone: '6017770001', taxId: '900111222-3', terms: 30, p: 4.6, d: 4.8, q: 4.7, orders: 24, onTime: 22 },
    { name: 'Importaciones del Valle', contact: 'Ana Botero', email: 'compras@delvalle.co', phone: '6017770002', taxId: '900222333-4', terms: 45, p: 4.2, d: 4.0, q: 4.4, orders: 15, onTime: 12 },
    { name: 'Suministros Caribe', contact: 'Luis Pardo', email: 'info@caribe.co', phone: '6017770003', taxId: '900333444-5', terms: 15, p: 3.9, d: 4.5, q: 4.1, orders: 9, onTime: 8 },
    { name: 'Mayorista Express', contact: 'Diana Cruz', email: 'pedidos@express.co', phone: '6017770004', taxId: '900444555-6', terms: 30, p: 4.0, d: 3.6, q: 3.8, orders: 6, onTime: 4 },
  ]
  const suppliers = []
  for (const s of supplierDefs) {
    const sup = await prisma.supplier.create({
      data: {
        tenantId: tenant.id, name: s.name, contactName: s.contact, email: s.email, phone: s.phone,
        taxId: s.taxId, city: 'Bogotá', paymentTerms: s.terms,
        score: { create: { priceScore: s.p, deliveryScore: s.d, qualityScore: s.q, overallScore: Number(((s.p + s.d + s.q) / 3).toFixed(2)), totalOrders: s.orders, onTimeDeliveries: s.onTime, calculatedAt: NOW } },
      },
    })
    suppliers.push(sup)
  }
  // Preferido GLOBAL del tenant (HU-123) → mejor score.
  await prisma.tenant.update({ where: { id: tenant.id }, data: { defaultSupplierId: suppliers[0]!.id } })

  // ── KIRA: productos + stock + movimientos ────────────────────────────────
  const productDefs = [
    { sku: 'NX-001', name: 'Teclado mecánico RGB', cat: 'Periféricos', sale: 220000, cost: 140000, min: 10, max: 80, abc: 'A', pref: 0 },
    { sku: 'NX-002', name: 'Mouse inalámbrico Pro', cat: 'Periféricos', sale: 95000, cost: 52000, min: 15, max: 120, abc: 'A', pref: 0 },
    { sku: 'NX-003', name: 'Monitor 27" 144Hz', cat: 'Pantallas', sale: 980000, cost: 720000, min: 5, max: 40, abc: 'A', pref: 1 },
    { sku: 'NX-004', name: 'Webcam Full HD', cat: 'Video', sale: 130000, cost: 78000, min: 8, max: 60, abc: 'B', pref: null },
    { sku: 'NX-005', name: 'Audífonos diadema', cat: 'Audio', sale: 175000, cost: 99000, min: 12, max: 90, abc: 'B', pref: 2 },
    { sku: 'NX-006', name: 'Hub USB-C 7 en 1', cat: 'Accesorios', sale: 145000, cost: 85000, min: 20, max: 100, abc: 'B', pref: null },
    { sku: 'NX-007', name: 'Disco SSD 1TB', cat: 'Almacenamiento', sale: 380000, cost: 260000, min: 10, max: 70, abc: 'A', pref: 1 },
    { sku: 'NX-008', name: 'Memoria RAM 16GB', cat: 'Componentes', sale: 290000, cost: 205000, min: 10, max: 60, abc: 'A', pref: null },
    { sku: 'NX-009', name: 'Cable HDMI 2m', cat: 'Accesorios', sale: 28000, cost: 12000, min: 30, max: 200, abc: 'C', pref: null },
    { sku: 'NX-010', name: 'Base refrigerante laptop', cat: 'Accesorios', sale: 89000, cost: 47000, min: 10, max: 80, abc: 'C', pref: 3 },
  ]
  // Stock por sucursal: [bogotá, medellín]. Algunos por debajo del mínimo.
  const stockMap: Record<string, [number, number]> = {
    'NX-001': [45, 22], 'NX-002': [60, 5], 'NX-003': [3, 8], 'NX-004': [25, 15],
    'NX-005': [40, 18], 'NX-006': [55, 2], 'NX-007': [30, 12], 'NX-008': [9, 6],
    'NX-009': [120, 60], 'NX-010': [4, 10],
  }
  const products = []
  for (const p of productDefs) {
    const prod = await prisma.product.create({
      data: {
        tenantId: tenant.id, sku: p.sku, name: p.name, category: p.cat, unit: 'unidad',
        salePrice: p.sale, costPrice: p.cost, minStock: p.min, maxStock: p.max, abcClass: p.abc,
        preferredSupplierId: p.pref !== null ? suppliers[p.pref]!.id : undefined,
      },
    })
    const [qb, qm] = stockMap[p.sku]!
    await prisma.stock.createMany({ data: [{ productId: prod.id, branchId: bogota.id, quantity: qb }, { productId: prod.id, branchId: medellin.id, quantity: qm }] })
    products.push(prod)
  }
  // Movimientos de inventario (inmutables). Entradas/salidas de ejemplo.
  const mv = (prod: typeof products[number], branchId: string, type: 'entrada' | 'salida', qty: number, before: number, userId: string, n: number) =>
    prisma.stockMovement.create({ data: { tenantId: tenant.id, productId: prod.id, branchId, userId, type, quantity: qty, quantityBefore: before, quantityAfter: type === 'entrada' ? before + qty : before - qty, notes: type === 'entrada' ? 'Recepción de compra' : 'Venta mostrador', createdAt: day(-n) } })
  await mv(products[0]!, bogota.id, 'entrada', 50, 0, uInv.id, 12)
  await mv(products[0]!, bogota.id, 'salida', 5, 50, uOper.id, 6)
  await mv(products[1]!, bogota.id, 'entrada', 70, 0, uInv.id, 11)
  await mv(products[1]!, bogota.id, 'salida', 10, 70, uOper.id, 4)
  await mv(products[2]!, bogota.id, 'salida', 7, 10, uOper.id, 2)

  // ── NIRA: órdenes de compra en distintos estados ─────────────────────────
  const poDefs = [
    { sup: 0, branch: bogota.id, status: 'received', exp: -5, items: [{ p: 0, q: 30, c: 138000 }, { p: 1, q: 40, c: 50000 }], approver: admin.id, delivered: -3 },
    { sup: 1, branch: bogota.id, status: 'approved', exp: 6, items: [{ p: 2, q: 10, c: 715000 }], approver: admin.id, delivered: null },
    { sup: 0, branch: medellin.id, status: 'submitted', exp: 9, items: [{ p: 6, q: 15, c: 255000 }, { p: 7, q: 12, c: 200000 }], approver: null, delivered: null },
    { sup: 2, branch: bogota.id, status: 'draft', exp: null, items: [{ p: 5, q: 20, c: 83000 }], approver: null, delivered: null },
  ]
  let poN = 1001
  for (const po of poDefs) {
    const subtotal = po.items.reduce((s, i) => s + i.q * i.c, 0)
    await prisma.purchaseOrder.create({
      data: {
        tenantId: tenant.id, supplierId: suppliers[po.sup]!.id, branchId: po.branch, createdBy: uCompras.id,
        approvedBy: po.approver ?? undefined, orderNumber: `OC-${poN++}`, status: po.status,
        subtotal, tax: 0, total: subtotal,
        expectedDelivery: po.exp !== null ? day(po.exp) : undefined,
        deliveredAt: po.delivered !== null ? day(po.delivered) : undefined,
        notes: po.status === 'draft' ? 'Borrador propuesto por NIRA' : undefined,
        items: { create: po.items.map((i) => ({ productId: products[i.p]!.id, quantityOrdered: i.q, quantityReceived: po.status === 'received' ? i.q : 0, unitCost: i.c, total: i.q * i.c })) },
      },
    })
  }

  // ── ARI: pipeline + clientes + negocios + interacciones + cotizaciones ────
  const stageDefs = [
    { name: 'Prospecto', order: 1, color: '#94a3b8', won: false, lost: false },
    { name: 'Contactado', order: 2, color: '#60a5fa', won: false, lost: false },
    { name: 'Propuesta', order: 3, color: '#fbbf24', won: false, lost: false },
    { name: 'Ganado', order: 4, color: '#34d399', won: true, lost: false },
    { name: 'Perdido', order: 5, color: '#f87171', won: false, lost: true },
  ]
  const stages = []
  for (const s of stageDefs) stages.push(await prisma.pipelineStage.create({ data: { tenantId: tenant.id, name: s.name, order: s.order, color: s.color, isFinalWon: s.won, isFinalLost: s.lost } }))

  // HU-124 — algunos clientes favoritos con descuento preferente (informativo).
  const clientDefs = [
    { name: 'Tecnología Global SAS', email: 'compras@tecglobal.co', phone: '3001112233', company: 'Tecnología Global', city: 'Bogotá', source: 'whatsapp', tags: ['mayorista'], fav: true, dtype: 'percent' as const, dval: 10 },
    { name: 'Oficinas Modernas Ltda', email: 'gerencia@oficinasmod.co', phone: '3002223344', company: 'Oficinas Modernas', city: 'Medellín', source: 'web', tags: ['corporativo'], fav: true, dtype: 'amount' as const, dval: 150000 },
    { name: 'Juan Martínez', email: 'juanm@gmail.com', phone: '3003334455', company: null, city: 'Cali', source: 'referido', tags: ['minorista'], fav: false, dtype: null, dval: null },
    { name: 'Café del Centro', email: 'admin@cafecentro.co', phone: '3004445566', company: 'Café del Centro', city: 'Bogotá', source: 'whatsapp', tags: [], fav: false, dtype: null, dval: null },
    { name: 'Estudio Creativo DC', email: 'hola@estudiodc.co', phone: '3005556677', company: 'Estudio DC', city: 'Bogotá', source: 'web', tags: ['recurrente'], fav: true, dtype: 'percent' as const, dval: 5 },
    { name: 'Laura Fernández', email: 'lauraf@outlook.com', phone: '3006667788', company: null, city: 'Barranquilla', source: 'gmail', tags: ['lead'], fav: false, dtype: null, dval: null },
  ]
  const clients = []
  for (const c of clientDefs) clients.push(await prisma.client.create({ data: { tenantId: tenant.id, name: c.name, email: c.email, phone: c.phone, company: c.company ?? undefined, city: c.city, source: c.source, tags: c.tags, assignedTo: uVentas.id, branchId: bogota.id, isFavorite: c.fav, discountType: c.dtype, discountValue: c.dval } }))

  const dealDefs = [
    { client: 0, stage: 2, title: 'Dotación 20 puestos de trabajo', value: 14500000, prob: 60, days: 12 },
    { client: 1, stage: 3, title: 'Renovación monitores oficina', value: 9800000, prob: 100, days: -2 },
    { client: 3, stage: 1, title: 'Equipos punto de venta', value: 3200000, prob: 30, days: 20 },
    { client: 4, stage: 4, title: 'Accesorios fotografía', value: 1200000, prob: 0, days: -5 },
  ]
  const deals = []
  for (const d of dealDefs) {
    const stage = stages[d.stage]!
    deals.push(await prisma.deal.create({
      data: {
        tenantId: tenant.id, clientId: clients[d.client]!.id, stageId: stage.id, assignedTo: uVentas.id, branchId: bogota.id,
        title: d.title, value: d.value, probability: d.prob, expectedClose: day(d.days),
        closedAt: stage.isFinalWon || stage.isFinalLost ? day(d.days) : undefined,
        lostReason: stage.isFinalLost ? 'Eligió a la competencia por precio' : undefined,
      },
    }))
  }
  await prisma.interaction.createMany({
    data: [
      { tenantId: tenant.id, clientId: clients[0]!.id, dealId: deals[0]!.id, userId: uVentas.id, type: 'whatsapp', direction: 'in', content: 'Hola, necesito cotización para 20 puestos.', createdAt: day(-3) },
      { tenantId: tenant.id, clientId: clients[0]!.id, dealId: deals[0]!.id, userId: uVentas.id, type: 'whatsapp', direction: 'out', content: 'Con gusto, le preparo la propuesta hoy mismo.', createdAt: day(-3) },
      { tenantId: tenant.id, clientId: clients[1]!.id, dealId: deals[1]!.id, userId: uVentas.id, type: 'llamada', direction: 'out', content: 'Confirmada la compra de 10 monitores.', createdAt: day(-2) },
    ],
  })
  // Cotizaciones con líneas
  const q1items = [{ p: 0, q: 20, price: 220000 }, { p: 1, q: 20, price: 95000 }]
  const q1sub = q1items.reduce((s, i) => s + i.q * i.price, 0)
  await prisma.quote.create({
    data: {
      tenantId: tenant.id, clientId: clients[0]!.id, dealId: deals[0]!.id, createdBy: uVentas.id, quoteNumber: 'COT-2001',
      status: 'sent', subtotal: q1sub, discount: 0, tax: Number((q1sub * 0.19).toFixed(2)), total: Number((q1sub * 1.19).toFixed(2)), validUntil: day(15),
      items: { create: q1items.map((i) => ({ productId: products[i.p]!.id, description: products[i.p]!.name, quantity: i.q, unitPrice: i.price, total: i.q * i.price })) },
    },
  })
  const q2items = [{ p: 2, q: 10, price: 980000 }]
  const q2sub = q2items.reduce((s, i) => s + i.q * i.price, 0)
  await prisma.quote.create({
    data: {
      tenantId: tenant.id, clientId: clients[1]!.id, dealId: deals[1]!.id, createdBy: uVentas.id, quoteNumber: 'COT-2002',
      status: 'accepted', subtotal: q2sub, discount: 200000, tax: Number(((q2sub - 200000) * 0.19).toFixed(2)), total: Number(((q2sub - 200000) * 1.19).toFixed(2)), validUntil: day(10),
      items: { create: q2items.map((i) => ({ productId: products[i.p]!.id, description: products[i.p]!.name, quantity: i.q, unitPrice: i.price, total: i.q * i.price })) },
    },
  })

  // ── AGENDA: tipos de servicio + disponibilidad + citas ───────────────────
  const svcDefs = [
    { name: 'Soporte técnico en sitio', dur: 60, price: 120000, color: '#3b82f6' },
    { name: 'Instalación de equipos', dur: 90, price: 180000, color: '#10b981' },
    { name: 'Asesoría comercial', dur: 30, price: 0, color: '#f59e0b' },
  ]
  const services = []
  for (const s of svcDefs) {
    const svc = await prisma.serviceType.create({ data: { tenantId: tenant.id, branchId: bogota.id, name: s.name, durationMinutes: s.dur, price: s.price, color: s.color, professionals: { create: { userId: uAgenda.id } } } })
    services.push(svc)
  }
  // Disponibilidad lun-vie 8:00-17:00 (sucursal Bogotá)
  const baseDate = new Date(Date.UTC(2000, 0, 1))
  const t8 = new Date(baseDate); t8.setUTCHours(8, 0, 0, 0)
  const t17 = new Date(baseDate); t17.setUTCHours(17, 0, 0, 0)
  await prisma.availability.createMany({ data: [1, 2, 3, 4, 5].map((dow) => ({ tenantId: tenant.id, branchId: bogota.id, userId: uAgenda.id, dayOfWeek: dow, startTime: t8, endTime: t17 })) })
  const apptDefs = [
    { client: 0, svc: 0, dStart: at(1, 9), dur: 60, status: 'scheduled' },
    { client: 1, svc: 1, dStart: at(1, 11), dur: 90, status: 'scheduled' },
    { client: 3, svc: 2, dStart: at(2, 14), dur: 30, status: 'confirmed' },
    { client: 2, svc: 0, dStart: at(-2, 10), dur: 60, status: 'completed' },
  ]
  for (const a of apptDefs) {
    const end = new Date(a.dStart); end.setMinutes(end.getMinutes() + a.dur)
    await prisma.appointment.create({ data: { tenantId: tenant.id, branchId: bogota.id, clientId: clients[a.client]!.id, serviceTypeId: services[a.svc]!.id, professionalId: uAgenda.id, clientName: clients[a.client]!.name, clientPhone: clients[a.client]!.phone, startAt: a.dStart, endAt: end, status: a.status, channel: 'manual' } })
  }

  // ── VERA: categorías + centros de costo + transacciones + presupuesto ─────
  const catIngreso = await prisma.transactionCategory.create({ data: { tenantId: tenant.id, name: 'Ventas', type: 'income', color: '#10b981', isDefault: true } })
  const catServicios = await prisma.transactionCategory.create({ data: { tenantId: tenant.id, name: 'Servicios', type: 'income', color: '#22c55e' } })
  const catCompras = await prisma.transactionCategory.create({ data: { tenantId: tenant.id, name: 'Compras inventario', type: 'expense', color: '#ef4444', isDefault: true } })
  const catNomina = await prisma.transactionCategory.create({ data: { tenantId: tenant.id, name: 'Nómina', type: 'expense', color: '#f97316' } })
  const catArriendo = await prisma.transactionCategory.create({ data: { tenantId: tenant.id, name: 'Arriendo y servicios', type: 'expense', color: '#a855f7' } })
  const ccComercial = await prisma.costCenter.create({ data: { tenantId: tenant.id, name: 'Comercial' } })
  const ccOperaciones = await prisma.costCenter.create({ data: { tenantId: tenant.id, name: 'Operaciones' } })

  const txns: { type: 'income' | 'expense'; amount: number; desc: string; cat: string; cc: string; d: number; manual: boolean }[] = [
    { type: 'income', amount: 5236000, desc: 'Venta COT-2002 — Oficinas Modernas', cat: catIngreso.id, cc: ccComercial.id, d: -2, manual: false },
    { type: 'income', amount: 1820000, desc: 'Venta mostrador semana', cat: catIngreso.id, cc: ccComercial.id, d: -4, manual: true },
    { type: 'income', amount: 360000, desc: 'Servicios de instalación', cat: catServicios.id, cc: ccOperaciones.id, d: -5, manual: true },
    { type: 'income', amount: 2750000, desc: 'Venta corporativa equipos', cat: catIngreso.id, cc: ccComercial.id, d: -8, manual: true },
    { type: 'income', amount: 240000, desc: 'Asesoría comercial', cat: catServicios.id, cc: ccOperaciones.id, d: -10, manual: true },
    { type: 'expense', amount: 6140000, desc: 'OC-1001 — Distribuidora Andina', cat: catCompras.id, cc: ccOperaciones.id, d: -3, manual: false },
    { type: 'expense', amount: 3200000, desc: 'Nómina quincena', cat: catNomina.id, cc: ccOperaciones.id, d: -6, manual: true },
    { type: 'expense', amount: 1800000, desc: 'Arriendo bodega Bogotá', cat: catArriendo.id, cc: ccOperaciones.id, d: -7, manual: true },
    { type: 'expense', amount: 420000, desc: 'Servicios públicos', cat: catArriendo.id, cc: ccOperaciones.id, d: -7, manual: true },
    { type: 'expense', amount: 980000, desc: 'Compra accesorios menores', cat: catCompras.id, cc: ccOperaciones.id, d: -9, manual: true },
    { type: 'expense', amount: 560000, desc: 'Publicidad digital', cat: catArriendo.id, cc: ccComercial.id, d: -11, manual: true },
    { type: 'income', amount: 1450000, desc: 'Venta minorista', cat: catIngreso.id, cc: ccComercial.id, d: -12, manual: true },
    { type: 'expense', amount: 3200000, desc: 'Nómina quincena anterior', cat: catNomina.id, cc: ccOperaciones.id, d: -20, manual: true },
    { type: 'income', amount: 3980000, desc: 'Venta corporativa', cat: catIngreso.id, cc: ccComercial.id, d: -18, manual: true },
  ]
  await prisma.transaction.createMany({
    data: txns.map((t) => ({ tenantId: tenant.id, branchId: bogota.id, categoryId: t.cat, costCenterId: t.cc, isManual: t.manual, type: t.type, amount: t.amount, currency: 'COP', description: t.desc, date: day(t.d) })),
  })
  await prisma.monthlyBudget.create({ data: { tenantId: tenant.id, branchId: bogota.id, year: NOW.getFullYear(), month: NOW.getMonth() + 1, amount: 20000000 } })

  // ── Notificaciones ───────────────────────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      { tenantId: tenant.id, userId: uInv.id, module: 'KIRA', type: 'stock_bajo', title: 'Stock bajo mínimo', message: 'Monitor 27" 144Hz está por debajo del mínimo en Bogotá.', link: '/kira/products' },
      { tenantId: tenant.id, userId: uCompras.id, module: 'NIRA', type: 'borrador_oc', title: 'Orden de compra pendiente', message: 'OC-1003 enviada, requiere aprobación.', link: '/nira/purchase-orders' },
      { tenantId: tenant.id, userId: uVentas.id, module: 'ARI', type: 'deal', title: 'Negocio por cerrar', message: 'Renovación monitores oficina está en propuesta.', link: '/ari/pipeline' },
    ],
  })

  // ── Resumen ───────────────────────────────────────────────────────────────
  const counts = {
    tenants: await prisma.tenant.count(), branches: await prisma.branch.count(), users: await prisma.user.count(),
    featureFlags: await prisma.featureFlag.count(), products: await prisma.product.count(), stocks: await prisma.stock.count(),
    stockMovements: await prisma.stockMovement.count(), suppliers: await prisma.supplier.count(), purchaseOrders: await prisma.purchaseOrder.count(),
    clients: await prisma.client.count(), deals: await prisma.deal.count(), quotes: await prisma.quote.count(),
    appointments: await prisma.appointment.count(), serviceTypes: await prisma.serviceType.count(),
    transactions: await prisma.transaction.count(), notifications: await prisma.notification.count(),
  }
  console.log('✅ Seed Nexor completo:')
  console.table(counts)
  console.log(`\n🔑 Login (password: ${PASS}): admin@nexor.co · ventas@nexor.co · compras@nexor.co · inventario@nexor.co · agenda@nexor.co · finanzas@nexor.co · operativo@nexor.co`)
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error('ERR', e); await prisma.$disconnect(); process.exit(1) })
