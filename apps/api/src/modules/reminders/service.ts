import { prisma } from '../../lib/prisma'
import type { CreateReminderInput, UpdateReminderInput } from './schema'

const SELECT = {
  id: true, title: true, description: true, remindAt: true, alertLevel: true,
  recurrence: true, relatedType: true, relatedId: true, isActive: true,
  lastFiredAt: true, createdAt: true, updatedAt: true,
} as const

function parseWhen(s: string): Date {
  const d = new Date(s)
  if (isNaN(d.getTime())) throw { statusCode: 400, message: 'Fecha/hora inválida', code: 'VALIDATION_ERROR' }
  return d
}

/** Crea un recordatorio del usuario actual (RLS aísla por tenant). */
export async function createReminder(tenantId: string, userId: string, input: CreateReminderInput) {
  return prisma.reminder.create({
    data: {
      tenantId,
      userId,
      title:       input.title,
      description: input.description ?? null,
      remindAt:    parseWhen(input.remindAt),
      alertLevel:  input.alertLevel,
      recurrence:  input.recurrence,
      relatedType: input.relatedType ?? null,
      relatedId:   input.relatedId ?? null,
    },
    select: SELECT,
  })
}

/** Lista los recordatorios del usuario. `activeOnly` para el Inicio (próximos). */
export async function listReminders(tenantId: string, userId: string, activeOnly = false) {
  const data = await prisma.reminder.findMany({
    where:   { tenantId, userId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: [{ isActive: 'desc' }, { remindAt: 'asc' }],
    select:  SELECT,
  })
  return { data, total: data.length }
}

export async function updateReminder(tenantId: string, userId: string, id: string, input: UpdateReminderInput) {
  const existing = await prisma.reminder.findFirst({ where: { id, tenantId, userId }, select: { id: true } })
  if (!existing) throw { statusCode: 404, message: 'Recordatorio no encontrado', code: 'NOT_FOUND' }
  return prisma.reminder.update({
    where: { id },
    data: {
      ...(input.title       !== undefined && { title:       input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.remindAt    !== undefined && { remindAt:    parseWhen(input.remindAt) }),
      ...(input.alertLevel  !== undefined && { alertLevel:  input.alertLevel }),
      ...(input.recurrence  !== undefined && { recurrence:  input.recurrence }),
      ...(input.relatedType !== undefined && { relatedType: input.relatedType }),
      ...(input.relatedId   !== undefined && { relatedId:   input.relatedId }),
      ...(input.isActive    !== undefined && { isActive:    input.isActive }),
    },
    select: SELECT,
  })
}

export async function deleteReminder(tenantId: string, userId: string, id: string) {
  const existing = await prisma.reminder.findFirst({ where: { id, tenantId, userId }, select: { id: true } })
  if (!existing) throw { statusCode: 404, message: 'Recordatorio no encontrado', code: 'NOT_FOUND' }
  await prisma.reminder.delete({ where: { id } })
  return { id }
}
