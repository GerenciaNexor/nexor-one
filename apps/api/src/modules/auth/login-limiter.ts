/**
 * Bloqueo de login por IP — respaldado en Redis (HU-113).
 *
 * Tras MAX_FAILURES intentos fallidos consecutivos dentro de WINDOW_SECONDS, la IP
 * queda bloqueada durante BLOCK_SECONDS. El conteo y el bloqueo viven en Redis, por lo
 * que son consistentes entre reinicios del proceso y entre múltiples instancias del API.
 *
 * Sin barrido en memoria: las claves expiran solas por TTL.
 *
 * IMPORTANTE: este cliente Redis es independiente de la conexión de BullMQ
 * (la Queue/Worker requieren su propia conexión — ver CLAUDE.md).
 */

import Redis from 'ioredis'
import { redisConnection } from '../../lib/queue'

// ─── Parámetros (configurables por entorno, con los valores de HU-097 por defecto) ──

function intEnv(name: string, def: number): number {
  const n = parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : def
}

const MAX_FAILURES   = intEnv('LOGIN_MAX_FAILURES', 5)
const WINDOW_SECONDS = intEnv('LOGIN_FAILURE_WINDOW_SECONDS', 15 * 60) // 15 min
const BLOCK_SECONDS  = intEnv('LOGIN_BLOCK_DURATION_SECONDS', 15 * 60) // 15 min

/**
 * Decisión de diseño (HU-113, a confirmar por el PO): comportamiento ante una caída de Redis.
 *  - fail-open (default): si Redis no responde, se permite el intento de login. El rate limit
 *    por ruta de /login (10/min por IP) sigue actuando como red de seguridad.
 *  - fail-closed (LOGIN_LIMITER_FAIL_OPEN=false): si Redis no responde, se bloquea el login.
 */
const FAIL_OPEN = process.env['LOGIN_LIMITER_FAIL_OPEN'] !== 'false'

// ─── Claves Redis ─────────────────────────────────────────────────────────────

const failKey  = (ip: string): string => `nexor:login:fail:${ip}`
const blockKey = (ip: string): string => `nexor:login:block:${ip}`

// ─── Cliente Redis dedicado (lazy singleton) ──────────────────────────────────

let client: Redis | null = null

function redis(): Redis {
  if (!client) {
    client = new Redis({
      ...redisConnection(),
      // La cola offline cubre la breve ventana de conexión al arrancar.
      // commandTimeout acota cuánto se espera si Redis no responde, para degradar
      // rápido según FAIL_OPEN en vez de colgar la request de login.
      maxRetriesPerRequest: 1,
      commandTimeout:       2_000,
    })
    // No tumbar el proceso por errores de Redis: el limiter degrada según FAIL_OPEN.
    client.on('error', (err: Error) => {
      console.warn('[login-limiter] Redis error:', err.message)
    })
  }
  return client
}

// ─── Script atómico: incrementa, fija la ventana en el 1er fallo y bloquea al umbral ──

const RECORD_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
if count >= tonumber(ARGV[1]) then
  redis.call('SET', KEYS[2], '1', 'EX', ARGV[3])
  redis.call('DEL', KEYS[1])
  return tonumber(ARGV[3])
end
return 0
`

// ─── API pública ──────────────────────────────────────────────────────────────

export interface BlockState {
  /** true si la IP está bloqueada en este momento. */
  blocked:    boolean
  /** segundos restantes hasta el desbloqueo (0 si no está bloqueada). */
  retryAfter: number
}

/** Devuelve el estado de bloqueo de una IP leyendo el TTL de su clave de bloqueo. */
export async function getBlockState(ip: string): Promise<BlockState> {
  try {
    const pttl = await redis().pttl(blockKey(ip))
    if (pttl > 0) return { blocked: true, retryAfter: Math.ceil(pttl / 1000) }
    return { blocked: false, retryAfter: 0 }
  } catch (err) {
    console.warn('[login-limiter] getBlockState falló:', (err as Error).message)
    // fail-open → no bloquear; fail-closed → bloquear por la duración configurada.
    return FAIL_OPEN ? { blocked: false, retryAfter: 0 } : { blocked: true, retryAfter: BLOCK_SECONDS }
  }
}

/** Registra un intento fallido. Al alcanzar el umbral, la IP queda bloqueada. */
export async function recordFailedAttempt(ip: string): Promise<void> {
  try {
    await redis().eval(
      RECORD_SCRIPT, 2,
      failKey(ip), blockKey(ip),
      String(MAX_FAILURES), String(WINDOW_SECONDS), String(BLOCK_SECONDS),
    )
  } catch (err) {
    // Si Redis falla aquí no podemos contar; el rate limit por ruta sigue activo.
    console.warn('[login-limiter] recordFailedAttempt falló:', (err as Error).message)
  }
}

/** Limpia el contador y el bloqueo de una IP (en login exitoso). */
export async function clearFailedAttempts(ip: string): Promise<void> {
  try {
    await redis().del(failKey(ip), blockKey(ip))
  } catch (err) {
    console.warn('[login-limiter] clearFailedAttempts falló:', (err as Error).message)
  }
}

/** Cierra la conexión Redis del limiter (al apagar el servidor). */
export async function closeLoginLimiter(): Promise<void> {
  if (client) {
    await client.quit().catch(() => { /* noop */ })
    client = null
  }
}
