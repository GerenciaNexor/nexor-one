/**
 * HU-138 — Gestión de clientes (tenants) y suscripciones desde la PLATAFORMA.
 * Gestión MANUAL: monto + estado, sin pasarela de cobro. Todo con `directPrisma`
 * (crea filas RLS de tenant y la tabla `subscriptions` que es deny-all para nexor_app).
 * Cada creación / cambio de suscripción queda auditado (HU-136).
 */
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { directPrisma } from '../../lib/prisma'
import { logPlatformAction } from './audit'

const MODULES = ['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'] as const

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'cliente'
}

export interface CreateTenantInput {
  name: string; slug?: string; legalName?: string; taxId?: string; currency?: string
  adminName: string; adminEmail: string; adminPassword: string
  modules?: string[]; amount?: number; reason: string
}

/** Crea un cliente (tenant) + su primer TENANT_ADMIN + feature flags + suscripción. Auditado. */
export async function createTenantWithAdmin(input: CreateTenantInput, actorId: string, ip?: string) {
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

  const tenant = await directPrisma.tenant.create({
    data: { name: input.name, slug, legalName: input.legalName || null, taxId: input.taxId || null, currency },
  })
  const branch = await directPrisma.branch.create({ data: { tenantId: tenant.id, name: 'Principal' } })
  await directPrisma.featureFlag.createMany({
    data: MODULES.map((m) => ({ tenantId: tenant.id, module: m as never, enabled: active.has(m) })),
  })
  const admin = await directPrisma.user.create({
    data: { tenantId: tenant.id, branchId: branch.id, email: input.adminEmail, name: input.adminName, passwordHash: hash, role: 'TENANT_ADMIN' },
  })
  const sub = await directPrisma.subscription.create({
    data: { tenantId: tenant.id, amount: new Prisma.Decimal(input.amount ?? 0), currency, status: 'active' },
  })

  await logPlatformAction({
    platformAdminId: actorId, tenantId: tenant.id, action: 'tenant.create', reason: input.reason, ip,
    metadata: { amount: input.amount ?? 0, currency, adminEmail: input.adminEmail, modules: [...active] },
  })

  return {
    id: tenant.id, name: tenant.name, slug: tenant.slug, isActive: tenant.isActive,
    adminEmail: admin.email, amount: Number(sub.amount), currency: sub.currency, status: sub.status,
  }
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
