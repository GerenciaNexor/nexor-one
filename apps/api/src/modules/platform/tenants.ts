/**
 * HU-138 — Gestión de clientes (tenants) y suscripciones desde la PLATAFORMA.
 * Gestión MANUAL: monto + estado, sin pasarela de cobro. Todo con `directPrisma`
 * (crea filas RLS de tenant y la tabla `subscriptions` que es deny-all para nexor_app).
 * Cada creación / cambio de suscripción queda auditado (HU-136).
 */
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { directPrisma } from '../../lib/prisma'
import { logPlatformAction, SYSTEM_ACTOR } from './audit'

const MODULES = ['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'] as const

// ─── HU-142 — Modo demo ────────────────────────────────────────────────────────
/** Duración por defecto de una demo, en días. */
export const DEMO_DEFAULT_DAYS = 15
/** Tope de duración de una demo, en días (≈ 1 mes). */
export const DEMO_MAX_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

/** Acota la duración de demo al rango permitido [1, DEMO_MAX_DAYS]. */
export function clampDemoDays(days: number): number {
  const n = Math.floor(Number(days))
  if (!Number.isFinite(n)) return DEMO_DEFAULT_DAYS
  return Math.min(DEMO_MAX_DAYS, Math.max(1, n))
}

const addDays = (from: Date, days: number): Date => new Date(from.getTime() + days * DAY_MS)

export interface DemoState {
  isDemo: boolean
  startedAt: Date | null
  endedAt: Date | null
  /** null si no es demo; 'active' mientras endedAt está en el futuro; 'expired' al vencer. */
  status: 'active' | 'expired' | null
  /** Días completos restantes (0 si ya venció). null si no es demo. */
  daysRemaining: number | null
}

/** Deriva el estado de la demo (activa/expirada, días restantes) a partir de las fechas. */
export function getDemoState(t: { isDemo: boolean; demoStartedAt: Date | null; demoEndedAt: Date | null }): DemoState {
  if (!t.isDemo) return { isDemo: false, startedAt: null, endedAt: null, status: null, daysRemaining: null }
  const now = Date.now()
  const end = t.demoEndedAt ? t.demoEndedAt.getTime() : null
  const active = end !== null && end > now
  return {
    isDemo: true,
    startedAt: t.demoStartedAt,
    endedAt: t.demoEndedAt,
    status: active ? 'active' : 'expired',
    daysRemaining: end === null ? 0 : Math.max(0, Math.ceil((end - now) / DAY_MS)),
  }
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'cliente'
}

