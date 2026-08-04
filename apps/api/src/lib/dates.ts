/**
 * Fecha de calendario "hoy" en la zona del negocio, como Date a medianoche UTC.
 *
 * Los campos `@db.Date` (p. ej. `transactions.date`) son fechas de calendario, no instantes.
 * Guardar `new Date()` toma la fecha **UTC**, que en zonas negativas (Colombia, UTC-5) puede ser
 * el día siguiente por la tarde/noche; y mostrarla en zona local la corre un día hacia atrás.
 * Este helper fija la fecha del día en la zona del negocio (por defecto America/Bogota) y la ancla a
 * medianoche UTC, de modo que combinada con un formateo en UTC en el frontend siempre muestra el día
 * correcto, sin importar la hora.
 */
export function businessToday(tz = 'America/Bogota'): Date {
  // en-CA formatea como YYYY-MM-DD.
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return new Date(`${ymd}T00:00:00.000Z`)
}
