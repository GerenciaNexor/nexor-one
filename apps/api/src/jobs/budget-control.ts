import { expireOverdueApprovals } from '../modules/proyectos/budget'

/**
 * HU-200 — Vencimiento del plazo de sobregasto. Barre las solicitudes EN ESPERA cuya `dueAt` ya pasó
 * y las hace entrar como SOBRE-LÍMITE (exceso) con trazabilidad, notificando a los admins. La lógica
 * (multi-tenant, directPrisma con filtro por tenant) vive en `expireOverdueApprovals`.
 *
 * Granularidad de horas: corre cada hora. (Como el resto de jobs V1, es setInterval; en V2 → BullMQ.)
 */
const ONE_HOUR_MS = 60 * 60 * 1000

export async function runBudgetControl(): Promise<void> {
  try {
    const n = await expireOverdueApprovals()
    if (n > 0) console.info(`[Budget Control Job] ${n} sobregasto(s) vencido(s) → entraron como sobre-límite`)
  } catch (err) {
    console.error('[Budget Control Job] Error al vencer sobregastos:', err)
  }
}

export function startBudgetControlScheduler(): void {
  // Corrida inicial al arrancar (por si el server estuvo caído cuando vencía un plazo).
  runBudgetControl().catch((err) => console.error('[Budget Control Job] Error en corrida inicial:', err))
  setInterval(() => { runBudgetControl().catch(() => {}) }, ONE_HOUR_MS)
  console.info('[Budget Control Job] Scheduler registrado — corre cada 1 h')
}
