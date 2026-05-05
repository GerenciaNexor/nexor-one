/**
 * seed-dental-activity.ts — Actividad operativa para Clínica Dental Sonrisa Perfecta
 *
 * Agrega a la empresa ya existente:
 *   - 30 citas (pasadas + futuras, distintos estados)
 *   - 25 movimientos de inventario (entradas, salidas, ajustes)
 *   - 2 órdenes de compra (1 entregada, 1 aprobada en tránsito)
 *   - 40 transacciones financieras VERA (2 meses de operación)
 *   - 18 interacciones CRM con pacientes
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env['DATABASE_URL'] } },
})

function daysAgo(n: number) { return new Date(Date.now() - n * 86400_000) }
function daysFromNow(n: number) { return new Date(Date.now() + n * 86400_000) }
function dateAt(daysOffset: number, h: number, m = 0) {
  const d = new Date(Date.now() + daysOffset * 86400_000)
  d.setHours(h, m, 0, 0)
  return d
}

async function main() {
  console.log('\n🦷 Cargando actividad operativa — Clínica Dental Sonrisa Perfecta\n')

  // ── Cargar IDs existentes ───────────────────────────────────────────────────
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'sonrisa-perfecta' } })
  if (!tenant) throw new Error('Tenant no encontrado. Ejecuta seed-dental.ts primero.')

  const branches    = await prisma.branch.findMany({ where: { tenantId: tenant.id } })
  const branchNorte = branches.find(b => b.name === 'Sede Norte')!
  const branchSur   = branches.find(b => b.name === 'Sede Sur')!

  const users       = await prisma.user.findMany({ where: { tenantId: tenant.id } })
  const admin       = users.find(u => u.email === 'admin@sonrisaperfecta.co')!
  const dentNorte   = users.find(u => u.email === 'dentista.norte@sonrisaperfecta.co')!
  const dentSur     = users.find(u => u.email === 'dentista.sur@sonrisaperfecta.co')!
  const recepNorte  = users.find(u => u.email === 'recepcion.norte@sonrisaperfecta.co')!
  const inventario  = users.find(u => u.email === 'inventario@sonrisaperfecta.co')!
  const compras     = users.find(u => u.email === 'compras@sonrisaperfecta.co')!
  const crmUser     = users.find(u => u.email === 'crm@sonrisaperfecta.co')!

  const clients     = await prisma.client.findMany({ where: { tenantId: tenant.id } })
  const services    = await prisma.serviceType.findMany({ where: { tenantId: tenant.id } })
  const products    = await prisma.product.findMany({ where: { tenantId: tenant.id } })
  const deals       = await prisma.deal.findMany({ where: { tenantId: tenant.id } })
  const categories  = await prisma.transactionCategory.findMany({ where: { tenantId: tenant.id } })
  const suppliers   = await prisma.supplier.findMany({ where: { tenantId: tenant.id } })

  const svcConsulta   = services.find(s => s.name.includes('Consulta y valoración'))!
  const svcLimpieza   = services.find(s => s.name.includes('Limpieza'))!
  const svcObtura1    = services.find(s => s.name.includes('1 cara'))!
  const svcObtura2    = services.find(s => s.name.includes('2-3 caras'))!
  const svcExtraccion = services.find(s => s.name.includes('Extracción'))!
  const svcEndodoncia = services.find(s => s.name.includes('Endodoncia'))!
  const svcBlanq      = services.find(s => s.name.includes('Blanqueamiento'))!
  const svcOrtodoncia = services.find(s => s.name.includes('ortodoncia'))!

  const catConsultas  = categories.find(c => c.name === 'Consultas y honorarios')!
  const catServicios  = categories.find(c => c.name === 'Servicios odontológicos')!
  const catConvenios  = categories.find(c => c.name === 'Convenios y seguros')!
  const catInsumos    = categories.find(c => c.name === 'Compra de insumos')!
  const catNomina     = categories.find(c => c.name === 'Nómina y honorarios')!
  const catArriendo   = categories.find(c => c.name === 'Arriendo sedes')!
  const catServicios2 = categories.find(c => c.name === 'Servicios públicos')!
  const catMtto       = categories.find(c => c.name === 'Mantenimiento equipos')!

  const prodCompoA2   = products.find(p => p.sku === 'COMP-A2-4G')!
  const prodCompoA3   = products.find(p => p.sku === 'COMP-A3-4G')!
  const prodAnes      = products.find(p => p.sku === 'ANES-LIDO-1.8')!
  const prodGuantes   = products.find(p => p.sku === 'GUANTES-M-100')!
  const prodBaberos   = products.find(p => p.sku === 'BABEROS-2PLY')!
  const prodHipoclo   = products.find(p => p.sku === 'HIPOCLORITO')!
  const prodLimas     = products.find(p => p.sku === 'LIMA-K-15-25')!
  const prodGutaperch = products.find(p => p.sku === 'GUTAPERCHA-25')!
  const prodAlginato  = products.find(p => p.sku === 'ALGINATO-500')!
  const prodBlanq     = products.find(p => p.sku === 'BLAN-LAMP-35')!
  const prodTapabocas = products.find(p => p.sku === 'TAPABOCAS-N95')!
  const provDental    = suppliers.find(s => s.name.includes('Dental Colombia'))!
  const provOrtho     = suppliers.find(s => s.name.includes('Ortho Medic'))!

  // ── 1. CITAS ──────────────────────────────────────────────────────────────
  console.log('📅 Creando citas...')

  const appointmentsData = [
    // ── Citas pasadas completadas ─────────────────────────────────────────
    { c: 0,  svc: svcConsulta,   prof: dentNorte, branch: branchNorte, offsetDays: -30, hour: 8,  min: 0,  status: 'completed',  notes: 'Primera consulta. Diagnóstico: caries múltiples + gingivitis. Plan de tratamiento explicado.' },
    { c: 0,  svc: svcObtura1,    prof: dentNorte, branch: branchNorte, offsetDays: -22, hour: 9,  min: 0,  status: 'completed',  notes: 'Obturación #12 cara oclusal. Anestesia lidocaína. Sin complicaciones.' },
    { c: 1,  svc: svcLimpieza,   prof: dentNorte, branch: branchNorte, offsetDays: -28, hour: 10, min: 0,  status: 'completed',  notes: 'Profilaxis completa. Sangrado moderado en zona 24-26. Refuerzo de técnica de cepillado.' },
    { c: 2,  svc: svcBlanq,      prof: dentNorte, branch: branchNorte, offsetDays: -25, hour: 14, min: 0,  status: 'completed',  notes: 'Blanqueamiento en consultorio 35%. 2 ciclos de 15 min. Resultado: 6 tonos más claro.' },
    { c: 3,  svc: svcConsulta,   prof: dentNorte, branch: branchNorte, offsetDays: -20, hour: 8,  min: 30, status: 'completed',  notes: 'Valoración ortodoncia. Maloclusión clase II. Recomendado tratamiento 18 meses.' },
    { c: 4,  svc: svcExtraccion, prof: dentNorte, branch: branchNorte, offsetDays: -18, hour: 9,  min: 30, status: 'completed',  notes: 'Extracción #48 (muela de juicio). Sin complicaciones. Sutura reabsorbible.' },
    { c: 5,  svc: svcLimpieza,   prof: dentNorte, branch: branchNorte, offsetDays: -15, hour: 11, min: 0,  status: 'completed',  notes: 'Control semestral. Excelente higiene. Sin caries nuevas.' },
    { c: 6,  svc: svcObtura2,    prof: dentNorte, branch: branchNorte, offsetDays: -14, hour: 14, min: 30, status: 'completed',  notes: 'Obturación #36 cara mesio-oclusal-distal. Restauración directa en resina.' },
    { c: 7,  svc: svcEndodoncia, prof: dentNorte, branch: branchNorte, offsetDays: -12, hour: 8,  min: 0,  status: 'completed',  notes: 'Endodoncia #14. Conductometría: 21mm. Obturación con gutapercha y AH Plus.' },
    { c: 8,  svc: svcConsulta,   prof: dentSur,   branch: branchSur,   offsetDays: -27, hour: 9,  min: 0,  status: 'completed',  notes: 'Paciente nuevo sede sur. Bruxismo severo. Indicada férula de descarga.' },
    { c: 9,  svc: svcObtura1,    prof: dentSur,   branch: branchSur,   offsetDays: -19, hour: 10, min: 0,  status: 'completed',  notes: 'Obturación #11 cara vestibular. Fractura por trauma. Resina A1.' },
    { c: 10, svc: svcLimpieza,   prof: dentSur,   branch: branchSur,   offsetDays: -10, hour: 14, min: 0,  status: 'completed',  notes: 'Control post-extracción #38. Cicatrización normal.' },
    // ── Citas no asistió ──────────────────────────────────────────────────
    { c: 11, svc: svcConsulta,   prof: dentNorte, branch: branchNorte, offsetDays: -8,  hour: 9,  min: 0,  status: 'no_show',    notes: 'No se presentó. Llamada sin respuesta. Reagendar.' },
    { c: 12, svc: svcObtura1,    prof: dentSur,   branch: branchSur,   offsetDays: -6,  hour: 11, min: 0,  status: 'no_show',    notes: 'No asistió. Reportó enfermedad por WhatsApp.' },
    // ── Citas canceladas ──────────────────────────────────────────────────
    { c: 13, svc: svcBlanq,      prof: dentNorte, branch: branchNorte, offsetDays: -5,  hour: 14, min: 0,  status: 'cancelled',  notes: 'Cancelada por paciente. Viaje de trabajo.' },
    // ── Citas confirmadas próximas ────────────────────────────────────────
    { c: 0,  svc: svcOrtodoncia, prof: dentNorte, branch: branchNorte, offsetDays: 1,   hour: 8,  min: 0,  status: 'confirmed',  notes: 'Primera cita de ortodoncia. Toma de impresiones.' },
    { c: 1,  svc: svcLimpieza,   prof: dentNorte, branch: branchNorte, offsetDays: 1,   hour: 10, min: 0,  status: 'confirmed',  notes: 'Control semestral programado.' },
    { c: 4,  svc: svcLimpieza,   prof: dentNorte, branch: branchNorte, offsetDays: 2,   hour: 9,  min: 0,  status: 'confirmed',  notes: 'Profilaxis post-extracción #48.' },
    { c: 7,  svc: svcConsulta,   prof: dentNorte, branch: branchNorte, offsetDays: 2,   hour: 14, min: 30, status: 'confirmed',  notes: 'Valoración corona sobre endodoncia #14.' },
    { c: 14, svc: svcBlanq,      prof: dentNorte, branch: branchNorte, offsetDays: 3,   hour: 9,  min: 0,  status: 'confirmed',  notes: 'Blanqueamiento en consultorio. Vino por Instagram.' },
    { c: 2,  svc: svcConsulta,   prof: dentNorte, branch: branchNorte, offsetDays: 4,   hour: 14, min: 0,  status: 'scheduled',  notes: 'Valoración carillas de porcelana.' },
    { c: 5,  svc: svcExtraccion, prof: dentSur,   branch: branchSur,   offsetDays: 5,   hour: 8,  min: 30, status: 'scheduled',  notes: '' },
    { c: 9,  svc: svcLimpieza,   prof: dentSur,   branch: branchSur,   offsetDays: 5,   hour: 11, min: 0,  status: 'scheduled',  notes: '' },
    { c: 15, svc: svcConsulta,   prof: dentNorte, branch: branchNorte, offsetDays: 7,   hour: 8,  min: 0,  status: 'scheduled',  notes: 'Reevaluación férula de descarga.' },
    { c: 16, svc: svcConsulta,   prof: dentNorte, branch: branchNorte, offsetDays: 7,   hour: 10, min: 0,  status: 'scheduled',  notes: 'Paciente nuevo llegó por publicidad Instagram.' },
    { c: 17, svc: svcConsulta,   prof: dentNorte, branch: branchNorte, offsetDays: 10,  hour: 9,  min: 0,  status: 'scheduled',  notes: 'Discutir plan implante #24.' },
    { c: 3,  svc: svcOrtodoncia, prof: dentNorte, branch: branchNorte, offsetDays: 12,  hour: 14, min: 0,  status: 'scheduled',  notes: 'Seguimiento ortodoncia mes 3.' },
    { c: 6,  svc: svcLimpieza,   prof: dentSur,   branch: branchSur,   offsetDays: 14,  hour: 8,  min: 30, status: 'scheduled',  notes: '' },
    { c: 18, svc: svcConsulta,   prof: dentNorte, branch: branchNorte, offsetDays: 15,  hour: 10, min: 0,  status: 'scheduled',  notes: 'Primera cita convenio empresarial.' },
    { c: 19, svc: svcConsulta,   prof: dentNorte, branch: branchNorte, offsetDays: 18,  hour: 14, min: 30, status: 'scheduled',  notes: 'Pediatría — primera visita.' },
  ]

  for (const a of appointmentsData) {
    const client = clients[a.c]!
    const startAt = dateAt(a.offsetDays, a.hour, a.min)
    const endAt   = new Date(startAt.getTime() + a.svc.durationMinutes * 60_000)
    await prisma.appointment.create({
      data: {
        tenantId:       tenant.id,
        branchId:       a.branch.id,
        clientId:       client.id,
        serviceTypeId:  a.svc.id,
        professionalId: a.prof.id,
        clientName:     client.name,
        clientPhone:    client.phone ?? undefined,
        clientEmail:    client.email ?? undefined,
        startAt,
        endAt,
        status:   a.status,
        notes:    a.notes || undefined,
        channel:  'manual',
      },
    })
  }
  console.log(`  ✅ ${appointmentsData.length} citas creadas (completadas, confirmadas, programadas)`)

  // ── 2. MOVIMIENTOS DE INVENTARIO ──────────────────────────────────────────
  console.log('📦 Creando movimientos de inventario...')

  type Movement = {
    product: typeof prodCompoA2,
    branch: typeof branchNorte,
    type: string,
    qty: number,
    before: number,
    notes?: string,
    lotNumber?: string,
  }

  const movements: Movement[] = [
    // Entradas por recepción de compra (hace ~25 días)
    { product: prodAnes,     branch: branchNorte, type: 'entrada', qty: 10, before: 3,  notes: 'Recepción OC-2026-001 Dental Colombia', lotNumber: 'LC2026-04A' },
    { product: prodCompoA2,  branch: branchNorte, type: 'entrada', qty: 8,  before: 2,  notes: 'Recepción OC-2026-001 Dental Colombia', lotNumber: 'Z350-A2-026' },
    { product: prodCompoA3,  branch: branchNorte, type: 'entrada', qty: 8,  before: 2,  notes: 'Recepción OC-2026-001 Dental Colombia', lotNumber: 'Z350-A3-026' },
    { product: prodGuantes,  branch: branchNorte, type: 'entrada', qty: 6,  before: 4,  notes: 'Recepción OC-2026-001 Casa Dental',     lotNumber: 'NG-MED-0426' },
    { product: prodTapabocas,branch: branchNorte, type: 'entrada', qty: 5,  before: 2,  notes: 'Recepción OC-2026-001 Casa Dental',     lotNumber: 'N95-0426' },
    { product: prodBaberos,  branch: branchNorte, type: 'entrada', qty: 4,  before: 2,  notes: 'Recepción OC-2026-001 Casa Dental' },
    // Salidas por uso en consulta (últimas semanas)
    { product: prodAnes,     branch: branchNorte, type: 'salida',  qty: 3,  before: 13, notes: 'Uso semanal consultas' },
    { product: prodCompoA2,  branch: branchNorte, type: 'salida',  qty: 2,  before: 10, notes: 'Obturaciones semana 1' },
    { product: prodCompoA3,  branch: branchNorte, type: 'salida',  qty: 3,  before: 10, notes: 'Obturaciones semana 1-2' },
    { product: prodGuantes,  branch: branchNorte, type: 'salida',  qty: 2,  before: 10, notes: 'Consumo mensual' },
    { product: prodBaberos,  branch: branchNorte, type: 'salida',  qty: 1,  before: 6,  notes: 'Consumo mensual' },
    { product: prodHipoclo,  branch: branchNorte, type: 'salida',  qty: 2,  before: 8,  notes: 'Uso procedimientos endodoncia' },
    { product: prodLimas,    branch: branchNorte, type: 'salida',  qty: 3,  before: 15, notes: 'Uso endodoncia x3 pacientes' },
    { product: prodGutaperch,branch: branchNorte, type: 'salida',  qty: 2,  before: 10, notes: 'Obturaciones de conducto' },
    { product: prodBlanq,    branch: branchNorte, type: 'salida',  qty: 2,  before: 7,  notes: 'Blanqueamiento x2 pacientes esta semana' },
    { product: prodAlginato, branch: branchNorte, type: 'salida',  qty: 1,  before: 6,  notes: 'Impresiones ortodoncia' },
    // Movimientos sede sur
    { product: prodAnes,     branch: branchSur,   type: 'salida',  qty: 2,  before: 7,  notes: 'Uso semanal sede sur' },
    { product: prodGuantes,  branch: branchSur,   type: 'salida',  qty: 2,  before: 7,  notes: 'Consumo mensual sede sur' },
    { product: prodCompoA2,  branch: branchSur,   type: 'salida',  qty: 2,  before: 7,  notes: 'Obturaciones sede sur' },
    // Ajuste inventario (conteo físico)
    { product: prodTapabocas,branch: branchSur,   type: 'ajuste',  qty: -1, before: 5,  notes: 'Ajuste por conteo físico — caja dañada' },
    { product: prodBaberos,  branch: branchSur,   type: 'ajuste',  qty: 1,  before: 3,  notes: 'Ajuste por conteo físico — caja encontrada en almacén' },
    // Entrada directa (compra de emergencia)
    { product: prodLimas,    branch: branchSur,   type: 'entrada', qty: 5,  before: 5,  notes: 'Compra directa emergencia — agotamiento',  lotNumber: 'K-FILES-0426' },
    { product: prodAnes,     branch: branchSur,   type: 'entrada', qty: 4,  before: 4,  notes: 'Traspaso desde sede norte',  lotNumber: 'LC2026-04A' },
    // Salidas recientes
    { product: prodHipoclo,  branch: branchSur,   type: 'salida',  qty: 1,  before: 6,  notes: 'Uso semanal endodoncia' },
    { product: prodLimas,    branch: branchSur,   type: 'salida',  qty: 2,  before: 10, notes: 'Uso endodoncia' },
  ]

  for (const m of movements) {
    const after = m.before + m.qty
    await prisma.stockMovement.create({
      data: {
        tenantId:       tenant.id,
        productId:      m.product.id,
        branchId:       m.branch.id,
        userId:         inventario.id,
        type:           m.type,
        quantity:       Math.abs(m.qty),
        quantityBefore: m.before,
        quantityAfter:  after,
        notes:          m.notes,
        lotNumber:      m.lotNumber,
      },
    })
  }
  console.log(`  ✅ ${movements.length} movimientos de inventario creados`)

  // ── 3. ÓRDENES DE COMPRA ──────────────────────────────────────────────────
  console.log('🛒 Creando órdenes de compra...')

  // OC-001 — Dental Colombia — ENTREGADA (hace 25 días)
  const oc1Items = [
    { product: prodAnes,    qty: 10, unitCost: 85000  },
    { product: prodCompoA2, qty: 8,  unitCost: 72000  },
    { product: prodCompoA3, qty: 8,  unitCost: 72000  },
  ]
  const oc1Subtotal = oc1Items.reduce((s, i) => s + i.qty * i.unitCost, 0)
  const oc1Tax      = Math.round(oc1Subtotal * 0.19)
  const oc1 = await prisma.purchaseOrder.create({
    data: {
      tenantId:        tenant.id,
      supplierId:      provDental.id,
      branchId:        branchNorte.id,
      createdBy:       compras.id,
      approvedBy:      admin.id,
      orderNumber:     'OC-2026-001',
      status:          'delivered',
      subtotal:        oc1Subtotal,
      tax:             oc1Tax,
      total:           oc1Subtotal + oc1Tax,
      expectedDelivery: daysAgo(26),
      deliveredAt:     daysAgo(25),
      notes:           'Reposición mensual de anestesia y resinas 3M.',
      items: {
        create: oc1Items.map(i => ({
          productId:        i.product.id,
          quantityOrdered:  i.qty,
          quantityReceived: i.qty,
          unitCost:         i.unitCost,
          total:            i.qty * i.unitCost,
        })),
      },
    },
  })

  // OC-002 — Ortho Medic — APROBADA, en tránsito
  const oc2Items = [
    { product: products.find(p => p.sku === 'BRACKET-MBT-22')!,  qty: 20, unitCost: 48000 },
    { product: products.find(p => p.sku === 'ALAMBRE-NITI-16')!,  qty: 15, unitCost: 15000 },
    { product: products.find(p => p.sku === 'BANDAS-MOLAR')!,     qty: 10, unitCost: 35000 },
  ]
  const oc2Subtotal = oc2Items.reduce((s, i) => s + i.qty * i.unitCost, 0)
  const oc2Tax      = Math.round(oc2Subtotal * 0.19)
  await prisma.purchaseOrder.create({
    data: {
      tenantId:        tenant.id,
      supplierId:      provOrtho.id,
      branchId:        branchNorte.id,
      createdBy:       compras.id,
      approvedBy:      admin.id,
      orderNumber:     'OC-2026-002',
      status:          'sent',
      subtotal:        oc2Subtotal,
      tax:             oc2Tax,
      total:           oc2Subtotal + oc2Tax,
      expectedDelivery: daysFromNow(5),
      notes:           'Reposición materiales ortodoncia. Inicio 4 nuevos casos.',
      items: {
        create: oc2Items.map(i => ({
          productId:        i.product.id,
          quantityOrdered:  i.qty,
          quantityReceived: 0,
          unitCost:         i.unitCost,
          total:            i.qty * i.unitCost,
        })),
      },
    },
  })
  console.log('  ✅ 2 órdenes de compra creadas (OC-2026-001 entregada, OC-2026-002 en tránsito)')

  // ── 4. TRANSACCIONES FINANCIERAS (VERA) ────────────────────────────────────
  console.log('💰 Creando transacciones financieras...')

  type Tx = {
    type: 'INCOME' | 'EXPENSE',
    amount: number,
    description: string,
    cat: typeof catConsultas,
    daysOffset: number,
    branch?: typeof branchNorte,
    isManual?: boolean,
  }

  const txs: Tx[] = [
    // ── INGRESOS por servicios clínicos ──────────────────────────────────
    { type: 'INCOME',  amount: 50000,   description: 'Consulta valoración — Alejandro García',         cat: catConsultas,  daysOffset: -30 },
    { type: 'INCOME',  amount: 120000,  description: 'Limpieza dental — María José Pérez',             cat: catServicios,  daysOffset: -28 },
    { type: 'INCOME',  amount: 350000,  description: 'Blanqueamiento — Carlos Muñoz',                   cat: catServicios,  daysOffset: -25, branch: branchNorte },
    { type: 'INCOME',  amount: 50000,   description: 'Consulta valoración ortodoncia — Laura Soto',    cat: catConsultas,  daysOffset: -20 },
    { type: 'INCOME',  amount: 130000,  description: 'Extracción #48 — Roberto Fernández',             cat: catServicios,  daysOffset: -18 },
    { type: 'INCOME',  amount: 120000,  description: 'Limpieza semestral — Ana Lucía Vargas',          cat: catServicios,  daysOffset: -15 },
    { type: 'INCOME',  amount: 220000,  description: 'Obturación 3 caras #36 — Diego Torres',         cat: catServicios,  daysOffset: -14 },
    { type: 'INCOME',  amount: 450000,  description: 'Endodoncia #14 — Valentina Cruz',               cat: catServicios,  daysOffset: -12, branch: branchNorte },
    { type: 'INCOME',  amount: 150000,  description: 'Obturación #11 — Andrés Cárdenas',              cat: catServicios,  daysOffset: -12, branch: branchSur },
    { type: 'INCOME',  amount: 50000,   description: 'Consulta — Camilo Estrada',                     cat: catConsultas,  daysOffset: -11 },
    { type: 'INCOME',  amount: 120000,  description: 'Limpieza — Felipe Gómez',                       cat: catServicios,  daysOffset: -10, branch: branchSur },
    { type: 'INCOME',  amount: 80000,   description: 'Consulta ortodoncia — Natalia Ospina',          cat: catConsultas,  daysOffset: -9  },
    { type: 'INCOME',  amount: 150000,  description: 'Obturación #12 — Alejandro García',             cat: catServicios,  daysOffset: -22 },
    { type: 'INCOME',  amount: 50000,   description: 'Consulta — Pilar Rodríguez',                    cat: catConsultas,  daysOffset: -8  },
    { type: 'INCOME',  amount: 120000,  description: 'Profilaxis — Sandra Patiño',                    cat: catServicios,  daysOffset: -7  },
    { type: 'INCOME',  amount: 50000,   description: 'Consulta — Jorge Ruiz',                         cat: catConsultas,  daysOffset: -6  },
    // ── INGRESOS convenio empresa ─────────────────────────────────────────
    { type: 'INCOME',  amount: 4000000, description: 'Pago inicial convenio corporativo — Empresa X', cat: catConvenios,  daysOffset: -5, branch: branchNorte, isManual: true },
    // ── EGRESOS por compras y operación ──────────────────────────────────
    { type: 'EXPENSE', amount: oc1Subtotal + oc1Tax, description: 'OC-2026-001 — Dental Colombia S.A.S.',   cat: catInsumos,    daysOffset: -25, isManual: false },
    { type: 'EXPENSE', amount: 380000,  description: 'Compra guantes nitrilo + tapabocas N95 — Casa Dental', cat: catInsumos,    daysOffset: -20, isManual: true },
    // ── EGRESOS nómina ────────────────────────────────────────────────────
    { type: 'EXPENSE', amount: 4500000, description: 'Honorarios Dra. Sofía Mendoza — Abril 2026',    cat: catNomina,     daysOffset: -2, isManual: true },
    { type: 'EXPENSE', amount: 3800000, description: 'Honorarios Dr. Andrés Castellanos — Abril 2026',cat: catNomina,     daysOffset: -2, isManual: true },
    { type: 'EXPENSE', amount: 3800000, description: 'Honorarios Dra. Valentina Torres — Abril 2026', cat: catNomina,     daysOffset: -2, branch: branchSur, isManual: true },
    { type: 'EXPENSE', amount: 2200000, description: 'Nómina recepcionistas Abril 2026 (x2)',          cat: catNomina,     daysOffset: -2, isManual: true },
    // ── EGRESOS arriendos ─────────────────────────────────────────────────
    { type: 'EXPENSE', amount: 3500000, description: 'Arriendo sede norte — Abril 2026',               cat: catArriendo,   daysOffset: -3, isManual: true },
    { type: 'EXPENSE', amount: 2800000, description: 'Arriendo sede sur — Abril 2026',                 cat: catArriendo,   daysOffset: -3, branch: branchSur, isManual: true },
    // ── EGRESOS servicios públicos y mantenimiento ────────────────────────
    { type: 'EXPENSE', amount: 420000,  description: 'Energía eléctrica sede norte — Marzo 2026',      cat: catServicios2, daysOffset: -10, isManual: true },
    { type: 'EXPENSE', amount: 380000,  description: 'Energía eléctrica sede sur — Marzo 2026',        cat: catServicios2, daysOffset: -10, branch: branchSur, isManual: true },
    { type: 'EXPENSE', amount: 85000,   description: 'Internet + teléfono sede norte — Marzo 2026',    cat: catServicios2, daysOffset: -9, isManual: true },
    { type: 'EXPENSE', amount: 950000,  description: 'Mantenimiento preventivo unidad dental #1',      cat: catMtto,       daysOffset: -15, isManual: true },
    { type: 'EXPENSE', amount: 350000,  description: 'Cambio punta de ultrasonido + autoclave',        cat: catMtto,       daysOffset: -8, isManual: true },
    // ── Ingresos del mes anterior ─────────────────────────────────────────
    { type: 'INCOME',  amount: 120000,  description: 'Limpieza — paciente sin registrar',              cat: catServicios,  daysOffset: -35, isManual: true },
    { type: 'INCOME',  amount: 50000,   description: 'Consulta valoración — paciente referido',        cat: catConsultas,  daysOffset: -33, isManual: true },
    { type: 'INCOME',  amount: 220000,  description: 'Obturación doble cara — paciente referido',      cat: catServicios,  daysOffset: -32, isManual: true },
    { type: 'INCOME',  amount: 130000,  description: 'Extracción simple — urgencia',                   cat: catServicios,  daysOffset: -31, isManual: true },
    { type: 'INCOME',  amount: 80000,   description: 'Consulta urgencia nocturna',                     cat: catConsultas,  daysOffset: -29, isManual: true },
    // EGRESOS mes anterior
    { type: 'EXPENSE', amount: 3500000, description: 'Arriendo sede norte — Marzo 2026',               cat: catArriendo,   daysOffset: -33, isManual: true },
    { type: 'EXPENSE', amount: 2800000, description: 'Arriendo sede sur — Marzo 2026',                 cat: catArriendo,   daysOffset: -33, branch: branchSur, isManual: true },
    { type: 'EXPENSE', amount: 4500000, description: 'Honorarios Dra. Sofía Mendoza — Marzo 2026',    cat: catNomina,     daysOffset: -32, isManual: true },
    { type: 'EXPENSE', amount: 3800000, description: 'Honorarios Dr. Andrés Castellanos — Marzo 2026',cat: catNomina,     daysOffset: -32, isManual: true },
    { type: 'EXPENSE', amount: 1950000, description: 'Compra insumos Marzo — RadiOdonto',              cat: catInsumos,    daysOffset: -30, isManual: true },
  ]

  for (const tx of txs) {
    await prisma.transaction.create({
      data: {
        tenantId:    tenant.id,
        branchId:    (tx.branch ?? branchNorte).id,
        categoryId:  tx.cat.id,
        type:        tx.type,
        amount:      tx.amount,
        description: tx.description,
        isManual:    tx.isManual ?? false,
        currency:    'COP',
        date:        daysAgo(-tx.daysOffset),
        category:    tx.cat.name,
      },
    })
  }
  console.log(`  ✅ ${txs.length} transacciones financieras creadas`)

  // ── 5. INTERACCIONES CRM ──────────────────────────────────────────────────
  console.log('💬 Creando interacciones CRM...')

  const interactions = [
    { clientIdx: 0,  dealIdx: 0, type: 'llamada',   dir: 'outbound', content: 'Llamada para confirmar inicio de tratamiento de ortodoncia. Paciente confirmó para el martes. Acordado abono inicial del 30%.' },
    { clientIdx: 0,  dealIdx: 0, type: 'whatsapp',  dir: 'inbound',  content: 'Hola buenas tardes! Ya hice la transferencia del abono. La confirmo con soporte mañana 🙏' },
    { clientIdx: 0,  dealIdx: 0, type: 'whatsapp',  dir: 'outbound', content: 'Perfecto Alejandro! Ya recibimos el comprobante. Te esperamos el martes a las 8am con la Dra. Sofía.' },
    { clientIdx: 2,  dealIdx: 1, type: 'email',     dir: 'inbound',  content: 'Estimada clínica, les escribo para confirmar que las carillas quedaron excelentes. Muy satisfecho con el resultado. Gracias al equipo.' },
    { clientIdx: 2,  dealIdx: 1, type: 'llamada',   dir: 'outbound', content: 'Llamada de seguimiento post-tratamiento. Cliente muy satisfecho. Solicitó referidos para 3 colegas.' },
    { clientIdx: 7,  dealIdx: 2, type: 'llamada',   dir: 'outbound', content: 'Llamada para informar que la corona está lista en el laboratorio. Cita confirmada para el próximo lunes.' },
    { clientIdx: 7,  dealIdx: 2, type: 'whatsapp',  dir: 'inbound',  content: 'Perfecto! El lunes a las 10am. Ya tengo agendado en mi calendario 👍' },
    { clientIdx: 14, dealIdx: 3, type: 'presencial',dir: 'inbound',  content: 'Reunión en consultorio. Se presentó presupuesto detallado para 8 carillas cerámicas. Valor total $7.200.000. Muy interesado pero solicita plazo de pago.' },
    { clientIdx: 14, dealIdx: 3, type: 'whatsapp',  dir: 'outbound', content: 'Dr. Mauricio, buenas tardes. Quedamos en revisar las opciones de financiación. Tenemos plan en 6 cuotas sin intereses con Bancolombia. ¿Le interesa?' },
    { clientIdx: 14, dealIdx: 3, type: 'whatsapp',  dir: 'inbound',  content: 'Sí me interesa mucho la opción de cuotas. ¿Me pueden enviar el formulario de crédito esta semana?' },
    { clientIdx: 17, dealIdx: 4, type: 'llamada',   dir: 'outbound', content: 'Llamada para informar resultados de tomografía. Hueso suficiente para implante. Programada cirugía para junio. Requiere abono del 40%.' },
    { clientIdx: 3,  dealIdx: 5, type: 'email',     dir: 'outbound', content: 'Estimada Laura, adjunto el presupuesto para tratamiento Invisalign 18 meses: $8.500.000 todo incluido. Recuerda que tenemos financiación.' },
    { clientIdx: 3,  dealIdx: 5, type: 'whatsapp',  dir: 'inbound',  content: 'Ay, es un poco más de lo que esperaba 😅 Déjenme consultarle a mis papás. ¿Puedo tener la respuesta la próxima semana?' },
    { clientIdx: 5,  dealIdx: 6, type: 'whatsapp',  dir: 'outbound', content: 'Ana Lucía, tu cita de control semestral es el próximo lunes 28 de abril a las 11am con Dr. Andrés. ¿La confirmamos? 😊' },
    { clientIdx: 5,  dealIdx: 6, type: 'whatsapp',  dir: 'inbound',  content: '¡Confirmada! Ahí estaré puntual 🙌' },
    { clientIdx: 18, dealIdx: 7, type: 'email',     dir: 'inbound',  content: 'Buenos días. Soy el encargado de bienestar de la empresa. Nos interesan sus servicios odontológicos para 15 empleados. ¿Pueden enviarnos propuesta de convenio?' },
    { clientIdx: 18, dealIdx: 7, type: 'email',     dir: 'outbound', content: 'Estimado Hernando, con gusto adjunto nuestra propuesta de convenio empresarial para 15 empleados: consultas, limpiezas y urgencias incluidas por $800.000/mes. Disponemos de horarios exclusivos para el grupo.' },
    { clientIdx: 18, dealIdx: 7, type: 'llamada',   dir: 'inbound',  content: 'Llamada del cliente. Aceptan la propuesta de convenio. Solicitaron contrato y procedimiento de afiliación. Pago primer mes realizado.' },
  ]

  for (const int of interactions) {
    const client = clients[int.clientIdx]!
    const deal   = int.dealIdx !== null ? deals[int.dealIdx] : undefined
    await prisma.interaction.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        dealId:   deal?.id,
        userId:   crmUser.id,
        type:     int.type,
        direction: int.dir,
        content:  int.content,
      },
    })
  }
  console.log(`  ✅ ${interactions.length} interacciones CRM creadas`)

  // ── RESUMEN ────────────────────────────────────────────────────────────────
  const totalIngresos = txs.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0)
  const totalEgresos  = txs.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0)

  console.log('\n' + '═'.repeat(60))
  console.log('🦷 Actividad operativa cargada exitosamente')
  console.log('═'.repeat(60))
  console.log(`  Citas:           ${appointmentsData.length} (${appointmentsData.filter(a => a.status === 'completed').length} completadas, ${appointmentsData.filter(a => ['confirmed','scheduled'].includes(a.status)).length} próximas)`)
  console.log(`  Movimientos:     ${movements.length} (inventario KIRA)`)
  console.log(`  Órdenes compra:  2 (OC-2026-001 entregada, OC-2026-002 en tránsito)`)
  console.log(`  Transacciones:   ${txs.length} | Ingresos: $${(totalIngresos/1e6).toFixed(1)}M | Egresos: $${(totalEgresos/1e6).toFixed(1)}M`)
  console.log(`  Interacciones:   ${interactions.length} (llamadas, WhatsApp, email)`)
  console.log('═'.repeat(60))
}

main()
  .catch(e => { console.error('\n❌ Error:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
