import { prisma } from '../../../lib/prisma'
import type { CreateCostCenterInput, UpdateCostCenterInput } from './schema'

const SELECT = {
  id: true, tenantId: true, name: true, description: true,
  isActive: true, createdAt: true, updatedAt: true,
} as const

export async function listCostCenters(tenantId: string) {
  return prisma.costCenter.findMany({
    where:   { tenantId },
    select:  SELECT,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  })
}

export async function createCostCenter(tenantId: string, input: CreateCostCenterInput) {
  const existing = await prisma.costCenter.findUnique({
    where: { tenantId_name: { tenantId, name: input.name } },
  })
  if (existing) throw { statusCode: 409, message: 'Ya existe un centro de costo con ese nombre', code: 'NAME_CONFLICT' }

  return prisma.costCenter.create({ data: { tenantId, ...input }, select: SELECT })
}

export async function updateCostCenter(tenantId: string, id: string, input: UpdateCostCenterInput) {
  const cc = await prisma.costCenter.findFirst({ where: { id, tenantId } })
  if (!cc) throw { statusCode: 404, message: 'Centro de costo no encontrado', code: 'NOT_FOUND' }

  if (input.name && input.name !== cc.name) {
    const dup = await prisma.costCenter.findUnique({
      where: { tenantId_name: { tenantId, name: input.name } },
    })
    if (dup) throw { statusCode: 409, message: 'Ya existe un centro de costo con ese nombre', code: 'NAME_CONFLICT' }
  }

  return prisma.costCenter.update({ where: { id }, data: input, select: SELECT })
}
