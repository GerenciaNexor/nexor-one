import { prisma } from '../../lib/prisma'
import { assertDemoLimit } from '../../lib/demo-limits'
import bcrypt from 'bcryptjs'
import type { CreateUserInput, UpdateUserInput } from './schema'

const USER_SELECT = {
  id:          true,
  tenantId:    true,
  branchId:    true,
  email:       true,
  name:        true,
  role:        true,
  module:      true,
  isActive:    true,
  lastLoginAt: true,
  createdAt:   true,
  updatedAt:   true,
  branch:      { select: { id: true, name: true } },
} as const

export async function listUsers(
  tenantId: string,
  { search, page, limit }: { search?: string; page: number; limit: number },
) {
  const where = {
    tenantId,
    role: { not: 'SUPER_ADMIN' as const },
    ...(search
      ? {
          OR: [
            { name:  { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.user.count({ where }),
  ])

  return { data, total, page, limit }
}

/**
 * Valida que la sucursal exista en el tenant y esté ACTIVA. No se puede asignar un usuario a una
 * sucursal inactiva/desactivada. Lanza 400 si no existe o está inactiva.
 */
async function assertBranchAssignable(tenantId: string, branchId: string): Promise<void> {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { isActive: true } })
  if (!branch)          throw { statusCode: 400, message: 'La sucursal no existe en tu empresa', code: 'BRANCH_NOT_FOUND' }
  if (!branch.isActive) throw { statusCode: 400, message: 'No puedes asignar un usuario a una sucursal inactiva', code: 'BRANCH_INACTIVE' }
}

export async function createUser(tenantId: string, input: CreateUserInput) {
  await assertDemoLimit(tenantId, 'users') // HU-143 — tope del plan demo
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) {
    throw { statusCode: 409, message: 'El email ya esta registrado', code: 'EMAIL_CONFLICT' }
  }
  if (input.branchId) await assertBranchAssignable(tenantId, input.branchId)

  const hash = await bcrypt.hash(input.password, 12)
  return prisma.user.create({
    data: {
      tenantId,
      branchId:     input.branchId,
      email:        input.email,
      name:         input.name,
      passwordHash: hash,
      role:         input.role,
      module:       input.module,
    },
    select: USER_SELECT,
  })
}

export async function updateUser(
  tenantId:    string,
  userId:      string,
  requesterId: string,
  input:       UpdateUserInput,
) {
  if (userId === requesterId) {
    throw { statusCode: 422, message: 'No puedes modificar tu propio usuario', code: 'SELF_MODIFY' }
  }

  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } })
  if (!user) {
    throw { statusCode: 404, message: 'Usuario no encontrado', code: 'NOT_FOUND' }
  }
  if (user.role === 'SUPER_ADMIN') {
    throw { statusCode: 403, message: 'No puedes modificar al Super Admin', code: 'FORBIDDEN' }
  }

  // Solo se valida cuando se ASIGNA una sucursal (no al quitarla con null).
  if (input.branchId) await assertBranchAssignable(tenantId, input.branchId)

  const data: Record<string, unknown> = {}
  if (input.name     !== undefined) data['name']     = input.name
  if (input.role     !== undefined) data['role']     = input.role
  if (input.module   !== undefined) data['module']   = input.module
  if (input.branchId !== undefined) data['branchId'] = input.branchId
  if (input.isActive !== undefined) data['isActive'] = input.isActive
  if (input.password)               data['passwordHash'] = await bcrypt.hash(input.password, 12)

  return prisma.user.update({
    where:  { id: userId },
    data,
    select: USER_SELECT,
  })
}

/**
 * Cambio de la PROPIA contraseña (self-service): valida la contraseña actual antes de setear la nueva.
 * Cualquier usuario autenticado puede cambiar SU contraseña (no requiere ser admin).
 */
export async function changeOwnPassword(
  tenantId: string, userId: string, currentPassword: string, newPassword: string,
): Promise<{ ok: true }> {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { passwordHash: true } })
  if (!user) throw { statusCode: 404, message: 'Usuario no encontrado', code: 'NOT_FOUND' }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) throw { statusCode: 400, message: 'La contraseña actual es incorrecta', code: 'INVALID_CURRENT_PASSWORD' }

  const hash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } })
  return { ok: true }
}
