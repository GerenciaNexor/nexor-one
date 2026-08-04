/**
 * Formateo CENTRAL de fechas (evita el desfase de zona horaria).
 *
 * Hay dos tipos de fecha en el backend y se muestran distinto:
 *  - **Fecha de calendario** (`@db.Date`: `transaction.date`, `deal.expectedClose`, `quote.validUntil`,
 *    `purchaseOrder.expectedDelivery`, `stockMovement.expiryDate`, `blockedDate.date`, series diarias).
 *    Prisma la serializa como medianoche UTC ("2026-08-04T00:00:00.000Z"). Formatearla en zona local
 *    negativa (Colombia UTC-5) la corre un día hacia atrás. → SIEMPRE en UTC con `fmtCalendarDate`.
 *  - **Instante** (Timestamptz: `createdAt`, `closedAt`, `startAt`, `remindAt`, `dueAt`…). Es un momento
 *    exacto; se muestra en la zona del negocio con `fmtInstant`.
 *
 * Un solo lugar para no volver a equivocarse pantalla por pantalla.
 */

/** Zona del negocio. Coincide con `tenants.timezone` (default 'America/Bogota'). */
export const BUSINESS_TZ = 'America/Bogota'

const CAL_DEFAULT: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: '2-digit' }

/** Fecha de calendario (`@db.Date`): se formatea en UTC para no correr el día. */
export function fmtCalendarDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = CAL_DEFAULT): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-CO', { ...opts, timeZone: 'UTC' })
}

/** Instante (Timestamptz): se formatea en la zona del negocio. */
export function fmtInstant(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = CAL_DEFAULT): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-CO', { ...opts, timeZone: BUSINESS_TZ })
}

/** Instante con hora (Timestamptz), en la zona del negocio. */
export function fmtDateTime(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-CO', { ...opts, timeZone: BUSINESS_TZ })
}
