import type { Prisma, PrismaClient } from '@prisma/client'
import type { Role } from '@nexor/shared'
import { prisma } from '../../../lib/prisma'
import { assertDemoLimit } from '../../../lib/demo-limits'
import { hasMinRole } from '../../../lib/guards'
import type { CreateClientInput, UpdateClientInput, ClientQuery, CreateInteractionInput } from './schema'

// ─── HU-154 — Cliente genérico "Consumidor final" (único por tenant) ────────────
/** Nombre visible del cliente genérico de mostrador. */
export const GENERIC_CLIENT_NAME = 'Consumidor final'
type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Garantiza que exista el "Consumidor final" del tenant (idempotente). Es un cliente REAL con
 * tenant_id → sujeto al RLS de `clients`, jamás global. El índice único parcial evita duplicados;
 * ante una carrera (P2002) se relee. `db` = proxy por-request (RLS) o directPrisma (creación de tenant).
 */
export async function ensureGenericClient(db: DbClient, tenantId: string): Promise<string> {
  const existing = await db.client.findFirst({ where: { tenantId, isGeneric: true }, select: { id: true } })
  if (existing) return existing.id
  try {
    const created = await db.client.create({
      data:   { tenantId, name: GENERIC_CLIENT_NAME, isGeneric: true, source: 'manual' },
      select: { id: true },
    })
    return created.id
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      const again = await db.client.findFirst({ where: { tenantId, isGeneric: true }, select: { id: true } })
      if (again) return again.id
    }
    throw err
  }
}

// ─── Selects ──────────────────────────────────────────────────────────────────

const CLIENT_SELECT = {
  id:         true,
  tenantId:   true,
  name:       true,
  email:      true,
  phone:      true,
  whatsappId: true,
  company:    true,
  taxId:      true,
  address:    true,
  city:       true,
  source:     true,
  tags:       true,
  notes:      true,
  assignedTo: true,
  branchId:   true,
  isActive:   true,
  isGeneric:     true, // HU-154
  isFavorite:    true,
  discountType:  true,
  discountValue: true,
  createdAt:  true,
  updatedAt:  true,
  assignedUser: { select: { id: true, name: true } },
  _count: { select: { deals: true } },
} as const

const INTERACTION_SELECT = {
  id:        true,
  type:      true,
  direction: true,
  content:   true,
  dealId:    true,
  userId:    true,
  createdAt: true,
  user: { select: { name: true } },
} as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toApiClient(c: any) {
  const { _count, ...rest } = c
  return {
    ...rest,
    // HU-124 — Decimal de Prisma → number para la respuesta JSON
    discountValue: rest.discountValue != null ? parseFloat(String(rest.discountValue)) : null,
    activeDealsCount: _count?.deals ?? 0,
  }
}

// =============================================================================
// CLIENTES
// =============================================================================

