import { describe, it, expect, vi } from 'vitest'

/**
 * BUG-004 (HU-115) — el helper getAgentTenantContext nunca debe devolver
 * sucursales de otro tenant.
 *
 * El mock de withTenantContext simula el comportamiento de PostgreSQL con RLS:
 * aplica el filtro `where.tenantId` sobre un dataset que contiene sucursales de
 * varias empresas. Si el helper olvidara el filtro (o usara un tenantId distinto),
 * el test fallaría.
 */

const BRANCHES = [
  { tenantId: 'tenant-A', name: 'Sede A — Bogotá' },
  { tenantId: 'tenant-A', name: 'Sede A — Medellín' },
  { tenantId: 'tenant-B', name: 'Sede B — Cali' },
]

const TENANTS: Record<string, { name: string; currency: string; timezone: string }> = {
  'tenant-A': { name: 'Empresa A', currency: 'COP', timezone: 'America/Bogota' },
  'tenant-B': { name: 'Empresa B', currency: 'USD', timezone: 'America/New_York' },
}

vi.mock('../../lib/prisma', () => ({
  withTenantContext: async (
    _tenantId: string,
    fn: (tx: unknown) => Promise<unknown>,
  ) => {
    const tx = {
      tenant: {
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
          const t = TENANTS[where.id]
          if (!t) throw new Error('Tenant no encontrado')
          return t
        },
      },
      branch: {
        findMany: async ({ where }: { where: { tenantId: string } }) =>
          BRANCHES.filter((b) => b.tenantId === where.tenantId).map((b) => ({ name: b.name })),
      },
    }
    return fn(tx)
  },
}))

import { getAgentTenantContext } from './tenant-context'

describe('getAgentTenantContext — BUG-004 (aislamiento de sucursales)', () => {
  it('carga nombre, moneda y sucursales del tenant solicitado', async () => {
    const ctx = await getAgentTenantContext('tenant-A')
    expect(ctx.tenantName).toBe('Empresa A')
    expect(ctx.currency).toBe('COP')
    expect(ctx.timezone).toBe('America/Bogota') // HU-189 — zona horaria del tenant
    expect(ctx.branches).toEqual(['Sede A — Bogotá', 'Sede A — Medellín'])
  })

  it('NUNCA devuelve sucursales de otro tenant', async () => {
    const ctx = await getAgentTenantContext('tenant-B')
    expect(ctx.branches).toEqual(['Sede B — Cali'])
    expect(ctx.branches).not.toContain('Sede A — Bogotá')
    expect(ctx.branches).not.toContain('Sede A — Medellín')
  })
})
