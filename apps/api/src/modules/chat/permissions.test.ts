/**
 * HU-187 — El alcance del agente interno se deriva del ROL del usuario (reutiliza roles + feature
 * flags de NEXOR, sin inventar un sistema nuevo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/prisma', () => ({ prisma: { featureFlag: { findMany: vi.fn() } } }))

import { prisma } from '../../lib/prisma'
import { allowedModulesForUser } from './service'

/* eslint-disable @typescript-eslint/no-explicit-any */
const mock = prisma as any
const ALL_ACTIVE = [{ module: 'KIRA' }, { module: 'NIRA' }, { module: 'ARI' }, { module: 'AGENDA' }, { module: 'VERA' }]

describe('HU-187 — allowedModulesForUser', () => {
  beforeEach(() => { vi.clearAllMocks(); mock.featureFlag.findMany.mockResolvedValue(ALL_ACTIVE) })

  it('TENANT_ADMIN → todas las áreas activas del tenant', async () => {
    const s = await allowedModulesForUser('TENANT_ADMIN', null, 't1')
    expect([...s.full].sort()).toEqual(['AGENDA', 'ARI', 'KIRA', 'NIRA', 'VERA'])
    expect(s.read).toEqual([])
  })

  it('BRANCH_ADMIN → todas las áreas activas (RLS filtra su sucursal)', async () => {
    const s = await allowedModulesForUser('BRANCH_ADMIN', null, 't1')
    expect(s.full.length).toBe(5)
  })

  it('OPERATIVE de KIRA → solo KIRA', async () => {
    const s = await allowedModulesForUser('OPERATIVE', 'KIRA', 't1')
    expect(s.full).toEqual(['KIRA'])
    expect(s.read).toEqual([])
  })

  it('AREA_MANAGER de NIRA → NIRA total + KIRA/VERA lectura', async () => {
    const s = await allowedModulesForUser('AREA_MANAGER', 'NIRA', 't1')
    expect(s.full).toEqual(['NIRA'])
    expect([...s.read].sort()).toEqual(['KIRA', 'VERA'])
  })

  it('OPERATIVE sin módulo → sin acceso a ninguna área', async () => {
    const s = await allowedModulesForUser('OPERATIVE', null, 't1')
    expect(s.full).toEqual([])
    expect(s.read).toEqual([])
  })

  it('respeta feature flags: un área no activa no aparece en el alcance', async () => {
    mock.featureFlag.findMany.mockResolvedValue([{ module: 'KIRA' }, { module: 'NIRA' }]) // VERA/ARI/AGENDA inactivos
    const s = await allowedModulesForUser('AREA_MANAGER', 'NIRA', 't1')
    expect(s.full).toEqual(['NIRA'])
    expect(s.read).toEqual(['KIRA']) // VERA relacionado pero inactivo → excluido
  })
})
