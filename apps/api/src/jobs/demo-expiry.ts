/**
 * HU-142 — Job de expiración de demos. Cada hora (y una vez al arrancar) suspende los tenants
 * en modo demo cuya fecha de fin ya pasó: pone `is_active=false` (el `tenantHook` bloquea el
 * acceso con 403 TENANT_DISABLED) SIN borrar datos — se conservan para una posible conversión
 * a cuenta real (HU-146). Cada suspensión queda auditada (`tenant.demo_expire`, actor "system").
 *
 * Fuera de contexto de request y de tenant: la lógica vive en `expireOverdueDemos`, que usa
 * `directPrisma` con filtros explícitos (patrón worker/jobs). En V2 → BullMQ repeatable.
 */
import { expireOverdueDemos } from '../modules/platform/tenants'

const ONE_HOUR_MS = 60 * 60 * 1000

async function run(): Promise<void> {
  const { suspended, ids } = await expireOverdueDemos()
  if (suspended > 0) {
    console.info(`[Demo Expiry] ${suspended} demo(s) vencida(s) suspendida(s): ${ids.join(', ')}`)
  }
}

export function startDemoExpiryScheduler(): void {
  // Corrida inicial al arrancar (no bloquea el listen) + cada hora.
  // En test (E2E) NO se corre al arrancar: evita efectos de BD durante los tests.
  if (process.env['NODE_ENV'] !== 'test') {
    run().catch((err) => console.error('[Demo Expiry] Error en corrida inicial:', err))
  }
  setInterval(() => {
    run().catch((err) => console.error('[Demo Expiry] Error en ejecución horaria:', err))
  }, ONE_HOUR_MS)
  console.info('[Demo Expiry] Scheduler registrado — corre cada 1 h')
}

export { run as runDemoExpiry }
