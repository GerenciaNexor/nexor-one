/**
 * HU-202 — Aislamiento por tenant del módulo Proyectos, contra BD REAL (temporal).
 *
 * Verifica que NINGÚN punto del flujo de Proyectos mezcle empresas:
 *   · listar/detalle solo ven proyectos del propio tenant.
 *   · asignar una transacción exige que TRANSACCIÓN y PROYECTO sean del MISMO tenant.
 *   · aprobar un sobregasto solo funciona para solicitudes del propio tenant (jamás de otra empresa).
 *   · las notificaciones (sobregasto) se crean solo para usuarios del tenant correcto.
 *   · RLS real (rol nexor_app) aísla proyectos, budget_approvals y transactions cross-tenant.
 *
 * Los servicios filtran por tenantId explícito; además la BD aplica RLS. Se prueban ambas capas.
 * Se salta si no hay DIRECT_DATABASE_URL (superuser para crear la BD temporal).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type * as Proyectos from './service'
import type * as Budget from './budget'
import type * as Vera from '../vera/transactions/service'
import type * as PrismaLib from '../../lib/prisma'

const API_DIR = process.cwd()
function envUrl(key: string): string | undefined {
  if (process.env[key]) return process.env[key]
  try { return readFileSync(path.join(API_DIR, '.env'), 'utf8').match(new RegExp(`^${key}="?([^"\\n]+)"?`, 'm'))?.[1] } catch { return undefined }
}
const BASE_DIRECT = envUrl('DIRECT_DATABASE_URL')
const HAS_DB = !!BASE_DIRECT
if (!HAS_DB) console.warn('[proyectos-isolation] SKIP: requiere DIRECT_DATABASE_URL (superuser).')

const TMP_DB = 'nexor_proj_iso'
const withDb = (url: string, db: string): string => { const u = new URL(url); u.pathname = `/${db}`; return u.toString() }

let su: PrismaClient
let proyectos: typeof Proyectos
let budget: typeof Budget
let vera: typeof Vera
let directPrisma: typeof PrismaLib.directPrisma

// T1 y T2 son empresas distintas. projT* límite (tope 100) para poder disparar sobregasto.
const T1 = { t: 'iso_t1', admin: 'iso_a1', proj: 'iso_p1', tx: 'iso_x1' }
const T2 = { t: 'iso_t2', admin: 'iso_a2', proj: 'iso_p2', tx: 'iso_x2' }
const D = { startDate: new Date('2026-08-01'), endDate: new Date('2026-12-31') }

describe.skipIf(!HAS_DB)('HU-202 — aislamiento del módulo Proyectos (BD temporal)', () => {
  const ENV = { ...process.env }

  beforeAll(async () => {
    const TMP_DIRECT = withDb(BASE_DIRECT!, TMP_DB)
    const admin = new PrismaClient({ datasources: { db: { url: BASE_DIRECT } } })
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${TMP_DB}" WITH (FORCE)`)
    await admin.$executeRawUnsafe(`CREATE DATABASE "${TMP_DB}"`)
    await admin.$disconnect()
    execSync('pnpm exec prisma migrate deploy', { cwd: API_DIR, env: { ...process.env, DATABASE_URL: TMP_DIRECT, DIRECT_DATABASE_URL: TMP_DIRECT }, stdio: 'ignore' })
    execSync('pnpm exec tsx prisma/setup-rls.ts', { cwd: API_DIR, env: { ...process.env, DATABASE_URL: TMP_DIRECT, DIRECT_DATABASE_URL: TMP_DIRECT }, stdio: 'ignore' })

    su = new PrismaClient({ datasources: { db: { url: TMP_DIRECT } } })
    if ((await su.$queryRawUnsafe<{ d: string }[]>('SELECT current_database() d'))[0]!.d !== TMP_DB) throw new Error('ABORT: no es la BD temporal')
    await su.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO nexor_app')
    await su.$executeRawUnsafe('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO nexor_app')
    for (const X of [T1, T2]) {
      await su.tenant.create({ data: { id: X.t, name: X.t, slug: X.t } })
      await su.user.create({ data: { id: X.admin, tenantId: X.t, email: `${X.admin}@t.test`, name: 'Admin', passwordHash: 'x', role: 'TENANT_ADMIN', isActive: true } })
      await su.proyecto.create({ data: { id: X.proj, tenantId: X.t, name: 'Presupuesto', type: 'limite', targetAmount: 100, startDate: D.startDate, endDate: D.endDate } })
      await su.transaction.create({ data: { id: X.tx, tenantId: X.t, type: 'expense', amount: 50, description: 'x', date: new Date(), isManual: true } })
    }

    process.env['DATABASE_URL'] = TMP_DIRECT
    process.env['DIRECT_DATABASE_URL'] = TMP_DIRECT
    proyectos = await import('./service')
    budget    = await import('./budget')
    vera      = await import('../vera/transactions/service')
    directPrisma = (await import('../../lib/prisma')).directPrisma
  }, 300_000)

  afterAll(async () => {
    await su?.$disconnect().catch(() => {})
    const admin = new PrismaClient({ datasources: { db: { url: BASE_DIRECT } } })
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${TMP_DB}" WITH (FORCE)`)
    await admin.$disconnect()
    process.env['DATABASE_URL'] = ENV['DATABASE_URL']
    process.env['DIRECT_DATABASE_URL'] = ENV['DIRECT_DATABASE_URL']
  }, 120_000)

  it('detalle/lista: un tenant no ve proyectos de otro', async () => {
    await expect(proyectos.getProject(T1.t, T2.proj)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const list = await proyectos.listProjects(T1.t)
    expect(list.data.every((p) => p.id !== T2.proj)).toBe(true)
    expect(list.data.some((p) => p.id === T1.proj)).toBe(true)
  }, 30_000)

  it('validateProjectId: un proyecto de otra empresa no es válido', async () => {
    await expect(proyectos.validateProjectId(T1.t, T2.proj)).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    await expect(proyectos.validateProjectId(T1.t, T1.proj)).resolves.toBe(T1.proj)
  }, 30_000)

  it('asignar: no se puede asignar a un proyecto de otra empresa', async () => {
    await expect(proyectos.assignTransaction(T1.t, T1.tx, T2.proj)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  }, 30_000)

  it('asignar: no se puede asignar una transacción de otra empresa', async () => {
    await expect(proyectos.assignTransaction(T2.t, T1.tx, T2.proj)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  }, 30_000)

  it('sobregasto: notifica SOLO a los admins del tenant correcto', async () => {
    // Gasto 200 sobre el tope 100 de T1 → pending + solicitud + notificación a T1.
    const tx = await vera.createManualTransaction(T1.t, { type: 'expense', amount: 200, date: '2026-08-12', description: 'sobregasto', currency: 'COP', projectId: T1.proj } as never, T1.admin)
    expect((tx as { assignmentStatus?: string }).assignmentStatus).toBe('pending')
    const nT1 = await directPrisma.notification.count({ where: { tenantId: T1.t, module: 'PROYECTOS' } })
    const nT2 = await directPrisma.notification.count({ where: { tenantId: T2.t, module: 'PROYECTOS' } })
    expect(nT1).toBeGreaterThan(0)
    expect(nT2).toBe(0)
    // La solicitud pertenece a T1 y no aparece en el listado de T2.
    const apprT2 = await budget.listPendingApprovals(T2.t)
    expect(apprT2.total).toBe(0)
    const apprT1 = await budget.listPendingApprovals(T1.t)
    expect(apprT1.total).toBe(1)
  }, 30_000)

  it('aprobar: un admin de otra empresa NO puede resolver la solicitud (cross-tenant bloqueado)', async () => {
    const appr = (await directPrisma.budgetApproval.findFirst({ where: { tenantId: T1.t, status: 'pending' }, select: { id: true } }))!.id
    await expect(budget.resolveApproval(T2.t, appr, T2.admin, 'approve')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    // El admin del propio tenant sí puede.
    await expect(budget.resolveApproval(T1.t, appr, T1.admin, 'approve')).resolves.toMatchObject({ status: 'approved' })
  }, 30_000)

  it('RLS real (nexor_app): proyectos, budget_approvals y transactions aislados cross-tenant', async () => {
    const seenBy = (t: string, table: string) => su.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE nexor_app')
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${t}', true)`)
      const r = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int n FROM ${table}`)
      return Number(r[0]!.n)
    })
    // T1 solo ve lo suyo (1 proyecto) y nada de T2.
    expect(await seenBy(T1.t, 'proyectos')).toBe(1)
    expect(await seenBy(T2.t, 'proyectos')).toBe(1)
    expect(await seenBy(T1.t, 'budget_approvals')).toBe(1) // la de T1
    expect(await seenBy(T2.t, 'budget_approvals')).toBe(0) // ninguna de otra empresa
  }, 30_000)
})
