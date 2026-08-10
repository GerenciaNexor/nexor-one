/**
 * Job de salud de integraciones — verifica tokens de WhatsApp/Gmail periódicamente.
 *
 * Para cada integración con token:
 *   - WHATSAPP: llama a Graph API de Meta con el access_token descifrado.
 *   - GMAIL:    intenta refrescar el access_token con el refresh_token.
 *
 * CLASIFICACIÓN DE FALLOS (HU — conexiones que sobreviven a los despliegues):
 *   - Éxito           → markIntegrationHealthy (status connected; recupera una caída falsa).
 *   - Fallo de AUTH   → markIntegrationDown (token vencido/revocado — problema real que hay que reconectar).
 *   - Fallo TRANSITORIO (red/TLS/timeout/5xx/rate-limit) → NO se toca el estado. Antes, un bache de
 *     red durante el arranque en frío de cada deploy marcaba el canal "caído" y había que
 *     re-sincronizar a mano. Las credenciales viven en la BD y persisten; el bache es del chequeo.
 *
 * El chequeo revisa TODAS las integraciones con token (no solo las activas), para que una caída
 * falsa se auto-recupere en el siguiente ciclo. Corre al arrancar y cada día.
 */

import { google } from 'googleapis'
import { directPrisma } from '../lib/prisma'
import { decrypt } from '../lib/encryption'
import { markIntegrationDown, markIntegrationHealthy, warnIntegrationExpiring } from '../lib/integration-status'
import { renewGmailWatch } from '../modules/integrations/service'

const ONE_DAY_MS       = 24 * 60 * 60 * 1000
const EXPIRY_WARN_DAYS = 3          // avisar cuando falten ≤ 3 días para vencer

type CheckResult = { ok: true } | { ok: false; detail: string; auth: boolean }

/**
 * ¿El detalle del error indica un fallo de AUTENTICACIÓN definitivo (token vencido/revocado)?
 * Solo esos marcan el canal caído. Todo lo demás (red, TLS, timeouts, 5xx, rate-limit) es transitorio.
 */
export function isAuthFailure(detail: string, httpStatus?: number): boolean {
  if (httpStatus === 401 || httpStatus === 403) return true
  return /invalid_grant|invalid grant|unauthorized_client|#190|oauthexception|access token|token (has )?expired|expired|revoked|unauthorized|forbidden|invalid credentials|permission/i
    .test(detail)
}

// ─── Verificadores por canal ──────────────────────────────────────────────────

async function checkWhatsApp(phoneNumberId: string, encryptedToken: string): Promise<CheckResult> {
  try {
    const accessToken = decrypt(encryptedToken)
    const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (resp.ok) return { ok: true }
    const body = await resp.json().catch(() => ({})) as { error?: { message?: string } }
    const detail = body.error?.message ?? `HTTP ${resp.status}`
    return { ok: false, detail, auth: isAuthFailure(detail, resp.status) }
  } catch (err) {
    // Error de red/TLS al contactar Meta → transitorio (auth:false), no marca caído.
    return { ok: false, detail: err instanceof Error ? err.message : 'Error al contactar Meta', auth: false }
  }
}

async function checkGmail(encryptedRefreshToken: string): Promise<CheckResult> {
  try {
    const refreshToken = decrypt(encryptedRefreshToken)
    const oauthClient  = new google.auth.OAuth2(process.env['GOOGLE_CLIENT_ID'], process.env['GOOGLE_CLIENT_SECRET'])
    oauthClient.setCredentials({ refresh_token: refreshToken })
    const { credentials } = await oauthClient.refreshAccessToken()
    if (credentials.access_token) return { ok: true }
    return { ok: false, detail: 'Sin access_token del refresh', auth: false }
  } catch (err) {
    // invalid_grant = refresh token revocado/expirado (auth real); lo demás (red) es transitorio.
    const detail = err instanceof Error ? err.message : 'Fallo al refrescar el token'
    return { ok: false, detail, auth: isAuthFailure(detail) }
  }
}

// ─── Verificación de una sola integración ────────────────────────────────────

