/**
 * Pruebas unitarias — servicio de cifrado AES-256-CBC
 * HU-031: Cifrado de tokens de integración
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// ─── Clave de prueba (64 hex chars = 32 bytes) ────────────────────────────────
const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

// Cargamos las funciones dinámicamente en cada test para que los cambios
// en process.env sean efectivos (los módulos ESM se cachean).
async function loadService() {
  // Vitest limpia el módulo entre tests con importaciones dinámicas + vi.resetModules()
  const mod = await import('./encryption')
  return mod
}

describe('encryption service', () => {

  beforeEach(() => {
    process.env['ENCRYPTION_KEY'] = TEST_KEY
  })

  afterEach(() => {
    delete process.env['ENCRYPTION_KEY']
  })

  // ── cifrar y descifrar ──────────────────────────────────────────────────────

  it('encrypt + decrypt devuelve el texto original', async () => {
    const { encrypt, decrypt } = await loadService()
    const plaintext = 'EAAxxxxx_whatsapp_access_token_super_secreto'

    const ciphertext = encrypt(plaintext)
    const recovered  = decrypt(ciphertext)

    expect(recovered).toBe(plaintext)
  })

  it('funciona con tokens de longitud variable', async () => {
    const { encrypt, decrypt } = await loadService()
    const tokens = [
      'a',
      'token_corto',
      'ya29.a0AfH6SMC_gmail_oauth_token_muy_largo_' + 'x'.repeat(200),
      '{"access_token":"EAA","token_type":"bearer","expires_in":5183944}',
    ]

    for (const token of tokens) {
      expect(decrypt(encrypt(token))).toBe(token)
    }
  })

  // ── IV único por operación ──────────────────────────────────────────────────

  it('cada cifrado produce un texto diferente aunque el plaintext sea igual', async () => {
    const { encrypt } = await loadService()
    const plaintext = 'mismo_token'

    const c1 = encrypt(plaintext)
    const c2 = encrypt(plaintext)
    const c3 = encrypt(plaintext)

    // Ciphertexts distintos (IV aleatorio garantiza esto)
    expect(c1).not.toBe(c2)
    expect(c2).not.toBe(c3)
    expect(c1).not.toBe(c3)
  })

  it('el texto cifrado tiene el formato iv_hex:ciphertext_hex', async () => {
    const { encrypt } = await loadService()
    const ciphertext = encrypt('token_de_prueba')

    const parts = ciphertext.split(':')
    expect(parts).toHaveLength(2)

    const [ivHex, ctHex] = parts
    // IV = 16 bytes = 32 hex chars
    expect(ivHex).toMatch(/^[0-9a-f]{32}$/)
    // Ciphertext: al menos 16 chars (un bloque AES)
    expect(ctHex!.length).toBeGreaterThanOrEqual(32)
    expect(ctHex).toMatch(/^[0-9a-f]+$/)
  })

  // ── Validación de ENCRYPTION_KEY ───────────────────────────────────────────

  it('lanza error si ENCRYPTION_KEY no está configurada', async () => {
    delete process.env['ENCRYPTION_KEY']
    const { encrypt } = await loadService()

    expect(() => encrypt('algo')).toThrow(/ENCRYPTION_KEY/)
  })

  it('lanza error si ENCRYPTION_KEY está vacía', async () => {
    process.env['ENCRYPTION_KEY'] = ''
    const { encrypt } = await loadService()

    expect(() => encrypt('algo')).toThrow(/ENCRYPTION_KEY/)
  })

  it('lanza error si ENCRYPTION_KEY tiene longitud incorrecta (no 32 bytes)', async () => {
    // 60 hex chars = 30 bytes — inválido
    process.env['ENCRYPTION_KEY'] = '0'.repeat(60)
    const { encrypt } = await loadService()

    expect(() => encrypt('algo')).toThrow(/32 bytes/)
  })

  it('validateEncryptionKey no lanza si la clave es válida', async () => {
    const { validateEncryptionKey } = await loadService()
    expect(() => validateEncryptionKey()).not.toThrow()
  })

  it('validateEncryptionKey lanza si ENCRYPTION_KEY no está configurada', async () => {
    delete process.env['ENCRYPTION_KEY']
    const { validateEncryptionKey } = await loadService()
    expect(() => validateEncryptionKey()).toThrow(/ENCRYPTION_KEY/)
  })

  // ── Formato inválido en decrypt ─────────────────────────────────────────────

  it('decrypt lanza error si el formato es inválido', async () => {
    const { decrypt } = await loadService()

    expect(() => decrypt('sin_separador')).toThrow(/Formato de texto cifrado inválido/)
    expect(() => decrypt(':')).toThrow(/Formato de texto cifrado inválido/)
    expect(() => decrypt('')).toThrow()
  })

  // ── Seguridad: el texto cifrado no contiene el plaintext ───────────────────

  it('el texto cifrado no contiene el texto original legible', async () => {
    const { encrypt } = await loadService()
    const plaintext  = 'secreto_muy_importante'
    const ciphertext = encrypt(plaintext)

    expect(ciphertext).not.toContain(plaintext)
  })
})
