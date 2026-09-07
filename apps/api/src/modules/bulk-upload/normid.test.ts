/**
 * HU-206 — La comparación de duplicados es NORMALIZADA: ignora guiones, espacios y mayúsculas.
 * "1234-5" = "12345"; "d1" = "D1". Este es el contrato que decide qué es el mismo registro.
 */
import { describe, it, expect } from 'vitest'
import { normId } from './service'

describe('HU-206 — normId (identificador normalizado)', () => {
  it('ignora guiones y espacios', () => {
    expect(normId('1234-5')).toBe(normId('12345'))
    expect(normId('900.276.962-1'.replace(/\./g, ''))).toBe(normId('900276962 1')) // guion/espacio equivalentes
    expect(normId(' a b - c ')).toBe('abc')
  })

  it('ignora mayúsculas/minúsculas', () => {
    expect(normId('D1')).toBe(normId('d1'))
    expect(normId('SKU-001')).toBe(normId('sku001'))
    expect(normId('Correo@Empresa.COM')).toBe(normId('correo@empresa.com'))
  })

  it('vacío/nulo → cadena vacía (no compara)', () => {
    expect(normId('')).toBe('')
    expect(normId(null)).toBe('')
    expect(normId(undefined)).toBe('')
  })
})