async function verifyIntegration(integ: {
  id: string; tenantId: string; channel: string; identifier: string; tokenEncrypted: string; tokenExpiresAt: Date | null; status: string
}): Promise<{ healthy: boolean }> {
  const channel = integ.channel as 'WHATSAPP' | 'GMAIL'
  const ref = { id: integ.id, tenantId: integ.tenantId, channel: integ.channel, identifier: integ.identifier }

  const res = channel === 'WHATSAPP'
    ? await checkWhatsApp(integ.identifier, integ.tokenEncrypted)
    : channel === 'GMAIL' ? await checkGmail(integ.tokenEncrypted) : { ok: true as const }

  if (res.ok) {
    // Aviso proactivo de expiración (token sano pero a punto de vencer).
    if (integ.tokenExpiresAt) {
      const daysLeft = (integ.tokenExpiresAt.getTime() - Date.now()) / ONE_DAY_MS
      if (daysLeft <= EXPIRY_WARN_DAYS && daysLeft > 0) { await warnIntegrationExpiring(ref, integ.tokenExpiresAt); return { healthy: true } }
    }
    await markIntegrationHealthy(ref)   // recupera una caída falsa previa
    // Gmail expira el watch cada 7 días — renovarlo en cada chequeo evita que el correo deje de notificar.
    if (channel === 'GMAIL') {
      await renewGmailWatch(integ.tenantId, integ.tokenEncrypted).catch((err) =>
        console.error(JSON.stringify({ event: 'gmail_watch_renew_error', tenantId: integ.tenantId, error: err instanceof Error ? err.message : String(err) })))
    }
    console.info(JSON.stringify({ event: 'integration_health_ok', channel, tenantId: integ.tenantId, id: integ.id }))
    return { healthy: true }
  }

  // Fallo TRANSITORIO (red/TLS/timeout/5xx): NO se marca caído — el estado se conserva y se
  // re-verifica en el próximo ciclo. Esto evita que cada deploy rompa las conexiones.
  if (!res.auth) {
    console.warn(JSON.stringify({ event: 'integration_health_transient', channel, tenantId: integ.tenantId, id: integ.id, detail: res.detail }))
    return { healthy: false }
  }

  // Fallo de AUTH real (token vencido/revocado): marcar caído para que se reconecte.
  await markIntegrationDown(ref, `Verificación fallida (auth): ${res.detail}`)
  console.warn(JSON.stringify({ event: 'integration_health_auth_failed', channel, tenantId: integ.tenantId, id: integ.id, detail: res.detail }))
  return { healthy: false }
}

// ─── Job para todas las integraciones con token ───────────────────────────────

export async function runIntegrationHealthCheck(): Promise<{ checked: number; failed: number }> {
  // Se revisan TODAS las que tienen token (no solo isActive) para que una caída falsa se recupere sola.
  const all = await directPrisma.integration.findMany({
    where:  { tokenEncrypted: { not: null }, channel: { in: ['WHATSAPP', 'GMAIL'] } },
    select: { id: true, tenantId: true, channel: true, identifier: true, tokenEncrypted: true, tokenExpiresAt: true, status: true },
  })
  console.info(JSON.stringify({ event: 'integration_health_start', total: all.length }))

  let failed = 0
  for (const integ of all) {
    try {
      const r = await verifyIntegration({ ...integ, tokenEncrypted: integ.tokenEncrypted! })
      if (!r.healthy) failed++
    } catch (err) {
      console.error(JSON.stringify({ event: 'integration_health_error', id: integ.id, error: err instanceof Error ? err.message : String(err) }))
    }
  }
  console.info(JSON.stringify({ event: 'integration_health_done', checked: all.length, failed }))
  return { checked: all.length, failed }
}

// ─── Scheduler: al arrancar + cada día ────────────────────────────────────────

export function startIntegrationHealthScheduler(): void {
  if (process.env['NODE_ENV'] !== 'test') {
    runIntegrationHealthCheck().catch((err) => console.error(JSON.stringify({ event: 'integration_health_scheduler_error', error: err instanceof Error ? err.message : String(err) })))
  }
  setInterval(() => {
    runIntegrationHealthCheck().catch((err) => console.error(JSON.stringify({ event: 'integration_health_scheduler_error', error: err instanceof Error ? err.message : String(err) })))
  }, ONE_DAY_MS)
  console.info(JSON.stringify({ event: 'integration_health_scheduler_started', intervalHours: 24 }))
}
