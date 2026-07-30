import { prisma } from '../../lib/prisma'
import type { CreateReminderInput, UpdateReminderInput } from './schema'
import { nextOccurrence } from './recurrence'

const SELECT = {
  id: true, title: true, description: true, remindAt: true, alertLevel: true,
  recurrence: true, relatedType: true, relatedId: true, isActive: true,
  status: true, completedAt: true, lastFiredAt: true, createdAt: true, updatedAt: true,
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

/**
 * Lista los recordatorios del usuario.
 * `status` filtra pendientes/hechos (para Inicio y para la vista de gestión en Agenda).
 */
export async function listReminders(
  tenantId: string,
  userId: string,
  opts: { status?: 'pending' | 'done'; activeOnly?: boolean } = {},
) {
  const data = await prisma.reminder.findMany({
    where: {
      tenantId,
      userId,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.activeOnly ? { isActive: true } : {}),
    },
    orderBy: [{ status: 'asc' }, { remindAt: 'asc' }],
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

/**
 * HU-157 — Marcar como hecho/finalizado.
 * - Recordatorio de una sola vez → queda `done` (deja de estar activo). Ya se puede eliminar.
 * - Recurrente sin `series` → cierra SOLO la ocurrencia actual y reprograma la siguiente
 *   (sigue `pending` y activo). "Cancelar" también entra por aquí (se registra como atendido).
 * - Recurrente con `series: true` → "Finalizar serie": apaga el recordatorio para siempre (`done`).
 */
export async function completeReminder(
  tenantId: string,
  userId: string,
  id: string,
  opts: { series?: boolean } = {},
) {
  const r = await prisma.reminder.findFirst({
    where:  { id, tenantId, userId },
    select: { id: true, remindAt: true, recurrence: true },
  })
  if (!r) throw { statusCode: 404, message: 'Recordatorio no encontrado', code: 'NOT_FOUND' }

  const now = new Date()
  const isSeries = r.recurrence !== 'none'
  const next = isSeries && !opts.series ? nextOccurrence(r.remindAt, r.recurrence, now) : null

  if (next) {
    // Cierra la ocurrencia de hoy y reprograma la próxima; sigue pendiente y activo.
    return prisma.reminder.update({
      where: { id },
      data:  { remindAt: next, isActive: true, status: 'pending' },
      select: SELECT,
    })
  }
  // Una sola vez, o "finalizar serie": queda hecho y ya no dispara.
  return prisma.reminder.update({
    where: { id },
    data:  { status: 'done', isActive: false, completedAt: now },
    select: SELECT,
  })
}

/**
 * HU-157 — Eliminar. Regla de negocio: un recordatorio PENDIENTE no se elimina;
 * primero debe marcarse como hecho/finalizado. Así se evita borrar pendientes sin atender.
 */
export async function deleteReminder(tenantId: string, userId: string, id: string) {
  const existing = await prisma.reminder.findFirst({
    where:  { id, tenantId, userId },
    select: { id: true, status: true },
  })
  if (!existing) throw { statusCode: 404, message: 'Recordatorio no encontrado', code: 'NOT_FOUND' }
  if (existing.status !== 'done') {
    throw {
      statusCode: 422,
      message: 'Primero marca el recordatorio como hecho para poder eliminarlo.',
      code: 'REMINDER_PENDING',
    }
  }
  await prisma.reminder.delete({ where: { id } })
  return { id }
}