// ─── HU-145 — Anti-duplicado de demos (usa el identificador de HU-141) ─────────
/** Normaliza el NIT/documento para comparar (sin puntos/guiones/espacios, mayúsculas). */
function normalizeNit(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

/**
 * HU-145 — Bloquea una NUEVA demo si la empresa ya conoció el producto: ya tuvo una demo
 * (aunque expirada o convertida → `is_demo = true`, rastro permanente de HU-141) o ya fue
 * cliente (tiene fila en `subscriptions`). Detecta por el identificador estable de HU-141:
 * **NIT** (`tax_id` normalizado) y, secundariamente, el **correo del admin**. directPrisma:
 * la creación corre sin contexto de tenant y `subscriptions` es deny-all.
 */
async function assertDemoNotDuplicate(taxId: string, adminEmail: string): Promise<void> {
  const nit = normalizeNit(taxId)

  // Coincidencia por NIT (normalizado en SQL para ignorar formato).
  const byNit = await directPrisma.$queryRaw<{ name: string; is_demo: boolean; has_sub: boolean }[]>`
    SELECT t.name, t.is_demo, (s.tenant_id IS NOT NULL) AS has_sub
    FROM tenants t
    LEFT JOIN subscriptions s ON s.tenant_id = t.id
    WHERE t.tax_id IS NOT NULL
      AND upper(regexp_replace(t.tax_id, '[^a-zA-Z0-9]', '', 'g')) = ${nit}
  `

  // Coincidencia por correo del admin (secundario).
  const byEmail = await directPrisma.user.findFirst({
    where:  { email: adminEmail },
    select: { tenant: { select: { name: true, isDemo: true, subscription: { select: { tenantId: true } } } } },
  })

  const matches: { name: string; isDemo: boolean; hasSub: boolean; by: string }[] = [
    ...byNit.map((r) => ({ name: r.name, isDemo: r.is_demo, hasSub: r.has_sub, by: 'NIT' })),
    ...(byEmail?.tenant
      ? [{ name: byEmail.tenant.name, isDemo: byEmail.tenant.isDemo, hasSub: !!byEmail.tenant.subscription, by: 'correo del admin' }]
      : []),
  ]

  const blocker = matches.find((m) => m.isDemo || m.hasSub)
  if (blocker) {
    const cond = blocker.isDemo ? 'ya tuvo una demo (aunque haya expirado o se haya convertido)' : 'ya fue cliente'
    throw {
      statusCode: 409,
      code:       'DEMO_DUPLICATE',
      message:    `No se puede crear la demo: la empresa "${blocker.name}" ${cond} — coincidencia por ${blocker.by}. Una empresa que ya conoció el producto no recibe otra demo.`,
    }
  }
}

export interface CreateTenantInput {
  name: string; slug?: string; legalName?: string; taxId?: string; currency?: string
  adminName: string; adminEmail: string; adminPassword: string
  modules?: string[]; amount?: number; reason: string
  /** HU-142 — crear en modo demo (tenant real con expiración). */
  isDemo?: boolean
  /** HU-142 — duración de la demo en días (default 15, tope 30). Ignorado si !isDemo. */
  demoDurationDays?: number
}

/** Crea un cliente (tenant) + su primer TENANT_ADMIN + feature flags + suscripción. Auditado. */
export async function createTenantWithAdmin(input: CreateTenantInput, actorId: string, ip?: string) {
  // HU-145 — solo demos: exigir NIT (identificador estable) y aplicar el anti-duplicado ANTES
  // de crear nada, para dar el mensaje más claro (una empresa que ya conoció el producto no
  // recibe otra demo). Un cliente de pago normal no pasa por esta verificación.
  if (input.isDemo) {
    if (!input.taxId || !input.taxId.trim()) {
      throw { statusCode: 400, code: 'DEMO_NIT_REQUIRED', message: 'El NIT es obligatorio para crear una demo (control anti-duplicado).' }
    }
    await assertDemoNotDuplicate(input.taxId.trim(), input.adminEmail)
  }

  const slug = slugify(input.slug || input.name)
  if (await directPrisma.tenant.findUnique({ where: { slug }, select: { id: true } })) {
    throw { statusCode: 409, message: 'El identificador (slug) ya está en uso', code: 'SLUG_TAKEN' }
  }
  if (await directPrisma.user.findUnique({ where: { email: input.adminEmail }, select: { id: true } })) {
    throw { statusCode: 409, message: 'Ese email de administrador ya existe en la plataforma', code: 'EMAIL_TAKEN' }
  }

  const currency = (input.currency || 'COP').toUpperCase()
  const active = new Set(input.modules?.length ? input.modules : [...MODULES])
  const hash = await bcrypt.hash(input.adminPassword, 10)

  // HU-142 — una demo es el MISMO tenant en un estado distinto (no un sandbox aparte).
  // Nace con is_demo + ventana [inicio, fin] y SIN suscripción (no es cliente de pago aún;
  // la suscripción se crea en la conversión — HU-146). Un tenant normal sí lleva suscripción.
  const isDemo = !!input.isDemo
  const demoDays = isDemo ? clampDemoDays(input.demoDurationDays ?? DEMO_DEFAULT_DAYS) : null
  const demoStartedAt = isDemo ? new Date() : null
  const demoEndedAt = isDemo && demoStartedAt ? addDays(demoStartedAt, demoDays as number) : null

  const tenant = await directPrisma.tenant.create({
    data: {
      name: input.name, slug, legalName: input.legalName || null, taxId: input.taxId || null, currency,
      isDemo, demoStartedAt, demoEndedAt,
    },
  })
  const branch = await directPrisma.branch.create({ data: { tenantId: tenant.id, name: 'Principal' } })
  await directPrisma.featureFlag.createMany({
    data: MODULES.map((m) => ({ tenantId: tenant.id, module: m as never, enabled: active.has(m) })),
  })
  const admin = await directPrisma.user.create({
    data: { tenantId: tenant.id, branchId: branch.id, email: input.adminEmail, name: input.adminName, passwordHash: hash, role: 'TENANT_ADMIN' },
  })
  const sub = isDemo ? null : await directPrisma.subscription.create({
    data: { tenantId: tenant.id, amount: new Prisma.Decimal(input.amount ?? 0), currency, status: 'active' },
  })

  await logPlatformAction({
    platformAdminId: actorId, tenantId: tenant.id, action: 'tenant.create', reason: input.reason, ip,
    metadata: {
      amount: isDemo ? 0 : (input.amount ?? 0), currency, adminEmail: input.adminEmail, modules: [...active],
      isDemo, ...(isDemo ? { demoDurationDays: demoDays, demoEndedAt: demoEndedAt?.toISOString() } : {}),
    },
  })

  return {
    id: tenant.id, name: tenant.name, slug: tenant.slug, isActive: tenant.isActive,
    adminEmail: admin.email,
    amount: sub ? Number(sub.amount) : 0, currency, status: sub?.status ?? null,
    demo: getDemoState(tenant),
  }
}

/**
 * HU-142 — Ajusta la duración de una demo (al crear o después), acotada a DEMO_MAX_DAYS desde
 * su inicio. Si la nueva fecha de fin queda en el futuro, REACTIVA el acceso (extender una demo
 * vencida la revive). Nunca borra datos. Auditado como `tenant.demo_extend`.
 */
export async function setDemoDuration(tenantId: string, durationDays: number, actorId: string, reason: string, ip?: string) {
  const t = await directPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, isDemo: true, isActive: true, demoStartedAt: true, demoEndedAt: true },
  })
  if (!t) throw { statusCode: 404, message: 'Empresa no encontrada', code: 'NOT_FOUND' }
  if (!t.isDemo) throw { statusCode: 422, message: 'La empresa no está en modo demo', code: 'NOT_A_DEMO' }

  const start = t.demoStartedAt ?? new Date()
  const days = clampDemoDays(durationDays)
  const newEnd = addDays(start, days)
  const reactivate = newEnd.getTime() > Date.now() && !t.isActive

  const updated = await directPrisma.tenant.update({
    where: { id: tenantId },
    data: { demoStartedAt: start, demoEndedAt: newEnd, ...(reactivate ? { isActive: true } : {}) },
    select: { id: true, name: true, slug: true, isActive: true, isDemo: true, demoStartedAt: true, demoEndedAt: true },
  })

  await logPlatformAction({
    platformAdminId: actorId, tenantId, action: 'tenant.demo_extend', reason, ip,
    metadata: { demoDurationDays: days, demoEndedAt: newEnd.toISOString(), reactivated: reactivate },
  })

  return { id: updated.id, name: updated.name, slug: updated.slug, isActive: updated.isActive, demo: getDemoState(updated) }
}

