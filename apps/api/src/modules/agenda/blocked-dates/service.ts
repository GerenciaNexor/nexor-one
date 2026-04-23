import { prisma } from '../../../lib/prisma'
import type { CreateBlockedDateInput, BlockedDateQuery } from './schema'

const BD_SELECT = {
  id:       true,
  date:     true,
  reason:   true,
  branchId: true,
  branch:   { select: { id: true, name: true } },
} as const

export async function listBlockedDates(tenantId: string, query: BlockedDateQuery) {
  const rows = await prisma.blockedDate.findMany({
    where: {
      tenantId,
      ...(query.branchId ? { OR: [{ branchId: query.branchId }, { branchId: null }] } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to   ? { lte: new Date(query.to)   } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: 'asc' },
    select:  BD_SELECT,
  })
  return { data: rows, total: rows.length }
}

export async function createBlockedDate(tenantId: string, input: CreateBlockedDateInput) {
  if (input.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: input.branchId, tenantId }, select: { id: true } })
    if (!branch) throw { statusCode: 404, message: 'Sucursal no encontrada', code: 'NOT_FOUND' }
  }

  try {
    const row = await prisma.blockedDate.create({
      data: {
        tenantId,
        branchId: input.branchId ?? null,
        date:     new Date(input.date),
        reason:   input.reason   ?? null,
      },
      select: BD_SELECT,
    })
    return row
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === 'P2002') {
      throw { statusCode: 409, message: 'Ya existe un bloqueo para esa fecha y sucursal', code: 'DUPLICATE' }
    }
    throw err
  }
}

export async function deleteBlockedDate(tenantId: string, blockedDateId: string) {
  const existing = await prisma.blockedDate.findFirst({
    where:  { id: blockedDateId, tenantId },
    select: { id: true },
  })
  if (!existing) throw { statusCode: 404, message: 'Fecha bloqueada no encontrada', code: 'NOT_FOUND' }

  await prisma.blockedDate.delete({ where: { id: blockedDateId } })
  return { id: blockedDateId, deleted: true }
}