export async function listClients(
  tenantId: string,
  userId:   string,
  role:     Role,
  query:    ClientQuery,
) {
  const isManager = hasMinRole(role, 'AREA_MANAGER')

  // HU-154 — asegurar el "Consumidor final" del tenant antes de listar (aparece en el dropdown).
  await ensureGenericClient(prisma, tenantId)

  // Se usa AND para poder combinar el OR de visibilidad (asignado o genérico) con el OR de búsqueda.
  const where: Prisma.ClientWhereInput = {
    tenantId,
    AND: [
      // OPERATIVE solo ve sus clientes asignados — pero el genérico es visible para todos.
      ...(!isManager ? [{ OR: [{ assignedTo: userId }, { isGeneric: true }] }] : []),
      ...(query.source ? [{ source: query.source }] : []),
      ...(query.favorite ? [{ isFavorite: query.favorite === 'true' }] : []),
      ...(query.assignedTo === 'me'
        ? [{ assignedTo: userId }]
        : query.assignedTo ? [{ assignedTo: query.assignedTo }] : []),
      ...(query.search
        ? [{
            OR: [
              { name:    { contains: query.search, mode: 'insensitive' as const } },
              { email:   { contains: query.search, mode: 'insensitive' as const } },
              { phone:   { contains: query.search, mode: 'insensitive' as const } },
              { company: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }]
        : []),
    ],
  }

  const clients = await prisma.client.findMany({
    where,
    select:  CLIENT_SELECT,
    // HU-154 — el genérico ("Consumidor final") aparece primero en el listado/dropdown.
    orderBy: [{ isGeneric: 'desc' }, { createdAt: 'desc' }],
  })
  return { data: clients.map(toApiClient), total: clients.length }
}

export async function getClient(tenantId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where:  { id: clientId, tenantId },
    select: CLIENT_SELECT,
  })
  if (!client) throw { statusCode: 404, message: 'Cliente no encontrado', code: 'NOT_FOUND' }

  // HU-126 — calificación INTERNA del equipo (promedio + recientes). NO es CSAT.
  const ratings = await prisma.clientRating.findMany({
    where:   { clientId, tenantId },
    select:  { rating: true, notes: true, createdAt: true, ratedByUser: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  const count   = ratings.length
  const average = count > 0 ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / count).toFixed(2)) : null

  return {
    ...toApiClient(client),
    internalRating: {
      average,
      count,
      recent: ratings.slice(0, 5).map((r) => ({ rating: r.rating, notes: r.notes, createdAt: r.createdAt, by: r.ratedByUser?.name ?? null })),
    },
  }
}

export async function createClient(
  tenantId:  string,
  userId:    string,
  input:     CreateClientInput,
) {
  await assertDemoLimit(tenantId, 'clients') // HU-143 — tope del plan demo
  const client = await prisma.client.create({
    data: {
      tenantId,
      name:       input.name,
      email:      input.email      ?? null,
      phone:      input.phone      ?? null,
      whatsappId: input.whatsappId ?? null,
      company:    input.company    ?? null,
      taxId:      input.taxId      ?? null,
      address:    input.address    ?? null,
      city:       input.city       ?? null,
      source:     input.source     ?? null,
      tags:       input.tags       ?? [],
      notes:      input.notes      ?? null,
      assignedTo: input.assignedTo ?? userId,
      branchId:   input.branchId   ?? null,
      isFavorite:    input.isFavorite ?? false,
      discountType:  input.discountType  ?? null,
      discountValue: input.discountValue ?? null,
    },
    select: CLIENT_SELECT,
  })
  return toApiClient(client)
}

export async function updateClient(
  tenantId: string,
  clientId: string,
  input:    UpdateClientInput,
) {
  const existing = await prisma.client.findFirst({
    where:  { id: clientId, tenantId },
    select: { id: true },
  })
  if (!existing) throw { statusCode: 404, message: 'Cliente no encontrado', code: 'NOT_FOUND' }

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      ...(input.name       !== undefined && { name:       input.name }),
      ...(input.email      !== undefined && { email:      input.email      ?? null }),
      ...(input.phone      !== undefined && { phone:      input.phone      ?? null }),
      ...(input.whatsappId !== undefined && { whatsappId: input.whatsappId ?? null }),
      ...(input.company    !== undefined && { company:    input.company    ?? null }),
      ...(input.taxId      !== undefined && { taxId:      input.taxId      ?? null }),
      ...(input.address    !== undefined && { address:    input.address    ?? null }),
      ...(input.city       !== undefined && { city:       input.city       ?? null }),
      ...(input.source     !== undefined && { source:     input.source     ?? null }),
      ...(input.tags       !== undefined && { tags:       input.tags }),
      ...(input.notes      !== undefined && { notes:      input.notes      ?? null }),
      ...(input.assignedTo !== undefined && { assignedTo: input.assignedTo ?? null }),
      ...(input.branchId   !== undefined && { branchId:   input.branchId   ?? null }),
      ...(input.isFavorite    !== undefined && { isFavorite:    input.isFavorite }),
      ...(input.discountType  !== undefined && { discountType:  input.discountType  ?? null }),
      ...(input.discountValue !== undefined && { discountValue: input.discountValue ?? null }),
    },
    select: CLIENT_SELECT,
  })
  return toApiClient(client)
}

export async function deactivateClient(tenantId: string, clientId: string) {
  const existing = await prisma.client.findFirst({
    where:  { id: clientId, tenantId },
    select: { id: true, isGeneric: true },
  })
  if (!existing) throw { statusCode: 404, message: 'Cliente no encontrado', code: 'NOT_FOUND' }
  // HU-154 — el "Consumidor final" es un registro del sistema: no se desactiva ni se borra.
  if (existing.isGeneric) throw { statusCode: 422, message: 'El "Consumidor final" no se puede desactivar', code: 'GENERIC_PROTECTED' }

  const client = await prisma.client.update({
    where: { id: clientId },
    data:  { isActive: false },
    select: CLIENT_SELECT,
  })
  return toApiClient(client)
}

// =============================================================================
// INTERACCIONES
// =============================================================================

export async function listInteractions(tenantId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where:  { id: clientId, tenantId },
    select: { id: true },
  })
  if (!client) throw { statusCode: 404, message: 'Cliente no encontrado', code: 'NOT_FOUND' }

  const interactions = await prisma.interaction.findMany({
    where:   { clientId, tenantId },
    orderBy: { createdAt: 'desc' },
    select:  INTERACTION_SELECT,
  })
  return { data: interactions, total: interactions.length }
}

export async function createInteraction(
  tenantId: string,
  clientId: string,
  userId:   string,
  input:    CreateInteractionInput,
) {
  const client = await prisma.client.findFirst({
    where:  { id: clientId, tenantId },
    select: { id: true },
  })
  if (!client) throw { statusCode: 404, message: 'Cliente no encontrado', code: 'NOT_FOUND' }

  return prisma.interaction.create({
    data: {
      tenantId,
      clientId,
      userId,
      type:      input.type,
      direction: input.direction,
      content:   input.content,
      dealId:    input.dealId ?? null,
    },
    select: INTERACTION_SELECT,
  })
}
