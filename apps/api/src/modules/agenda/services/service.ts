import { prisma } from '../../../lib/prisma'
import type { CreateServiceTypeInput, UpdateServiceTypeInput, ServiceTypeQuery } from './schema'

// ─── Select ───────────────────────────────────────────────────────────────────

const SERVICE_SELECT = {
  id:              true,
  name:            true,
  description:     true,
  durationMinutes: true,
  price:           true,
  color:           true,
  isActive:        true,
  branchId:        true,
  branch:          { select: { id: true, name: true } },
  professionals:   { select: { user: { select: { id: true, name: true, module: true } } } },
  createdAt:       true,
  _count:          { select: { appointments: true } },
} as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toService(s: any) {
  const { _count, professionals, ...rest } = s
  return {
    ...rest,
    price:            s.price != null ? parseFloat(String(s.price)) : null,
    professionals:    professionals.map((p: { user: unknown }) => p.user),
    appointmentCount: _count?.appointments ?? 0,
  }
}

// ─── Helpers de validación ────────────────────────────────────────────────────

async function assertBranchBelongsToTenant(branchId: string, tenantId: string): Promise<void> {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } })
  if (!branch) throw { statusCode: 404, message: 'Sucursal no encontrada', code: 'NOT_FOUND' }
}

async function assertUsersExist(userIds: string[], tenantId: string): Promise<void> {
  if (userIds.length === 0) return
  const found = await prisma.user.findMany({
    where:  { id: { in: userIds }, tenantId, isActive: true },
    select: { id: true },
  })
  if (found.length !== userIds.length) {
    throw { statusCode: 400, message: 'Uno o más profesionales no existen o no pertenecen al tenant', code: 'INVALID_PROFESSIONAL' }
  }
}

// =============================================================================
// CRUD
// =============================================================================

export async function listServiceTypes(tenantId: string, query: ServiceTypeQuery) {
  const services = await prisma.serviceType.findMany({
    where: {
      tenantId,
      // Servicios globales (sin branchId) + los de la sucursal indicada
      ...(query.branchId ? { OR: [{ branchId: query.branchId }, { branchId: null }] } : {}),
      ...(query.active !== undefined ? { isActive: query.active === 'true' } : {}),
    },
    orderBy: { name: 'asc' },
    select:  SERVICE_SELECT,
  })
  return { data: services.map(toService), total: services.length }
}

export async function getServiceType(tenantId: string, serviceId: string) {
  const service = await prisma.serviceType.findFirst({
    where:  { id: serviceId, tenantId },
    select: SERVICE_SELECT,
  })
  if (!service) throw { statusCode: 404, message: 'Servicio no encontrado', code: 'NOT_FOUND' }
  return toService(service)
}

export async function createServiceType(tenantId: string, input: CreateServiceTypeInput) {
  if (input.branchId) await assertBranchBelongsToTenant(input.branchId, tenantId)
  await assertUsersExist(input.professionalIds, tenantId)

  const service = await prisma.serviceType.create({
    data: {
      tenantId,
      name:            input.name,
      description:     input.description     ?? null,
      durationMinutes: input.durationMinutes,
      price:           input.price           ?? null,
      color:           input.color           ?? null,
      branchId:        input.branchId        ?? null,
      professionals:   input.professionalIds.length > 0
        ? { create: input.professionalIds.map((userId) => ({ userId })) }
        : undefined,
    },
    select: SERVICE_SELECT,
  })
  return toService(service)
}

export async function updateServiceType(
  tenantId:  string,
  serviceId: string,
  input:     UpdateServiceTypeInput,
) {
  const existing = await prisma.serviceType.findFirst({ where: { id: serviceId, tenantId }, select: { id: true } })
  if (!existing) throw { statusCode: 404, message: 'Servicio no encontrado', code: 'NOT_FOUND' }

  if (input.branchId) await assertBranchBelongsToTenant(input.branchId, tenantId)
  if (input.professionalIds) await assertUsersExist(input.professionalIds, tenantId)

  // Reemplazar profesionales si se envió la lista
  const professionalsUpdate = input.professionalIds !== undefined
    ? {
        deleteMany: {},
        create: input.professionalIds.map((userId) => ({ userId })),
      }
    : undefined

  const service = await prisma.serviceType.update({
    where: { id: serviceId },
    data: {
      ...(input.name            !== undefined && { name:            input.name }),
      ...(input.description     !== undefined && { description:     input.description ?? null }),
      ...(input.durationMinutes !== undefined && { durationMinutes: input.durationMinutes }),
      ...(input.price           !== undefined && { price:           input.price ?? null }),
      ...(input.color           !== undefined && { color:           input.color ?? null }),
      ...(input.branchId        !== undefined && { branchId:        input.branchId ?? null }),
      ...(input.isActive        !== undefined && { isActive:        input.isActive }),
      ...(professionalsUpdate   !== undefined && { professionals:   professionalsUpdate }),
    },
    select: SERVICE_SELECT,
  })
  return toService(service)
}

export async function deleteServiceType(tenantId: string, serviceId: string) {
  const existing = await prisma.serviceType.findFirst({
    where:  { id: serviceId, tenantId },
    select: { id: true, _count: { select: { appointments: true } } },
  })
  if (!existing) throw { statusCode: 404, message: 'Servicio no encontrado', code: 'NOT_FOUND' }

  // Tiene citas → soft-delete para conservarlas
  if (existing._count.appointments > 0) {
    await prisma.serviceType.update({ where: { id: serviceId }, data: { isActive: false } })
    return { id: serviceId, deleted: false, deactivated: true, message: 'El servicio fue desactivado porque tiene citas agendadas.' }
  }

  await prisma.serviceType.delete({ where: { id: serviceId } })
  return { id: serviceId, deleted: true, deactivated: false }
}