/**
 * HU-142 — Suspende (isActive=false) las demos vencidas que aún estén activas, SIN borrar datos
 * (se conservan para una eventual conversión — HU-146). Cada suspensión queda auditada como
 * `tenant.demo_expire` por el actor "system" (automático). Idempotente. La usa el scheduler y
 * también corre una vez al arrancar. Devuelve cuántas se suspendieron.
 */
export async function expireOverdueDemos(): Promise<{ suspended: number; ids: string[] }> {
  const now = new Date()
  const due = await directPrisma.tenant.findMany({
    where: { isDemo: true, isActive: true, demoEndedAt: { not: null, lte: now } },
    select: { id: true, demoEndedAt: true },
  })

  for (const t of due) {
    await directPrisma.tenant.update({ where: { id: t.id }, data: { isActive: false } })
    await logPlatformAction({
      platformAdminId: SYSTEM_ACTOR, tenantId: t.id, action: 'tenant.demo_expire',
      reason: 'Demo vencida — suspensión automática (datos conservados para conversión).',
      metadata: { auto: true, demoEndedAt: t.demoEndedAt?.toISOString() ?? null },
    })
  }

  return { suspended: due.length, ids: due.map((t) => t.id) }
}

export async function getSubscription(tenantId: string) {
  const s = await directPrisma.subscription.findUnique({ where: { tenantId } })
  return s ? { tenantId: s.tenantId, amount: Number(s.amount), currency: s.currency, status: s.status, startedAt: s.startedAt, cancelledAt: s.cancelledAt } : null
}

/** Define/edita el monto de la suscripción. Auditado con monto + motivo. */
export async function setSubscriptionAmount(tenantId: string, amount: number, currency: string | undefined, actorId: string, reason: string, ip?: string) {
  const tenant = await directPrisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, currency: true } })
  if (!tenant) throw { statusCode: 404, message: 'Empresa no encontrada', code: 'NOT_FOUND' }
  const cur = (currency || tenant.currency || 'COP').toUpperCase()
  const s = await directPrisma.subscription.upsert({
    where:  { tenantId },
    update: { amount: new Prisma.Decimal(amount), currency: cur },
    create: { tenantId, amount: new Prisma.Decimal(amount), currency: cur, status: 'active' },
  })
  await logPlatformAction({ platformAdminId: actorId, tenantId, action: 'subscription.update', reason, ip, metadata: { amount, currency: cur } })
  return { tenantId, amount: Number(s.amount), currency: s.currency, status: s.status }
}

/** Suscripciones (amount/status) de un conjunto de tenants — para enriquecer listados. */
export async function getSubscriptionsMap(tenantIds: string[]): Promise<Map<string, { amount: number; currency: string; status: string }>> {
  const subs = await directPrisma.subscription.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { tenantId: true, amount: true, currency: true, status: true },
  })
  return new Map(subs.map((s) => [s.tenantId, { amount: Number(s.amount), currency: s.currency, status: s.status }]))
}
