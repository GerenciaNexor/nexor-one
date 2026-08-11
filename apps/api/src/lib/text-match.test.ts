/**
 * HU-191 — matching LOCAL de ítems de factura contra el catálogo (sin API). Debe tolerar tildes,
 * plural/singular y coincidencias parciales, pero NO emparejar por ruido.
 */
import { describe, it, expect } from 'vitest'
import { matchProductByName, normalize, singular } from './text-match'

const catalog = [
  { id: 'p1', name: 'Audífonos diadema', sku: 'NX-005' },
  { id: 'p2', name: 'Monitor 27" 144Hz', sku: 'NX-003' },
  { id: 'p3', name: 'Memoria RAM 16GB', sku: 'NX-008' },
]

describe('HU-191 — matchProductByName', () => {
  it('tolera tildes: "audifonos" → "Audífonos diadema"', () => {
    expect(matchProductByName('audifonos', catalog)?.id).toBe('p1')
  })

  it('tolera plural: "monitores" → "Monitor 27\\" 144Hz"', () => {
    expect(matchProductByName('monitores gamer', catalog)?.id).toBe('p2')
  })

  it('coincide por SKU', () => {
    expect(matchProductByName('NX-008', catalog)?.id).toBe('p3')
  })

  it('NO empareja algo que no está: "café molido" → null', () => {
    expect(matchProductByName('café molido premium', catalog)).toBeNull()
  })

  it('NO empareja por una sola palabra de ruido con umbral', () => {
    // "16 unidades varias" comparte "16" con "Memoria RAM 16GB" pero no supera la mitad → null.
    expect(matchProductByName('16 unidades varias surtidas', catalog)).toBeNull()
  })

  it('normalize/singular funcionan aislados', () => {
    // normalize quita TODA marca diacrítica (incluida la ñ→n) para un matching tolerante.
    expect(normalize('Café ÑOÑO')).toBe('cafe nono')
    // Regla simple: las terminaciones en 'es' pierden 'es' (aproximación suficiente para matching,
    // porque consulta y catálogo pasan por la MISMA transformación).
    expect(singular('cables')).toBe('cabl')
    expect(singular('monitores')).toBe('monitor')
    expect(singular('audifonos')).toBe('audifono')
  })
})
