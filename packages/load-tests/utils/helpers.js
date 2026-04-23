/**
 * Utilidades compartidas para los load tests de NEXOR.
 *
 * Uso:
 *   import { login, authHeaders, checkOk } from '../utils/helpers.js'
 */

import http from 'k6/http'
import { check } from 'k6'

/**
 * Autentica un usuario y devuelve el JWT.
 * Lanza un error si el login falla (detiene el setup).
 */
export function login(baseUrl, email, password) {
  const res = http.post(
    `${baseUrl}/v1/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' }, timeout: '15s' },
  )

  if (res.status !== 200) {
    const msg = `[login] Fallo autenticación para ${email}: HTTP ${res.status} — ${res.body?.slice(0, 200)}`
    console.error(msg)
    throw new Error(msg)
  }

  const body = JSON.parse(res.body)
  if (!body.token) {
    throw new Error(`[login] Respuesta sin token para ${email}`)
  }
  return body.token
}

/** Construye los headers HTTP con el Bearer token. */
export function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Verifica que la respuesta es exitosa (2xx) y registra el resultado.
 * Devuelve true si el check pasó.
 */
export function checkOk(res, label) {
  return check(res, {
    [`${label} — status 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${label} — body no vacío`]: (r) => r.body !== null && r.body.length > 0,
  })
}

/**
 * Parsea el body JSON de una respuesta de forma segura.
 * Devuelve {} si el body no es JSON válido.
 */
export function safeJson(res) {
  try {
    return JSON.parse(res.body)
  } catch {
    return {}
  }
}

/**
 * Genera un número aleatorio entre min (inclusive) y max (inclusive).
 */
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Selecciona aleatoriamente un elemento de un array.
 */
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}
