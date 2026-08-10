/**
 * Guarda anti-bucle de Gmail — HU-184.
 *
 * El agente envía su respuesta DESDE la cuenta conectada; ese correo saliente reaparece en el
 * historial del buzón. Si se procesara como entrante, el agente se respondería a sí mismo y se
 * generaría un bucle infinito de correos reales (se observó pasar de 73 a 90+ en minutos).
 *
 * Regla dura: un correo que provenga de la propia cuenta del agente se ignora por completo (no se
 * guarda, no dispara al agente, no responde). Este módulo es PURO (sin BD) para poder probarlo.
 */

/** Extrae la dirección de un header From ("Nombre <a@b.com>" → "a@b.com"), en minúsculas. */
export function extractEmail(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/)
  return (match?.[1] ?? fromHeader).toLowerCase().trim()
}

/**
 * ¿El correo proviene de la PROPIA cuenta del agente/integración? (HU-184).
 *
 * True si:
 *   - el mensaje tiene la etiqueta SENT o DRAFT (lo generó/envió la propia cuenta — cubre CUALQUIER
 *     alias de envío, porque todo lo que la cuenta manda queda en SENT), o
 *   - el remitente coincide con la dirección conectada o con alguno de sus alias declarados.
 *
 * Comparación normalizada (minúsculas/espacios) para no fallar por formato.
 */
export function isOwnGmailMessage(params: {
  from:       string
  labelIds?:  readonly string[] | null
  ownEmail:   string
  aliases?:   readonly string[]
}): boolean {
  const labels = params.labelIds ?? []
  if (labels.includes('SENT') || labels.includes('DRAFT')) return true

  const fromEmail = extractEmail(params.from)
  const own = new Set(
    [params.ownEmail, ...(params.aliases ?? [])]
      .map((e) => (e ?? '').toLowerCase().trim())
      .filter(Boolean),
  )
  return own.has(fromEmail)
}
