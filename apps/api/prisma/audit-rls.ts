/* HU-135 — Auditoría de aislamiento cross-tenant de las 32 tablas con RLS, bajo el rol
 * REAL nexor_app (NOSUPERUSER NOBYPASSRLS). BD temporal Railway (nunca prod). Cubre:
 *   catálogo (RLS enabled+forced + política) · lectura cross-tenant · escritura
 *   (UPDATE/DELETE/INSERT) cross-tenant · fail-safe sin contexto · concurrencia. */
import { PrismaClient, Prisma } from '@prisma/client'
import { execSync } from 'node:child_process'

const DIRECT = process.env['DIRECT_DATABASE_URL']!
const TMP = 'nexor_hu135_audit'
const tmpUrl = (() => { const u = new URL(DIRECT); u.pathname = '/' + TMP; return u.toString() })()
const REPO = execSync('git rev-parse --show-toplevel').toString().trim()
const run = (cmd: string) => execSync(cmd, { cwd: REPO, stdio: 'pipe', env: { ...process.env, DATABASE_URL: tmpUrl, DIRECT_DATABASE_URL: tmpUrl } })

const TABLES = [
  'branches','users','feature_flags','integrations','agent_logs','notifications','clients',
  'client_ratings','pipeline_stages','deals','interactions','quotes','products','stock_movements',
  'suppliers','purchase_orders','supplier_ratings','service_types','availability','appointments',
  'transactions','conversations','conversation_messages','bulk_upload_logs','chat_messages',
  'dashboard_daily_rollups',
  // HU-135-fix — 5 tablas restantes (cierre 26→31).
  'blocked_dates','appointment_cancel_tokens','transaction_categories','cost_centers','monthly_budgets',
  // HU-156 — recordatorios universales.
  'reminders',
] as const

async function seedTenant(db: PrismaClient, s: string): Promise<void> {
  const t = `t_${s}`, br = `br_${s}`, u = `u_${s}`, cl = `cl_${s}`, st = `st_${s}`, d = `d_${s}`
  const p = `p_${s}`, sp = `sp_${s}`, po = `po_${s}`, cv = `cv_${s}`
  const T = (h = 9) => new Date(`1970-01-01T0${h}:00:00.000Z`)
  await db.tenant.create({ data: { id: t, name: `T${s}`, slug: `audit-${s}` } })
  await db.branch.create({ data: { id: br, tenantId: t, name: 'B' } })
  await db.user.create({ data: { id: u, tenantId: t, branchId: br, email: `u_${s}@audit.test`, name: 'U', passwordHash: 'x', role: 'TENANT_ADMIN' } })
  await db.featureFlag.create({ data: { tenantId: t, module: 'KIRA', enabled: true } })
  await db.integration.create({ data: { tenantId: t, channel: 'WHATSAPP', identifier: `wa-${s}` } })
  await db.agentLog.create({ data: { tenantId: t, module: 'ARI', channel: 'test', inputMessage: 'x', toolDetails: {} } })
  await db.notification.create({ data: { tenantId: t, userId: u, type: 'x', title: 'x', message: 'x' } })
  await db.client.create({ data: { id: cl, tenantId: t, name: 'C' } })
  await db.pipelineStage.create({ data: { id: st, tenantId: t, name: 'New', order: 1 } })
  await db.product.create({ data: { id: p, tenantId: t, sku: 'SKU1', name: 'P' } })
  await db.supplier.create({ data: { id: sp, tenantId: t, name: 'S' } })
  await db.serviceType.create({ data: { id: `svc_${s}`, tenantId: t, name: 'Svc' } })
  await db.availability.create({ data: { tenantId: t, dayOfWeek: 1, startTime: T(9), endTime: T(5) } })
  await db.transaction.create({ data: { tenantId: t, type: 'income', amount: new Prisma.Decimal(100), description: 'x', date: new Date() } })
  await db.conversation.create({ data: { id: cv, tenantId: t, channel: 'WHATSAPP', senderIdentifier: `snd-${s}`, lastMessageAt: new Date() } })
  await db.conversationMessage.create({ data: { tenantId: t, conversationId: cv, direction: 'inbound', content: 'x', timestamp: new Date() } })
  await db.bulkUploadLog.create({ data: { tenantId: t, userId: u, type: 'products', fileName: 'f', status: 'success' } })
  await db.chatMessage.create({ data: { tenantId: t, userId: u, role: 'user', content: 'x' } })
  await db.dashboardDailyRollup.create({ data: { tenantId: t, date: new Date() } })
  await db.deal.create({ data: { id: d, tenantId: t, clientId: cl, stageId: st, title: 'D' } })
  await db.interaction.create({ data: { tenantId: t, clientId: cl, type: 'note', direction: 'outbound', content: 'x' } })
  await db.quote.create({ data: { tenantId: t, clientId: cl, createdBy: u, quoteNumber: `Q-${s}` } })
  await db.clientRating.create({ data: { tenantId: t, clientId: cl, dealId: d, rating: 5, ratedBy: u } })
  await db.stockMovement.create({ data: { tenantId: t, productId: p, branchId: br, type: 'entrada', quantity: new Prisma.Decimal(1), quantityBefore: new Prisma.Decimal(0), quantityAfter: new Prisma.Decimal(1) } })
  await db.purchaseOrder.create({ data: { id: po, tenantId: t, createdBy: u, orderNumber: `PO-${s}` } })
  await db.supplierRating.create({ data: { tenantId: t, supplierId: sp, purchaseOrderId: po, deliveryRating: 5, qualityRating: 5, ratedBy: u } })
  await db.appointment.create({ data: { id: `ap_${s}`, tenantId: t, branchId: br, clientName: 'C', startAt: new Date(), endAt: new Date(Date.now() + 3600e3) } })
  // HU-135-fix — 5 tablas restantes
  await db.blockedDate.create({ data: { tenantId: t, branchId: br, date: new Date() } })
  await db.appointmentCancelToken.create({ data: { token: `tok-${s}`, tenantId: t, appointmentId: `ap_${s}`, expiresAt: new Date(Date.now() + 3600e3) } })
  await db.transactionCategory.create({ data: { tenantId: t, name: 'Cat', type: 'income' } })
  await db.costCenter.create({ data: { tenantId: t, name: 'CC' } })
  await db.monthlyBudget.create({ data: { tenantId: t, year: 2026, month: 1, amount: new Prisma.Decimal(1000) } })
  await db.reminder.create({ data: { tenantId: t, userId: u, title: 'R', remindAt: new Date() } })
}

