import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * HU-119 (BUG-004, 2ª instancia) — el guardado del agent_log y la notificación de
 * fallback deben escribir vía `withTenantContext` (que setea app.current_tenant_id),
 * para funcionar bajo el rol de aplicación (nexor_app) con RLS, no solo en dev con
 * superusuario. Nunca deben usar el cliente `prisma` sujeto a RLS sin contexto.
 *
 * El mock registra por qué vía se escribe: si alguna escritura usara el cliente
 * `prisma` directo, `bareWriteUsed` quedaría en true y el test fallaría.
 */

const rec = {
  ctxTenantIds: [] as string[],
  logCreates:   [] as { data: { tenantId: string; reply: string | null } }[],
  notifCreates: [] as { data: unknown[] }[],
  bareWriteUsed: false,
}

vi.mock('../../lib/prisma', () => ({
  // Cliente sujeto a RLS — NO debe usarse para escribir log/notificación fuera de request.
  prisma: {
    agentLog:     { create:     async () => { rec.bareWriteUsed = true; return {} } },
    user:         { findMany:   async () => { rec.bareWriteUsed = true; return [] } },
    notification: { createMany: async () => { rec.bareWriteUsed = true; return { count: 0 } } },
  },
  directPrisma: {},
  withTenantContext: async (
    tenantId: string,
    fn: (tx: unknown) => Promise<unknown>,
  ) => {
    rec.ctxTenantIds.push(tenantId)
    const tx = {
      agentLog:     { create:     async (args: { data: { tenantId: string; reply: string | null } }) => { rec.logCreates.push(args); return {} } },
      user:         { findMany:   async () => [{ id: 'u1' }, { id: 'u2' }] },
      notification: { createMany: async (args: { data: unknown[] }) => { rec.notifCreates.push(args); return { count: 2 } } },
    }
    return fn(tx)
  },
}))

import { saveLog, notifyFallback } from './agent.runner'

const baseLog = {
  tenantId:     'tenant-x',
  module:       'AGENDA' as const,
  channel:      'whatsapp' as const,
  inputMessage: 'hola',
  reply:        'respuesta',
  toolsUsed:    ['consultar_sucursales'],
  toolDetails:  [],
  turnCount:    1,
  durationMs:   5,
}

beforeEach(() => {
  rec.ctxTenantIds = []
  rec.logCreates = []
  rec.notifCreates = []
  rec.bareWriteUsed = false
})

describe('AgentRunner — escritura bajo contexto de tenant (HU-119 / BUG-004)', () => {
  it('saveLog escribe el agent_log vía withTenantContext con el tenantId correcto', async () => {
    await saveLog(baseLog)
    expect(rec.ctxTenantIds).toEqual(['tenant-x'])
    expect(rec.logCreates).toHaveLength(1)
    expect(rec.logCreates[0]?.data.tenantId).toBe('tenant-x')
    expect(rec.bareWriteUsed).toBe(false) // nunca el cliente prisma sujeto a RLS
  })

  it('guarda el agent_log aunque el agente falle (reply null / fallback)', async () => {
    await saveLog({ ...baseLog, reply: null })
    expect(rec.logCreates).toHaveLength(1)
    expect(rec.logCreates[0]?.data.reply).toBeNull()
    expect(rec.bareWriteUsed).toBe(false)
  })

  it('notifyFallback crea la notificación vía withTenantContext', async () => {
    await notifyFallback('tenant-x', 'AGENDA', 'whatsapp', 'mensaje', 'api_error')
    expect(rec.ctxTenantIds).toEqual(['tenant-x'])
    expect(rec.notifCreates).toHaveLength(1)
    expect(rec.bareWriteUsed).toBe(false)
  })
})
