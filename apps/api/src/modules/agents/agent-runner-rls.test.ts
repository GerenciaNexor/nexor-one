import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type * as PrismaLib from '../../lib/prisma'
import type * as AgentRunner from './agent.runner'

/**
 * COBERTURA — camino worker → AgentRunner bajo el rol REAL `nexor_app` con RLS activo.
 *
 * ── Cobertura PREVIA (antes de este archivo) ──────────────────────────────────
 * Los únicos tests que tocaban el agente eran unitarios y MOCKEABAN `../../lib/prisma`
 * (saltando Postgres/RLS/ALS):
 *   - `tenant-context.test.ts`   — mock de withTenantContext (filtra un array en JS, simula RLS).
 *   - `agent-log-save.test.ts`   — mock de prisma/withTenantContext (verifica que saveLog use
 *                                   withTenantContext, no el cliente crudo). No hay DB real.
 * NINGÚN test ejercitaba `runAgent` completo, el bucle tool-use, las tools con DB real, ni
 * `runInTenantTransaction` bajo `nexor_app`. El aislamiento del agente NO estaba cubierto E2E.
 *
 * ── Hueco que llena este archivo ──────────────────────────────────────────────
 * Ejercita `runAgent` de punta a punta contra una BD TEMPORAL (migrate + setup-rls), con el LLM
 * de Anthropic MOCKEADO (para que pida ejecutar tools) pero la DB y las tools REALES, corriendo
 * como `nexor_app` (NOSUPERUSER/NOBYPASSRLS) → RLS de verdad. Cubre los 4 casos del piloto:
 *   1) tenant correcto · 2) aislamiento cross-tenant (crítico) · 3) tools en contexto · 4) fallo
 *   controlado sin dejar contexto de tenant colgado (riesgo de pooling de HU-122).
 *
 * Reutiliza el patrón de `prisma/audit-rls.ts` (BD temporal, guard anti-prod, seed A/B, nexor_app).
 * Se salta solo si el entorno no puede ejercitar RLS (DATABASE_URL debe ser un rol no-superuser
 * distinto de DIRECT_DATABASE_URL superuser); corre en CI en el job con `nexor_app` (e2e.yml).
 */

// ── Mock del LLM (hoisted): new Anthropic().messages.create → mockCreate ────────
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: mockCreate } },
}))

// ── Resolución de URLs (process.env primero; fallback a apps/api/.env local) ─────
// `pnpm --filter @nexor/api test` corre con cwd = apps/api.
const API_DIR = process.cwd()
function envUrl(key: string): string | undefined {
  if (process.env[key]) return process.env[key]
  try { return readFileSync(path.join(API_DIR, '.env'), 'utf8').match(new RegExp(`^${key}="?([^"\\n]+)"?`, 'm'))?.[1] } catch { return undefined }
}
const BASE_APP    = envUrl('DATABASE_URL')
const BASE_DIRECT = envUrl('DIRECT_DATABASE_URL')
const userOf = (u?: string): string => { try { return u ? new URL(u).username : '' } catch { return '' } }
// RLS real solo si DATABASE_URL corre como un rol DISTINTO (nexor_app, no-superuser) al DIRECT (superuser).
const RLS_CAPABLE = !!BASE_APP && !!BASE_DIRECT && userOf(BASE_APP) !== userOf(BASE_DIRECT)
if (!RLS_CAPABLE) console.warn('[agent-runner-rls] SKIP: requiere DATABASE_URL=nexor_app (no-superuser) y DIRECT_DATABASE_URL=superuser distintos; RLS no verificable aquí.')

const TMP_DB = 'nexor_agent_rls_test'
const withDb = (url: string, db: string): string => { const u = new URL(url); u.pathname = `/${db}`; return u.toString() }

// ── Runtime (import dinámico DESPUÉS de apuntar el env a la BD temporal) ─────────
let runAgent:               typeof AgentRunner.runAgent
let prisma:                 typeof PrismaLib.prisma
let directPrisma:           typeof PrismaLib.directPrisma
let runInTenantTransaction: typeof PrismaLib.runInTenantTransaction

const A = { tenant: 'ar_tA', branch: 'ar_bA', user: 'ar_uA', product: 'ar_pA' }
const B = { tenant: 'ar_tB', branch: 'ar_bB', user: 'ar_uB', product: 'ar_pB' }

// Respuestas del LLM mockeado (forma de Anthropic.Message).
const toolUse = (name: string, input: unknown, id = 'tu1') =>
  ({ id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'tool_use', id, name, input }] })
const endTurn = (text = 'Listo.') =>
  ({ id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text }] })

