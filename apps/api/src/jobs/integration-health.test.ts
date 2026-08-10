/**
 * Las conexiones deben sobrevivir a los despliegues: un fallo TRANSITORIO (red/TLS/timeout/5xx)
 * del chequeo de salud NO debe marcar el canal como caído; solo un fallo de AUTENTICACIÓN real
 * (token vencido/revocado) lo marca. Esta prueba fija ese comportamiento.
 */
import { describe, it, expect } from 'vitest'
import { isAuthFailure } from './integration-health'

describe('isAuthFailure — transitorio vs auth', () => {
  it('errores TRANSITORIOS → false (no se marca caído)', () => {
    const transitorios = [
      'error:1C800064:Provider routines::bad decrypt', // el error de TLS que rompía en cada deploy
      'fetch failed',
      'ECONNRESET',
      'connect ETIMEDOUT 157.240.1.1:443',
      'socket hang up',
      'getaddrinfo EAI_AGAIN graph.facebook.com',
      'HTTP 503',
      'HTTP 500',
    ]
    for (const d of transitorios) expect(isAuthFailure(d)).toBe(false)
    // 5xx/errores de red por código tampoco:
    expect(isAuthFailure('algo', 500)).toBe(false)
    expect(isAuthFailure('algo', 502)).toBe(false)
  })

  it('errores de AUTH → true (token vencido/revocado, se marca caído)', () => {
    const auth = [
      'invalid_grant',
      'Error validating access token: Session has expired (#190)',
      'OAuthException',
      'The access token has expired',
      'refresh token revoked',
      'unauthorized',
    ]
    for (const d of auth) expect(isAuthFailure(d)).toBe(true)
    expect(isAuthFailure('cualquier cosa', 401)).toBe(true)
    expect(isAuthFailure('cualquier cosa', 403)).toBe(true)
  })
})
