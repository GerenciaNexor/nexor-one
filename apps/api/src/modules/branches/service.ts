import { prisma } from '../../lib/prisma'
import type { CreateBranchInput, UpdateBranchInput } from './schema'

const BRANCH_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  city: true,
  address: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const

export async function listBranches(tenantId: string, branchIdFilter?: string) {
  const where = {
    tenantId,
    ...(branchIdFilter ? { id: branchIdFilter } : {}),
  }
  const data = await prisma.branch.findMany({
    where,
    select: BRANCH_SELECT,
    orderBy: { name: 'asc' },
  })
  return { data, total: data.length }
}

export async function createBranch(tenantId: string, input: CreateBranchInput) {
  return prisma.branch.create({
    data: {
      tenantId,
      name: input.name,
      city: input.city,
      address: input.address,
      phone: input.phone,
    },
    select: BRANCH_SELECT,
  })
}

export async function getBranch(tenantId: string, branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId },
    select: BRANCH_SELECT,
  })
  if (!branch) {
    throw { statusCode: 404, message: 'Sucursal no encontrada', code: 'NOT_FOUND' }
  }
  return branch
}

export async function updateBranch(
  tenantId: string,
  branchId: string,
  input: UpdateBranchInput,
) {
  // Verificar que la sucursal pertenece al tenant antes de modificar
  const exists = await prisma.branch.findFirst({ where: { id: branchId, tenantId } })
  if (!exists) {
    throw { statusCode: 404, message: 'Sucursal no encontrada', code: 'NOT_FOUND' }
  }
  return prisma.branch.update({
    where: { id: branchId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    select: BRANCH_SELECT,
  })
}

export async function deactivateBranch(tenantId: string, branchId: string) {
  const exists = await prisma.branch.findFirst({ where: { id: branchId, tenantId } })
  if (!exists) {
    throw { statusCode: 404, message: 'Sucursal no encontrada', code: 'NOT_FOUND' }
  }
  return prisma.branch.update({
    where: { id: branchId },
    data: { isActive: false },
    select: BRANCH_SELECT,
  })
}
