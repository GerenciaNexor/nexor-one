/**
 * HU-184 — Regla dura: un correo de la PROPIA cuenta del agente se ignora por completo.
 * Estas pruebas demuestran que un correo del propio agente (por remitente o etiqueta SENT/DRAFT)
 * es detectado como propio → el worker lo salta → no genera otra respuesta (no hay bucle).
 */
import { describe, it, expect } from 'vitest'
import { extractEmail, isOwnGmailMessage } from './gmail-loop-guard'

const OWN = 'demonexor4@gmail.com'

describe('HU-184 — extractEmail', () => {
  it('extrae la dirección de "Nombre <a@b.com>"', () => {
    expect(extractEmail('Demo Nexor <demonexor4@gmail.com>')).toBe('demonexor4@gmail.com')
  })
  it('acepta una dirección suelta y normaliza a minúsculas', () => {
    expect(extractEmail('DEMONEXOR4@Gmail.com')).toBe('demonexor4@gmail.com')
  })
})

describe('HU-184 — isOwnGmailMessage (correo propio se ignora)', () => {
  it('remitente = cuenta conectada → propio (true)', () => {
    expect(isOwnGmailMessage({ from: OWN, ownEmail: OWN })).toBe(true)
  })

  it('remitente con nombre para mostrar = cuenta conectada → propio', () => {
    expect(isOwnGmailMessage({ from: 'Demo <demonexor4@gmail.com>', ownEmail: OWN })).toBe(true)
  })

  it('comparación insensible a mayúsculas → propio', () => {
    expect(isOwnGmailMessage({ from: 'DEMONEXOR4@GMAIL.COM', ownEmail: OWN })).toBe(true)
  })

  it('etiqueta SENT → propio (cubre cualquier alias de envío)', () => {
    expect(isOwnGmailMessage({ from: 'otra@empresa.com', labelIds: ['SENT'], ownEmail: OWN })).toBe(true)
  })

  it('etiqueta DRAFT → propio', () => {
    expect(isOwnGmailMessage({ from: 'x@y.com', labelIds: ['DRAFT'], ownEmail: OWN })).toBe(true)
  })

  it('alias de envío declarado → propio', () => {
    expect(isOwnGmailMessage({ from: 'ventas@nexor-one.com', ownEmail: OWN, aliases: ['ventas@nexor-one.com'] })).toBe(true)
  })

  it('correo de un CLIENTE externo → NO propio (false, sí se atiende)', () => {
    expect(isOwnGmailMessage({ from: 'Jeiber <jeiberjim@gmail.com>', labelIds: ['INBOX'], ownEmail: OWN })).toBe(false)
  })

  it('sin ownEmail y sin etiquetas → no se marca propio por error', () => {
    expect(isOwnGmailMessage({ from: 'jeiberjim@gmail.com', ownEmail: '' })).toBe(false)
  })
})
