/**
 * HU-156/157 — Cálculo de la próxima ocurrencia de un recordatorio recurrente.
 * Fuente ÚNICA de la lógica de recurrencia: la usan el job de disparo (reminder-fire)
 * y el "marcar como hecho" de una ocurrencia (service). No se duplica.
 */

const STEP_MS: Record<string, number> = {
  hourly: 3_600_000,
  daily:  86_400_000,
  weekly: 604_800_000,
}

/** Próxima ocurrencia estrictamente futura (> `now`), o `null` si no es recurrente. */
export function nextOccurrence(from: Date, recurrence: string, now: Date): Date | null {
  if (recurrence === 'none') return null
  const d = new Date(from)
  let guard = 0
  do {
    if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1)
    else d.setTime(d.getTime() + (STEP_MS[recurrence] ?? STEP_MS['daily']!))
  } while (d.getTime() <= now.getTime() && ++guard < 100_000)
  return d
}
