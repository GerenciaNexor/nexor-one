/**
 * HU-207 — Normalización de números para la Cloud API de WhatsApp (E.164 sin '+', solo dígitos).
 * Un número inválido devuelve null → la capa central no intenta enviar y registra el motivo.
 */
import { describe, it, expect } from 'vitest'
import { normalizePhone } from './whatsapp'

describe('HU-207 — normalizePhone', () => {
  it('celular colombiano de 10 dígitos → antepone el indicativo 57', () => {
    expect(normalizePhone('3001234567')).toBe('573001234567')
    expect(normalizePhone('300 123 4567')).toBe('573001234567')
    expect(normalizePhone('300-123-4567')).toBe('573001234567')
  })

  it('ya en formato internacional → se conserva (quita símbolos)', () => {
    expect(normalizePhone('+57 300 123 4567')).toBe('573001234567')
    expect(normalizePhone('57 300 123 4567')).toBe('573001234567')
    expect(normalizePhone('0057 300 1234567')).toBe('573001234567') // prefijo 00 internacional
  })

  it('inválido (vacío/corto/no numérico) → null', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
    expect(normalizePhone('123')).toBeNull()
    expect(normalizePhone('abc')).toBeNull()
    expect(normalizePhone('9'.repeat(16))).toBeNull() // demasiado largo
  })
})
