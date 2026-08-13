/**
 * HU-198 — Reglas del módulo Proyectos (funciones puras, sin DB):
 *   · computeProgress — avance (objetivo) y consumo (límite), umbral de aviso (monto o % derivado).
 *   · CreateProjectSchema — tipo objetivo/límite, umbral solo en límite, fin ≥ inicio, umbral ≤ meta.
 */
import { describe, it, expect } from 'vitest'
import { computeProgress } from './service'
import { CreateProjectSchema, PROJECT_TYPES, PROJECT_STATUSES } from './schema'

describe('HU-198 — computeProgress', () => {
  it('objetivo: alcanza la meta → reached, sin remaining', () => {
    const p = computeProgress({ type: 'objetivo', targetAmount: 1000, alertAmount: null, alertPct: null }, 1000)
    expect(p.pct).toBe(100); expect(p.reached).toBe(true); expect(p.exceeded).toBe(false); expect(p.remaining).toBe(0)
  })

  it('objetivo a medias: pct y remaining correctos', () => {
    const p = computeProgress({ type: 'objetivo', targetAmount: 1000, alertAmount: null, alertPct: null }, 250)
    expect(p.pct).toBe(25); expect(p.reached).toBe(false); expect(p.remaining).toBe(750)
  })

  it('límite: umbral por MONTO y detección de exceso', () => {
    const p = computeProgress({ type: 'limite', targetAmount: 1000, alertAmount: 800, alertPct: null }, 1200)
    expect(p.alertAt).toBe(800); expect(p.alertReached).toBe(true); expect(p.exceeded).toBe(true); expect(p.remaining).toBe(0)
  })

  it('límite: umbral por % se deriva a monto', () => {
    const p = computeProgress({ type: 'limite', targetAmount: 1000, alertAmount: null, alertPct: 90 }, 500)
    expect(p.alertAt).toBe(900); expect(p.alertReached).toBe(false); expect(p.exceeded).toBe(false)
  })

  it('sin avance: current=0, pct=0 (base de HU-198; las transacciones llegan en HU-199)', () => {
    const p = computeProgress({ type: 'limite', targetAmount: 1000, alertAmount: null, alertPct: null })
    expect(p.current).toBe(0); expect(p.pct).toBe(0)
  })
})

describe('HU-198 — CreateProjectSchema', () => {
  const base = { name: 'X', targetAmount: 1000, startDate: '2026-08-01', endDate: '2026-12-31' }

  it('objetivo válido', () => {
    expect(CreateProjectSchema.safeParse({ ...base, type: 'objetivo' }).success).toBe(true)
  })

  it('límite con umbral (monto) válido', () => {
    expect(CreateProjectSchema.safeParse({ ...base, type: 'limite', alertAmount: 800 }).success).toBe(true)
  })

  it('objetivo con umbral → inválido (el umbral solo aplica a límite)', () => {
    expect(CreateProjectSchema.safeParse({ ...base, type: 'objetivo', alertAmount: 800 }).success).toBe(false)
  })

  it('umbral por monto Y por % a la vez → inválido', () => {
    expect(CreateProjectSchema.safeParse({ ...base, type: 'limite', alertAmount: 800, alertPct: 90 }).success).toBe(false)
  })

  it('umbral mayor que el límite → inválido', () => {
    expect(CreateProjectSchema.safeParse({ ...base, type: 'limite', alertAmount: 1200 }).success).toBe(false)
  })

  it('fin anterior al inicio → inválido', () => {
    const r = CreateProjectSchema.safeParse({ ...base, type: 'objetivo', endDate: '2026-07-01' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes('endDate'))).toBe(true)
  })

  it('meta ≤ 0 → inválido', () => {
    expect(CreateProjectSchema.safeParse({ ...base, type: 'objetivo', targetAmount: 0 }).success).toBe(false)
  })

  it('tipos y estados esperados', () => {
    expect(PROJECT_TYPES).toEqual(['objetivo', 'limite'])
    expect(PROJECT_STATUSES).toEqual(['activo', 'en_curso', 'terminado', 'cancelado'])
  })

  it('HU-200 — plazo (graceDays) válido en un límite', () => {
    expect(CreateProjectSchema.safeParse({ ...base, type: 'limite', alertAmount: 800, graceDays: 3 }).success).toBe(true)
  })

  it('HU-200 — plazo fuera de rango (0 o > 30) → inválido', () => {
    expect(CreateProjectSchema.safeParse({ ...base, type: 'limite', graceDays: 0 }).success).toBe(false)
    expect(CreateProjectSchema.safeParse({ ...base, type: 'limite', graceDays: 45 }).success).toBe(false)
  })
})

describe('HU-200 — computeProgress marca el exceso (sobre-límite)', () => {
  it('límite superado → exceeded, pct sobre 100 (cap en la barra), remaining 0', () => {
    const p = computeProgress({ type: 'limite', targetAmount: 1000, alertAmount: null, alertPct: null }, 1200)
    expect(p.exceeded).toBe(true)
    expect(p.remaining).toBe(0)
    expect(p.pct).toBe(120)
  })
})