const stockOf = (productId: string, branchId: string) =>
  directPrisma.stock.findUnique({ where: { productId_branchId: { productId, branchId } }, select: { quantity: true } }).then((s) => Number(s?.quantity ?? -1))

const call = (tenantId: string, message: string, userId: string) =>
  runAgent({ tenantId, module: 'KIRA', channel: 'whatsapp', message, senderId: '573001112233', integrationId: 'int-x', userId })

async function seed(db: PrismaClient, ids: typeof A, p: { name: string; sku: string; stock: number }): Promise<void> {
  await db.tenant.create({ data: { id: ids.tenant, name: ids.tenant, slug: `ar-${ids.tenant}` } })
  await db.branch.create({ data: { id: ids.branch, tenantId: ids.tenant, name: 'Sede' } })
  await db.user.create({ data: { id: ids.user, tenantId: ids.tenant, branchId: ids.branch, email: `${ids.user}@t.test`, name: 'Admin', passwordHash: 'x', role: 'TENANT_ADMIN' } })
  await db.featureFlag.create({ data: { tenantId: ids.tenant, module: 'KIRA', enabled: true } }) // obligatorio o runAgent corta
  await db.product.create({ data: { id: ids.product, tenantId: ids.tenant, sku: p.sku, name: p.name, minStock: 2 } })
  await db.stock.create({ data: { productId: ids.product, branchId: ids.branch, quantity: p.stock } })
}

