/**
 * Servicio de cifrado AES-256-CBC para tokens de integración.
 *
 * Formato del texto cifrado: "<iv_hex>:<ciphertext_hex>"
 * El IV es aleatorio y único por cada operación — nunca se reutiliza.
 *
 * La clave se lee EXCLUSIVAMENTE desde ENCRYPTION_KEY (variable de entorno).
 * Debe ser una cadena hexadecimal de 64 caracteres (= 32 bytes).
 */

import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH  = 16   // bytes (128 bits — requerimiento de AES-CBC)
const KEY_BYTES  = 32   // bytes (256 bits — AES-256)

// ─── Clave ────────────────────────────────────────────────────────────────────

/**
 * Lee y valida ENCRYPTION_KEY desde el entorno.
 * Lanza un Error descriptivo si falta o tiene longitud incorrecta.
 * Llamada en cada operación para que los tests puedan sobreescribir
 * la variable antes de importar el módulo.
 */
function getKey(): Buffer {
  const raw = process.env['ENCRYPTION_KEY']

  if (!raw || raw.trim() === '') {
    throw new Error(
      '[encryption] La variable de entorno ENCRYPTION_KEY no está configurada. ' +
      'Genera una clave con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" ' +
      'y asígnala antes de arrancar el servidor.',
    )
  }

  const buf = Buffer.from(raw, 'hex')

  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `[encryption] ENCRYPTION_KEY debe decodificar a exactamente ${KEY_BYTES} bytes ` +
      `(cadena hex de ${KEY_BYTES * 2} caracteres). ` +
      `Longitud recibida: ${buf.length} bytes (${raw.length} caracteres).`,
    )
  }

  return buf
}

// ─── Validación en arranque ───────────────────────────────────────────────────

/**
 * Valida que ENCRYPTION_KEY esté correctamente configurada.
 * Debe llamarse en el arranque del servidor (app.ts) para fallar
 * rápido con un mensaje claro si la variable no está disponible.
 */
export function validateEncryptionKey(): void {
  getKey() // lanza si falta o es inválida
}

// ─── Cifrado ──────────────────────────────────────────────────────────────────

/**
 * Cifra texto plano con AES-256-CBC.
 *
 * @param plaintext  Texto a cifrar (token de WhatsApp, Gmail, etc.)
 * @returns          Cadena con formato "iv_hex:ciphertext_hex"
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv  = crypto.randomBytes(IV_LENGTH)

  const cipher    = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

// ─── Descifrado ───────────────────────────────────────────────────────────────

/**
 * Descifra un texto cifrado por `encrypt()`.
 *
 * @param encryptedText  Cadena con formato "iv_hex:ciphertext_hex"
 * @returns              Texto original en claro
 * @throws               Si el formato es inválido o la clave no coincide
 */
export function decrypt(encryptedText: string): string {
  const key   = getKey()
  const parts = encryptedText.split(':')

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      '[encryption] Formato de texto cifrado inválido. ' +
      'Se esperaba "iv_hex:ciphertext_hex".',
    )
  }

  const iv         = Buffer.from(parts[0], 'hex')
  const ciphertext = Buffer.from(parts[1], 'hex')

  if (iv.length !== IV_LENGTH) {
    throw new Error(
      `[encryption] IV inválido: se esperaban ${IV_LENGTH} bytes, se recibieron ${iv.length}.`,
    )
  }

  const decipher  = crypto.createDecipheriv(ALGORITHM, key, iv)
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}
