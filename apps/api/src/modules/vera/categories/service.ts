import { prisma } from '../../../lib/prisma'
import type { CreateCategoryInput, UpdateCategoryInput } from './schema'

const DEFAULT_CATEGORIES = [
  { name: 'Ventas',            type: 'income',  color: '#10b981' },
  { name: 'Servicios',         type: 'income',  color: '#3b82f6' },
  { name: 'Compras',           type: 'expense', color: '#ef4444' },
  { name: 'Gastos operativos', type: 'expense', color: '#f59e0b' },
  { name: 'Otros',             type: 'both',    color: '#8b5cf6' },
] as const

const SELECT = {
  id: true, tenantId: true, name: true, type: true,
  color: true, isDefault: true, isActive: true,
  createdAt: true, updatedAt: true,
} as const

async function seedDefaults(tenantId: string) {
  await prisma.transactionCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, tenantId, isDefault: true })),
    skipDuplicates: true,
  })
}

export async function listCategories(tenantId: string, type?: string) {
  const count = await prisma.transactionCategory.count({ where: { tenantId } })
  if (count === 0) await seedDefaults(tenantId)

  return prisma.transactionCategory.findMany({
    where: {
      tenantId,
      ...(type ? { type: { in: type === 'income' ? ['income', 'both'] : ['expense', 'both'] } } : {}),
    },
    select: SELECT,
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })
}

export async function createCategory(tenantId: string, input: CreateCategoryInput) {
  const existing = await prisma.transactionCategory.findUnique({
    where: { tenantId_name: { tenantId, name: input.name } },
  })
  if (existing) throw { statusCode: 409, message: 'Ya existe una categoría con ese nombre', code: 'NAME_CONFLICT' }

  return prisma.transactionCategory.create({ data: { tenantId, ...input }, select: SELECT })
}

export async function updateCategory(tenantId: string, id: string, input: UpdateCategoryInput) {
  const cat = await prisma.transactionCategory.findFirst({ where: { id, tenantId } })
  if (!cat) throw { statusCode: 404, message: 'Categoría no encontrada', code: 'NOT_FOUND' }

  if (input.name && input.name !== cat.name) {
    const dup = await prisma.transactionCategory.findUnique({
      where: { tenantId_name: { tenantId, name: input.name } },
    })
    if (dup) throw { statusCode: 409, message: 'Ya existe una categoría con ese nombre', code: 'NAME_CONFLICT' }
  }

  return prisma.transactionCategory.update({ where: { id }, data: input, select: SELECT })
}
