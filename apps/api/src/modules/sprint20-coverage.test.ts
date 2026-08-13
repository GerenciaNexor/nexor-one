/**
 * HU-197 — Cobertura transversal del Sprint 20 contra BD REAL (temporal).
 *
 * Llena los huecos que los tests unitarios no cubrían por requerir Postgres:
 *   · HU-181 — dedup atómico: un mensaje entrante = una sola respuesta (índice UNIQUE del inbound).
 *   · HU-195 — agendamiento sin doble-reserva en servicios SIN profesionales (slot ocupado ≠ ofrecible;
 *              crear la misma cita dos veces → SLOT_TAKEN).
 *
 * No mockea la DB: crea una BD temporal (migrate deploy), siembra y ejercita los servicios reales.
 * Los servicios filtran por tenantId explícito, así que no requiere el rol nexor_app/RLS (eso lo
 * cubre `prisma/audit-rls.ts` y `agent-runner-rls.test.ts`). Se salta si no hay DIRECT_DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type * as Appointments from './agenda/appointments/service'
import type * as Slots from './agenda/slots/service'

const API_DIR = process.cwd()
function envUrl(key: string): string | undefined {
  if (process.env[key]) return process.env[key]
  try { return readFileSync(path.join(API_DIR, '.env'), 'utf8').match(new RegExp(`^${key}="?([^"\\n]+)"?`, 'm'))?.[1] } catch { return undefined }
}
const BASE_DIRECT = envUrl('DIRECT_DATABASE_URL')
const HAS_DB = !!BASE_DIRECT
if (!HAS_DB) console.warn('[sprint20-coverage] SKIP: requiere DIRECT_DATABASE_URL (superuser) para crear la BD temporal.')

const TMP_DB = 'nexor_sprint20_cov'
const withDb = (url: string, db: string): string => { const u = new URL(url); u.pathname = `/${db}`; return u.toString() }

const T = { tenant: 's20_t', branch: 's20_b', user: 's20_u', svc: 's20_svc' }

// Fecha futura (10 días) para que ningún slot quede en el pasado. tz del tenant = UTC → matemática directa.
const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
const DATE = future.toISOString().slice(0, 10)                 // YYYY-MM-DD
const DOW  = new Date(`${DATE}T00:00:00.000Z`).getUTCDay()     // día de la semana en UTC

let su: PrismaClient
let createAppointment: typeof Appointments.createAppointment
let getAvailableSlots: typeof Slots.getAvailableSlots

describe.skipIf(!HAS_DB)('HU-197 — cobertura Sprint 20 (BD temporal)', () => {
  const ENV = { ...process.env }

  beforeAll(async () => {
    const TMP_DIRECT = withDb(BASE_DIRECT!, TMP_DB)

    const admin = new PrismaClient({ datasources: { db: { url: BASE_DIRECT } } })
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${TMP_DB}" WITH (FORCE)`)
    await admin.$executeRawUnsafe(`CREATE DATABASE "${TMP_DB}"`)
    await admin.$disconnect()

    execSync('pnpm exec prisma migrate deploy', { cwd: API_DIR, env: { ...process.env, DATABASE_URL: TMP_DIRECT, DIRECT_DATABASE_URL: TMP_DIRECT }, stdio: 'ignore' })

    su = new PrismaClient({ datasources: { db: { url: TMP_DIRECT } } })
    // GUARD anti-prod: nunca sembrar/ejecutar sobre otra BD que no sea la temporal.
    const dbName = (await su.$queryRawUnsafe<{ d: string }[]>('SELECT current_database() d'))[0]!.d
    if (dbName !== TMP_DB) throw new Error(`ABORT: no es la BD temporal (${dbName})`)

    await su.tenant.create({ data: { id: T.tenant, name: 'Sprint20', slug: 's20', timezone: 'UTC' } })
    await su.branch.create({ data: { id: T.branch, tenantId: T.tenant, name: 'Sede', isActive: true } })
    await su.user.create({ data: { id: T.user, tenantId: T.tenant, branchId: T.branch, email: 's20@t.test', name: 'Admin', passwordHash: 'x', role: 'TENANT_ADMIN' } })
    await su.serviceType.create({ data: { id: T.svc, tenantId: T.tenant, name: 'Corte', durationMinutes: 60, isActive: true } }) // SIN profesionales
    await su.availability.create({ data: { tenantId: T.tenant, branchId: T.branch, userId: null, dayOfWeek: DOW, isActive: true, startTime: new Date(Date.UTC(1970, 0, 1, 9, 0)), endTime: new Date(Date.UTC(1970, 0, 1, 12, 0)) } }) // 09–12 UTC → 3 slots

    process.env['DATABASE_URL'] = TMP_DIRECT
    process.env['DIRECT_DATABASE_URL'] = TMP_DIRECT
    createAppointment = (await import('./agenda/appointments/service')).createAppointment
    getAvailableSlots = (await import('./agenda/slots/service')).getAvailableSlots
  }, 300_000)

  afterAll(async () => {
    await su?.$disconnect().catch(() => {})
    const admin = new PrismaClient({ datasources: { db: { url: BASE_DIRECT } } })
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${TMP_DB}" WITH (FORCE)`)
    await admin.$disconnect()
    process.env['DATABASE_URL'] = ENV['DATABASE_URL']
    process.env['DIRECT_DATABASE_URL'] = ENV['DIRECT_DATABASE_URL']
  }, 120_000)

  // ── HU-181 — un mensaje = una respuesta (dedup por índice UNIQUE del inbound) ──
  describe('HU-181 — dedup atómico del inbound', () => {
    const cv = 's20_cv'
    beforeAll(async () => {
      await su.conversation.create({ data: { id: cv, tenantId: T.tenant, channel: 'WHATSAPP', senderIdentifier: '573001112233', lastMessageAt: new Date() } })
    })
    const inbound = (externalMessageId: string | null, tenantId = T.tenant) =>
      su.conversationMessage.create({ data: { tenantId, conversationId: cv, direction: 'inbound', content: 'hola', externalMessageId, timestamp: new Date() } })

    it('el mismo wamid solo se inserta una vez (2º intento → violación de unicidad P2002)', async () => {
      await inbound('wamid-A')
      await expect(inbound('wamid-A')).rejects.toMatchObject({ code: 'P2002' })
    })

    it('otro tenant PUEDE tener el mismo external id (dedup es por tenant)', async () => {
      await su.tenant.create({ data: { id: 's20_t2', name: 'Otro', slug: 's20b', timezone: 'UTC' } })
      await su.conversation.create({ data: { id: 's20_cv2', tenantId: 's20_t2', channel: 'WHATSAPP', senderIdentifier: 'x', lastMessageAt: new Date() } })
      await expect(su.conversationMessage.create({ data: { tenantId: 's20_t2', conversationId: 's20_cv2', direction: 'inbound', content: 'hola', externalMessageId: 'wamid-A', timestamp: new Date() } })).resolves.toBeTruthy()
    })

    it('los outbound (external id NULL) no colisionan entre sí (NULL es distinto en SQL)', async () => {
      await expect(inbound(null)).resolves.toBeTruthy()
      await expect(inbound(null)).resolves.toBeTruthy()
    })
  })

  // ── HU-195 — agendamiento sin doble-reserva (servicio SIN profesionales) ──────
  describe('HU-195 — sin doble-reserva', () => {
    const appt = (hourUTC: number) => createAppointment(T.tenant, {
      branchId: T.branch, serviceTypeId: T.svc, startAt: `${DATE}T${String(hourUTC).padStart(2, '0')}:00:00.000Z`,
      clientName: 'Cliente', clientPhone: '3001', channel: 'manual', status: 'scheduled', createdByAgent: false,
    })

    it('ofrece los slots libres, reserva uno y ese deja de ofrecerse', async () => {
      const before = await getAvailableSlots(T.tenant, { serviceId: T.svc, branchId: T.branch, date: DATE })
      expect(before.total).toBe(3)                       // 09, 10, 11
      await appt(9)
      const after = await getAvailableSlots(T.tenant, { serviceId: T.svc, branchId: T.branch, date: DATE })
      expect(after.total).toBe(2)                        // 09 ya no
      expect(after.slots.some((s) => s.startTime === '09:00')).toBe(false)
    }, 30_000)

    it('reservar el MISMO horario otra vez → SLOT_TAKEN (regla dura: nunca pisar una cita)', async () => {
      await expect(appt(9)).rejects.toMatchObject({ code: 'SLOT_TAKEN' })
    }, 30_000)

    it('otro horario libre sí se puede reservar', async () => {
      await expect(appt(10)).resolves.toMatchObject({ id: expect.any(String) })
    }, 30_000)
  })
})
