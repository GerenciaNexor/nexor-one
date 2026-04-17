import type { Prisma } from '@prisma/client'
import type { Role } from '@nexor/shared'
import { prisma } from '../../../lib/prisma'
import { hasMinRole } from '../../../lib/guards'
import type { CreateClientInput, UpdateClientInput, ClientQuery, CreateInteractionInput } from './schema'

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
  return { ...rest, activeDealsCount: _count?.deals ?? 0 }
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

  const where: Prisma.ClientWhereInput = {
    tenantId,
    // OPERATIVE solo ve sus clientes asignados
    ...(!isManager ? { assignedTo: userId } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(query.assignedTo === 'me'
      ? { assignedTo: userId }
      : query.assignedTo ? { assignedTo: query.assignedTo } : {}),
    ...(query.search
      ? {
          OR: [
            { name:    { contains: query.search, mode: 'insensitive' } },
            { email:   { contains: query.search, mode: 'insensitive' } },
            { phone:   { contains: query.search, mode: 'insensitive' } },
            { company: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const clients = await prisma.client.findMany({
    where,
    select:  CLIENT_SELECT,
    orderBy: { createdAt: 'desc' },
  })
  return { data: clients.map(toApiClient), total: clients.length }
}

export async function getClient(tenantId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where:  { id: clientId, tenantId },
    select: CLIENT_SELECT,
  })
  if (!client) throw { statusCode: 404, message: 'Cliente no encontrado', code: 'NOT_FOUND' }
  return toApiClient(client)
}

export async function createClient(
  tenantId:  string,
  userId:    string,
  input:     CreateClientInput,
) {
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
    },
    select: CLIENT_SELECT,
  })
  return toApiClient(client)
}

export async function deactivateClient(tenantId: string, clientId: string) {
  const existing = await prisma.client.findFirst({
    where:  { id: clientId, tenantId },
    select: { id: true },
  })
  if (!existing) throw { statusCode: 404, message: 'Cliente no encontrado', code: 'NOT_FOUND' }

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
