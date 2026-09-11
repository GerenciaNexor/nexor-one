/**
 * HU-211 — notifyUsers: crea la notificación in-app (una por usuario, deduplicando ids). El camino de
 * WhatsApp (wa) NO se ejerce aquí para no tocar la BD/red — se cubre por la capa de HU-207.
 */
import { describe, it, expect, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { notifyUsers } from './user-notify'

function mockClient() {
  return { notification: { createMany: vi.fn().mockResolvedValue({ count: 0 }) } } as unknown as Prisma.TransactionClient
}

describe('HU-211 — notifyUsers', () => {
  it('crea una notificación in-app por usuario (deduplica ids)', async () => {
    const c = mockClient()
    await notifyUsers(c, { tenantId: 't1', userIds: ['u1', 'u1', 'u2'], module: 'AGENDA', type: 'x', title: 'T', message: 'M', link: '/x' })
    expect(c.notification.createMany).toHaveBeenCalledTimes(1)
    const arg = (c.notification.createMany as unknown as { mock: { calls: [{ data: unknown[] }][] } }).mock.calls[0]![0]
    expect(arg.data).toHaveLength(2)
    expect(arg.data[0]).toMatchObject({ tenantId: 't1', userId: 'u1', type: 'x', title: 'T' })
  })

  it('sin usuarios → no crea nada', async () => {
    const c = mockClient()
    await notifyUsers(c, { tenantId: 't1', userIds: [], module: null, type: 'x', title: 'T', message: 'M' })
    expect(c.notification.createMany).not.toHaveBeenCalled()
  })
})
