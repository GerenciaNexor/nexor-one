import type { Prisma, PrismaClient } from '@prisma/client'
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

export async function listBranches(tenantId: string, branchIdFilter?: string, activeOnly = false) {
  const where = {
    tenantId,
    ...(branchIdFilter ? { id: branchIdFilter } : {}),
    // HU-197 — para SELECCIONAR sucursal en un registro nuevo se piden solo activas (una sede
    // desactivada conserva su histórico, pero no se puede registrar nada nuevo en ella).
    ...(activeOnly ? { isActive: true } : {}),
  }
  const data = await prisma.branch.findMany({
    where,
    select: BRANCH_SELECT,
    orderBy: { name: 'asc' },
  })
  return { data, total: data.length }
}

/**
 * HU-197 — Valida que la sucursal destino de un registro NUEVO exista y esté ACTIVA. Se usa en los
 * creates (compras, ventas, inventario, citas, finanzas): no se puede operar sobre una sede
 * desactivada, aunque su histórico siga visible. `db` = cliente transaccional cuando aplica.
 */
export async function assertBranchActive(
  tenantId: string,
  branchId: string | null | undefined,
  db: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<void> {
  if (!branchId) return
  const b = await db.branch.findFirst({ where: { id: branchId, tenantId }, select: { isActive: true } })
  if (!b) throw { statusCode: 400, message: 'Sucursal no encontrada', code: 'BRANCH_NOT_FOUND' }
  if (!b.isActive) throw { statusCode: 422, message: 'La sucursal está desactivada; no se pueden registrar operaciones nuevas en ella.', code: 'BRANCH_INACTIVE' }
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
