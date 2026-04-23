import { prisma } from '../../../lib/prisma'
import type { CreateAvailabilityInput, UpdateAvailabilityInput, AvailabilityQuery } from './schema'

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const AVAIL_SELECT = {
  id:        true,
  branchId:  true,
  userId:    true,
  dayOfWeek: true,
  startTime: true,
  endTime:   true,
  isActive:  true,
  branch:    { select: { id: true, name: true } },
  user:      { select: { id: true, name: true } },
} as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAvailability(a: any) {
  // Prisma devuelve Time como Date — extraer HH:MM
  const toHHMM = (d: Date) => {
    const h = String(d.getUTCHours()).padStart(2, '0')
    const m = String(d.getUTCMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }
  return {
    ...a,
    dayName:   DAY_NAMES[a.dayOfWeek],
    startTime: toHHMM(a.startTime),
    endTime:   toHHMM(a.endTime),
  }
}

// Convierte "HH:MM" a un objeto Date con esa hora en UTC (para Prisma Time)
function toTimeDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  const d = new Date(0)
  d.setUTCHours(h, m, 0, 0)
  return d
}

export async function listAvailability(tenantId: string, query: AvailabilityQuery) {
  const rows = await prisma.availability.findMany({
    where: {
      tenantId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.userId   ? { userId:   query.userId }   : {}),
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    select:  AVAIL_SELECT,
  })
  return { data: rows.map(toAvailability), total: rows.length }
}

export async function createAvailability(tenantId: string, input: CreateAvailabilityInput) {
  if (input.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: input.branchId, tenantId }, select: { id: true } })
    if (!branch) throw { statusCode: 404, message: 'Sucursal no encontrada', code: 'NOT_FOUND' }
  }
  if (input.userId) {
    const user = await prisma.user.findFirst({ where: { id: input.userId, tenantId }, select: { id: true } })
    if (!user) throw { statusCode: 404, message: 'Usuario no encontrado', code: 'NOT_FOUND' }
  }

  const row = await prisma.availability.create({
    data: {
      tenantId,
      branchId:  input.branchId ?? null,
      userId:    input.userId   ?? null,
      dayOfWeek: input.dayOfWeek,
      startTime: toTimeDate(input.startTime),
      endTime:   toTimeDate(input.endTime),
    },
    select: AVAIL_SELECT,
  })
  return toAvailability(row)
}

export async function updateAvailability(
  tenantId: string,
  availId:  string,
  input:    UpdateAvailabilityInput,
) {
  const existing = await prisma.availability.findFirst({
    where:  { id: availId, tenantId },
    select: { id: true },
  })
  if (!existing) throw { statusCode: 404, message: 'Disponibilidad no encontrada', code: 'NOT_FOUND' }

  const row = await prisma.availability.update({
    where: { id: availId },
    data: {
      ...(input.startTime !== undefined && { startTime: toTimeDate(input.startTime) }),
      ...(input.endTime   !== undefined && { endTime:   toTimeDate(input.endTime)   }),
      ...(input.isActive  !== undefined && { isActive:  input.isActive }),
    },
    select: AVAIL_SELECT,
  })
  return toAvailability(row)
}

export async function deleteAvailability(tenantId: string, availId: string) {
  const existing = await prisma.availability.findFirst({
    where:  { id: availId, tenantId },
    select: { id: true },
  })
  if (!existing) throw { statusCode: 404, message: 'Disponibilidad no encontrada', code: 'NOT_FOUND' }

  await prisma.availability.delete({ where: { id: availId } })
  return { id: availId, deleted: true }
}
