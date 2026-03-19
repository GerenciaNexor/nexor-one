import { prisma } from '../../lib/prisma'
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

export async function createUser(tenantId: string, input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) {
    throw { statusCode: 409, message: 'El email ya esta registrado', code: 'EMAIL_CONFLICT' }
  }

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
