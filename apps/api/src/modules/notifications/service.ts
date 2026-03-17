import { prisma } from '../../lib/prisma'

const NOTIFICATION_SELECT = {
  id: true,
  title: true,
  message: true,
  type: true,
  module: true,
  link: true,
  isRead: true,
  createdAt: true,
} as const

export async function getNotifications(
  userId: string,
  tenantId: string,
  isRead?: boolean,
  limit = 20,
) {
  const data = await prisma.notification.findMany({
    where: {
      userId,
      tenantId,
      ...(isRead !== undefined ? { isRead } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
    select: NOTIFICATION_SELECT,
  })
  return { data, total: data.length }
}

export async function getUnreadCount(userId: string, tenantId: string) {
  const count = await prisma.notification.count({
    where: { userId, tenantId, isRead: false },
  })
  return { count }
}

export async function markRead(userId: string, tenantId: string, notificationId: string) {
  const exists = await prisma.notification.findFirst({
    where: { id: notificationId, userId, tenantId },
  })
  if (!exists) {
    throw { statusCode: 404, message: 'Notificacion no encontrada', code: 'NOT_FOUND' }
  }
  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
    select: NOTIFICATION_SELECT,
  })
}

export async function markAllRead(userId: string, tenantId: string) {
  await prisma.notification.updateMany({
    where: { userId, tenantId, isRead: false },
    data: { isRead: true },
  })
}