async function main(): Promise<void> {
  const admin = new PrismaClient({ datasources: { db: { url: DIRECT } } })
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${TMP} WITH (FORCE)`).catch(()=>{})
  await admin.$executeRawUnsafe(`CREATE DATABASE ${TMP}`)
  await admin.$disconnect()
  console.log('== BD temporal creada · migrando + RLS ==')
  run('pnpm --filter @nexor/api exec prisma migrate deploy')
  run('pnpm --filter @nexor/api exec tsx prisma/setup-rls.ts')

  const db = new PrismaClient({ datasources: { db: { url: tmpUrl } } })
  // Usa el rol REAL de producción `nexor_app` (existe en el cluster). NO se toca su
  // definición ni sus grants en prod; solo se le otorgan privilegios en la BD temporal.
  const rc = await db.$queryRawUnsafe<{ rolsuper: boolean; rolbypassrls: boolean }[]>(
    `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='nexor_app'`)
  if (!rc.length) throw new Error('El rol nexor_app no existe en el cluster')
  if (rc[0]!.rolsuper || rc[0]!.rolbypassrls) throw new Error('nexor_app es superuser/bypassrls — auditoría inválida')
  console.log(`   rol nexor_app → superuser=${rc[0]!.rolsuper}  bypassrls=${rc[0]!.rolbypassrls}  (RLS aplica ✅)`)
  await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO nexor_app`)
  await db.$executeRawUnsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO nexor_app`)
  console.log(`== sembrando 2 tenants (A, B) en las ${TABLES.length} tablas ==`)
  await seedTenant(db, 'a')
  await seedTenant(db, 'b')

  const A = 't_a', B = 't_b'
  // ── Auditoría de catálogo: RLS enabled+forced + política tenant_isolation ──
  const cat = await db.$queryRawUnsafe<{ relname: string; en: boolean; force: boolean; pol: number }[]>(`
    SELECT c.relname, c.relrowsecurity AS en, c.relforcerowsecurity AS force,
           (SELECT count(*)::int FROM pg_policy pp WHERE pp.polrelid=c.oid AND pp.polname='tenant_isolation') AS pol
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname = ANY($1::text[])`, TABLES as unknown as string[])
  const catMap = new Map(cat.map(r => [r.relname, r]))

  // ── Comportamiento bajo nexor_app (SET LOCAL ROLE + contexto) ──
  const results: Record<string, { own: number; crossR: number; crossU: number; noCtx: number; cat: string }> = {}
  for (const table of TABLES) {
    // contexto A: total propio, lectura cross a B, update cross a B (filas afectadas)
    const [own, crossR, crossU] = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE nexor_app`)
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${A}', true)`)
      const o = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int n FROM ${table}`)
      const c = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int n FROM ${table} WHERE tenant_id='${B}'`)
      const u = await tx.$executeRawUnsafe(`UPDATE ${table} SET id=id WHERE tenant_id='${B}'`)
      return [o[0]!.n, c[0]!.n, u as number]
    })
    // sin contexto: fail-safe
    const noCtx = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE nexor_app`)
      const n = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int n FROM ${table}`)
      return n[0]!.n
    })
    const cr = catMap.get(table)
    const catOk = cr && cr.en && cr.force && cr.pol === 1
    results[table] = { own, crossR, crossU, noCtx, cat: catOk ? 'ok' : `en=${cr?.en} force=${cr?.force} pol=${cr?.pol}` }
  }

  // ── Escritura cross-INSERT (WITH CHECK) en tablas representativas ──
  async function insertCross(sql: string): Promise<string> {
    try {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE nexor_app`)
        await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${A}', true)`)
        await tx.$executeRawUnsafe(sql)
      })
      return 'PERMITIDO ❌'
    } catch { return 'bloqueado ✅' }
  }
  const insClients = await insertCross(`INSERT INTO clients (id,tenant_id,name,updated_at) VALUES ('hack1','${B}','H',now())`)
  const insProducts = await insertCross(`INSERT INTO products (id,tenant_id,sku,name,updated_at) VALUES ('hack2','${B}','HK','H',now())`)
  const insUsers = await insertCross(`INSERT INTO users (id,tenant_id,email,name,password_hash,role,updated_at) VALUES ('hack3','${B}','h@x','H','x','TENANT_ADMIN',now())`)

  // ── Concurrencia: 30 tx en paralelo alternando contexto A/B ──
  const conc = await Promise.all(Array.from({ length: 30 }, (_, i) => {
    const tid = i % 2 === 0 ? A : B
    const other = i % 2 === 0 ? B : A
    return db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE nexor_app`)
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tid}', true)`)
      const own = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int n FROM clients`)
      const cross = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int n FROM clients WHERE tenant_id='${other}'`)
      return own[0]!.n === 1 && cross[0]!.n === 0
    }, { maxWait: 30_000, timeout: 20_000 })
  }))
  const concOk = conc.every(Boolean)

  // ── Veredicto ──
  console.log(`\n══════════ VEREDICTO POR TABLA (${TABLES.length} con RLS · rol nexor_app) ══════════`)
  console.log('tabla'.padEnd(26), 'propio', 'leeB', 'updB', 'sinCtx', 'catálogo', 'veredicto')
  let fails = 0
  for (const table of TABLES) {
    const r = results[table]!
    const ok = r.own === 1 && r.crossR === 0 && r.crossU === 0 && r.noCtx === 0 && r.cat === 'ok'
    if (!ok) fails++
    console.log(
      table.padEnd(26),
      String(r.own).padEnd(6), String(r.crossR).padEnd(4), String(r.crossU).padEnd(4),
      String(r.noCtx).padEnd(6), r.cat.padEnd(8), ok ? '✅ AISLADA' : '❌ RIESGO',
    )
  }
  console.log('──────────────────────────────────────────────────────────────────────')
  console.log(`INSERT cross-tenant clients:  ${insClients}`)
  console.log(`INSERT cross-tenant products: ${insProducts}`)
  console.log(`INSERT cross-tenant users:    ${insUsers}`)
  console.log(`Concurrencia (30 tx A/B en paralelo, sin cruce): ${concOk ? '✅' : '❌'}`)
  console.log(`\nRESULTADO: ${fails === 0 && concOk ? `✅ ${TABLES.length}/${TABLES.length} AISLADAS — sin fuga cross-tenant` : `❌ ${fails} tabla(s) con riesgo`}`)

  await db.$disconnect()
  const admin2 = new PrismaClient({ datasources: { db: { url: DIRECT } } })
  await admin2.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${TMP} WITH (FORCE)`)
  await admin2.$disconnect()
  console.log('BD temporal eliminada.')
}
main().catch((e) => { console.error('ERROR', e); process.exit(1) })
