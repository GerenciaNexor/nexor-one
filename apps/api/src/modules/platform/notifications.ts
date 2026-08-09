/**
 * Bandeja de notificaciones de PLATAFORMA (la campanita de la consola SUPER_ADMIN).
 * Compartida por el equipo NEXOR (identidad de plataforma, sin tenant/usuario) → `directPrisma`
 * sobre `platform_notifications` (RLS deny-all para nexor_app). El SUPER_ADMIN las lee/marca;
 * las crea el sistema al detectar canales caídos / tokens por vencer (ver lib/integration-status).
 */
import { directPrisma } from '../../lib/prisma'

const SELECT = { id: true, type: true, title: true, message: true, tenantId: true, link: true, isRead: true, createdAt: true } as const

export async function listPlatformNotifications(opts: { isRead?: boolean; limit?: number } = {}) {
  const data = await directPrisma.platformNotification.findMany({
    where:   opts.isRead === undefined ? {} : { isRead: opts.isRead },
    select:  SELECT,
    orderBy: { createdAt: 'desc' },
    take:    Math.min(opts.limit ?? 20, 100),
  })
  return { data, total: data.length }
}

export function getPlatformUnreadCount(): Promise<number> {
  return directPrisma.platformNotification.count({ where: { isRead: false } })
}

export async function markPlatformRead(id: string) {
  const n = await directPrisma.platformNotification.findUnique({ where: { id }, select: { id: true } })
  if (!n) throw Object.assign(new Error('Notificación no encontrada.'), { statusCode: 404, code: 'NOT_FOUND' })
  await directPrisma.platformNotification.update({ where: { id }, data: { isRead: true } })
  return { success: true }
}

export async function markAllPlatformRead() {
  const r = await directPrisma.platformNotification.updateMany({ where: { isRead: false }, data: { isRead: true } })
  return { success: true, updated: r.count }
}