describe.skipIf(!RLS_CAPABLE)('worker → AgentRunner bajo nexor_app con RLS real', () => {
  const ENV_SNAPSHOT = { ...process.env } // para restaurar y no filtrar la URL temporal a otros tests

  beforeAll(async () => {
    const TMP_DIRECT = withDb(BASE_DIRECT!, TMP_DB)
    const TMP_APP    = withDb(BASE_APP!, TMP_DB)

    // 1. Crear BD temporal (superuser). Nunca prod.
    const admin = new PrismaClient({ datasources: { db: { url: BASE_DIRECT } } })
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${TMP_DB}" WITH (FORCE)`)
    await admin.$executeRawUnsafe(`CREATE DATABASE "${TMP_DB}"`)
    await admin.$disconnect()

    // 2. Migrar + aplicar RLS sobre la temporal.
    execSync('pnpm exec prisma migrate deploy', { cwd: API_DIR, env: { ...process.env, DATABASE_URL: TMP_DIRECT, DIRECT_DATABASE_URL: TMP_DIRECT }, stdio: 'ignore' })
    execSync('pnpm exec tsx prisma/setup-rls.ts', { cwd: API_DIR, env: { ...process.env, DATABASE_URL: TMP_APP, DIRECT_DATABASE_URL: TMP_DIRECT }, stdio: 'ignore' })

    // 3. Privilegios a nexor_app en la temporal + seed A/B (como superuser, bypass RLS).
    const su = new PrismaClient({ datasources: { db: { url: TMP_DIRECT } } })
    await su.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO nexor_app')
    await su.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexor_app')
    await su.$executeRawUnsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexor_app')
    await seed(su, A, { name: 'MartilloA', sku: 'SKU-A', stock: 10 })
    await seed(su, B, { name: 'TaladroB', sku: 'SKU-B', stock: 3 })
    await su.$disconnect()

    // 4. Apuntar el runtime a la temporal: DATABASE_URL como nexor_app (RLS), DIRECT superuser.
    process.env['DATABASE_URL']        = TMP_APP
    process.env['DIRECT_DATABASE_URL'] = TMP_DIRECT
    process.env['ANTHROPIC_API_KEY']   = 'sk-ant-test'
    delete process.env['CLAUDE_MODEL']

    const prismaMod = await import('../../lib/prisma')
    prisma = prismaMod.prisma; directPrisma = prismaMod.directPrisma; runInTenantTransaction = prismaMod.runInTenantTransaction
    runAgent = (await import('./agent.runner')).runAgent

    // GUARD anti-prod: confirmar BD temporal.
    const dbName = (await directPrisma.$queryRawUnsafe<{ d: string }[]>('SELECT current_database() d'))[0]!.d
    if (dbName !== TMP_DB) throw new Error(`ABORT: no es la BD temporal (${dbName})`)
    // GUARD: el rol de DATABASE_URL NO debe ser superuser/bypassrls (si no, RLS no aplicaría → test inválido).
    const role = (await prisma.$queryRawUnsafe<{ rolsuper: boolean; rolbypassrls: boolean }[]>('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'))[0]!
    if (role.rolsuper || role.rolbypassrls) throw new Error('DATABASE_URL corre como superuser/bypassrls — RLS no verificable')
  }, 300_000)

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => {})
    await directPrisma?.$disconnect().catch(() => {})
    const admin = new PrismaClient({ datasources: { db: { url: BASE_DIRECT } } })
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${TMP_DB}" WITH (FORCE)`)
    await admin.$disconnect()
    process.env['DATABASE_URL'] = ENV_SNAPSHOT['DATABASE_URL']
    process.env['DIRECT_DATABASE_URL'] = ENV_SNAPSHOT['DIRECT_DATABASE_URL']
  }, 120_000)

  beforeEach(() => { mockCreate.mockReset() })

  // ── CASO 1 — tenant correcto + auditoría ──────────────────────────────────────
  it('caso 1 — procesa el mensaje con el tenant correcto y lo audita en agent_logs', async () => {
    mockCreate
      .mockResolvedValueOnce(toolUse('consultar_stock', { productName: 'MartilloA' }))
      .mockResolvedValueOnce(endTurn('Tienes 10 unidades.'))

    const res = await call(A.tenant, '¿stock de MartilloA?', A.user)

    expect(res.fallbackReason).toBeUndefined()
    expect(res.toolsUsed).toContain('consultar_stock')
    const out = res.toolDetails.find((d) => d.tool === 'consultar_stock')?.output as { producto: string; cantidad: number }[]
    expect(Array.isArray(out)).toBe(true)
    expect(out[0]!.producto).toBe('MartilloA')
    expect(out[0]!.cantidad).toBe(10)

    // Auditoría: el agent_log quedó con el tenant correcto (escrito bajo nexor_app vía withTenantContext).
    const logs = await directPrisma.agentLog.findMany({ where: { tenantId: A.tenant } })
    expect(logs.length).toBeGreaterThanOrEqual(1)
    expect(logs.every((l) => l.tenantId === A.tenant)).toBe(true)
    expect(logs.some((l) => l.toolsUsed.includes('consultar_stock'))).toBe(true)
  }, 60_000)

  // ── CASO 2 — aislamiento cross-tenant (EL CRÍTICO) ────────────────────────────
  it('caso 2 — el agente de B no puede leer datos de A: ni por tool, ni por consulta, ni forzando IDs', async () => {
    // Vía agente: B pide el producto de A → no existe para B.
    mockCreate
      .mockResolvedValueOnce(toolUse('consultar_stock', { productName: 'MartilloA' }))
      .mockResolvedValueOnce(endTurn('No lo tengo.'))
    const res = await call(B.tenant, 'stock de MartilloA', B.user)
    const out = res.toolDetails.find((d) => d.tool === 'consultar_stock')?.output as Record<string, unknown>
    // B NO obtiene el stock de A: la tool responde "no encontrado", NO una lista con datos de A.
    // (El texto del error hace eco del término buscado — eso no es fuga; la fuga sería recibir la lista.)
    expect(Array.isArray(out)).toBe(false)
    expect(out).toHaveProperty('error')
    expect(out['cantidad']).toBeUndefined()   // nunca la forma de un registro de stock real

    // Vía la capa RLS que protege a las tools (mismo mecanismo runInTenantTransaction del runner):
    const aProducts = await runInTenantTransaction(A.tenant, () => prisma.product.findMany({ select: { name: true } }))
    const bProducts = await runInTenantTransaction(B.tenant, () => prisma.product.findMany({ select: { name: true } }))
    expect(aProducts.map((p) => p.name)).toEqual(['MartilloA'])
    expect(bProducts.map((p) => p.name)).toEqual(['TaladroB'])

    // Forzando el ID de A desde el contexto de B → RLS lo bloquea aunque no haya filtro de tenant.
    const forced = await runInTenantTransaction(B.tenant, () => prisma.product.findUnique({ where: { id: A.product } }))
    expect(forced).toBeNull()
  }, 60_000)

  // ── CASO 3 — tools en contexto de tenant + respetan el aislamiento en escritura ─
  it('caso 3 — las tools operan en el tenant del worker y una tool no puede tocar otro tenant', async () => {
    const before = await stockOf(A.product, A.branch)
    mockCreate
      .mockResolvedValueOnce(toolUse('registrar_movimiento', { productId: A.product, branchId: A.branch, tipo: 'ENTRADA', cantidad: 5 }))
      .mockResolvedValueOnce(endTurn('Registrado.'))
    const res = await call(A.tenant, 'ingresa 5 martillos', A.user)
    const out = res.toolDetails.find((d) => d.tool === 'registrar_movimiento')?.output as { success: boolean; stockNuevo: number }
    expect(out.success).toBe(true)
    expect(out.stockNuevo).toBe(before + 5)

    // El movimiento aterrizó en A (visible bajo el contexto de A) y B quedó intacto.
    const movs = await runInTenantTransaction(A.tenant, () => prisma.stockMovement.findMany({ where: { productId: A.product } }))
    expect(movs.length).toBeGreaterThanOrEqual(1)
    expect(await stockOf(A.product, A.branch)).toBe(before + 5)
    expect(await stockOf(B.product, B.branch)).toBe(3)

    // Cross-write: el agente de B intenta mover el producto de A (forzando su ID) → bloqueado.
    mockCreate.mockReset()
    mockCreate
      .mockResolvedValueOnce(toolUse('registrar_movimiento', { productId: A.product, branchId: B.branch, tipo: 'ENTRADA', cantidad: 1 }))
      .mockResolvedValueOnce(endTurn('No permitido.'))
    const res2 = await call(B.tenant, 'mueve el producto de A', B.user)
    const out2 = res2.toolDetails.find((d) => d.tool === 'registrar_movimiento')?.output
    expect(out2).toHaveProperty('error') // "Product not found in this tenant."
    expect(await stockOf(A.product, A.branch)).toBe(before + 5) // A intacto ante el intento de B
  }, 60_000)

  // ── CASO 4a — fallo controlado (API error): fallback sin throw + auditoría ──────
  it('caso 4a — si Claude falla, el runner degrada a fallback sin lanzar y auditando', async () => {
    const logsBefore = await directPrisma.agentLog.count({ where: { tenantId: A.tenant } })
    mockCreate.mockRejectedValue(new Error('API caída')) // falla siempre (agota los reintentos)

    const res = await call(A.tenant, 'hola', A.user)

    expect(res.fallbackReason).toBe('api_error') // no throw: se resolvió con fallback
    expect(res.reply).toBeTruthy()
    // El agent_log SIEMPRE se escribe (bajo nexor_app), con la marca de fallback.
    expect(await directPrisma.agentLog.count({ where: { tenantId: A.tenant } })).toBe(logsBefore + 1)
    const last = (await directPrisma.agentLog.findMany({ where: { tenantId: A.tenant }, orderBy: { createdAt: 'desc' }, take: 1 }))[0]!
    expect(JSON.stringify(last.toolDetails)).toContain('__fallback__')
  }, 60_000)

  // ── CASO 4b — un fallo no deja contexto de tenant colgado para el siguiente ─────
  it('caso 4b — un error de tool (rollback) no contamina el contexto del siguiente mensaje', async () => {
    // Run que FALLA con throw DENTRO de la tx de la tool (branch inexistente → FK → rollback).
    const aBefore = await stockOf(A.product, A.branch)
    mockCreate
      .mockResolvedValueOnce(toolUse('registrar_movimiento', { productId: A.product, branchId: 'no-existe', tipo: 'ENTRADA', cantidad: 99 }))
      .mockResolvedValueOnce(endTurn('ok'))
    const failRes = await call(A.tenant, 'movimiento malo', A.user)
    expect(failRes.toolDetails.find((d) => d.tool === 'registrar_movimiento')?.error).toBeTruthy() // la tool lanzó, el runner lo capturó
    expect(await stockOf(A.product, A.branch)).toBe(aBefore) // rollback: A sin cambios, sin movimiento fantasma

    // El SIGUIENTE mensaje (tenant B) se procesa limpio y ve SOLO datos de B — sin contexto residual.
    mockCreate.mockReset()
    mockCreate
      .mockResolvedValueOnce(toolUse('consultar_stock', { productName: 'TaladroB' }))
      .mockResolvedValueOnce(endTurn('3 unidades.'))
    const okRes = await call(B.tenant, 'stock de TaladroB', B.user)
    const okOut = okRes.toolDetails.find((d) => d.tool === 'consultar_stock')?.output as { producto: string; cantidad: number }[]
    expect(Array.isArray(okOut)).toBe(true)
    expect(okOut[0]!.producto).toBe('TaladroB')
    expect(okOut[0]!.cantidad).toBe(3)

    // Chequeo directo del pooling (riesgo HU-122): el contexto de B no arrastra app.current_tenant_id de A.
    const bOnly = await runInTenantTransaction(B.tenant, () => prisma.product.findMany({ select: { name: true } }))
    expect(bOnly.map((p) => p.name)).toEqual(['TaladroB'])
  }, 60_000)
})
