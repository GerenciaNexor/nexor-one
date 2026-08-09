/**
 * HU-182 — La respuesta del agente por Gmail debe poder ENVIARSE.
 * Guarda de regresión: el scope gmail.send (además de readonly) debe estar en los scopes OAuth.
 * Sin él, gmail.users.messages.send falla con 403 y el correo nunca llega al remitente.
 */
import { describe, it, expect } from 'vitest'
import { GMAIL_SCOPES } from './service'

describe('HU-182 — scopes de Gmail', () => {
  it('incluye gmail.send (envío de la respuesta)', () => {
    expect(GMAIL_SCOPES).toContain('https://www.googleapis.com/auth/gmail.send')
  })

  it('sigue incluyendo gmail.readonly (lectura de entrantes)', () => {
    expect(GMAIL_SCOPES).toContain('https://www.googleapis.com/auth/gmail.readonly')
  })
})
