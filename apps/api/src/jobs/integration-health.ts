/**
 * Job de salud de integraciones — verifica tokens de WhatsApp/Gmail periódicamente.
 *
 * Para cada integración ACTIVA:
 *   - WHATSAPP: llama a Graph API de Meta con el access_token descifrado.
 *   - GMAIL:    intenta refrescar el access_token con el refresh_token.
 *
 * Sano  → markIntegrationHealthy (status connected, resuelve alertas abiertas).
 * Falla → markIntegrationDown (status error, notifica a PLATAFORMA + CLIENTE — ver integration-status.ts).
 *
 * Además, aviso PROACTIVO: si el token tiene expiración conocida (`tokenExpiresAt`) y está próxima,
 * se avisa a la plataforma ANTES de que caiga (warnIntegrationExpiring).
 *
 * Corre al arrancar y cada día (los tokens temporales de Meta vencen en ~24 h, así que un intervalo
 * laxo dejaría el canal caído sin aviso). Las verificaciones manuales van por "Verificar" en la consola.
 */

import { google } from 'googleapis'
import { directPrisma } from '../lib/prisma'
import { decrypt } from '../lib/encryption'
import { markIntegrationDown, markIntegrationHealthy, warnIntegrationExpiring } from '../lib/integration-status'

const ONE_DAY_MS       = 24 * 60 * 60 * 1000
const EXPIRY_WARN_DAYS = 3          // avisar cuando falten ≤ 3 días para vencer

// ─── Verificadores por canal (devuelven el detalle del fallo para reconectar) ──

async function checkWhatsApp(phoneNumberId: string, encryptedToken: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const accessToken = decrypt(encryptedToken)
    const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (resp.ok) return { ok: true, detail: '' }
    const body = await resp.json().catch(() => ({})) as { error?: { message?: string } }
    return { ok: false, detail: body.error?.message ?? `HTTP ${resp.status}` }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'Error al contactar Meta' }
  }
}

async function checkGmail(encryptedRefreshToken: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const refreshToken = decrypt(encryptedRefreshToken)
    const oauthClient  = new google.auth.OAuth2(process.env['GOOGLE_CLIENT_ID'], process.env['GOOGLE_CLIENT_SECRET'])
    oauthClient.setCredentials({ refresh_token: refreshToken })
    const { credentials } = await oauthClient.refreshAccessToken()
    return credentials.access_token ? { ok: true, detail: '' } : { ok: false, detail: 'Sin access_token del refresh' }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'Refresh token inválido' }
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
    : channel === 'GMAIL' ? await checkGmail(integ.tokenEncrypted) : { ok: true, detail: '' }

  if (res.ok) {
    // Aviso proactivo de expiración (token sano pero a punto de vencer).
    if (integ.tokenExpiresAt) {
      const daysLeft = (integ.tokenExpiresAt.getTime() - Date.now()) / ONE_DAY_MS
      if (daysLeft <= EXPIRY_WARN_DAYS && daysLeft > 0) { await warnIntegrationExpiring(ref, integ.tokenExpiresAt); return { healthy: true } }
    }
    await markIntegrationHealthy(ref)
    console.info(JSON.stringify({ event: 'integration_health_ok', channel, tenantId: integ.tenantId, id: integ.id }))
    return { healthy: true }
  }

  await markIntegrationDown(ref, `Verificación periódica fallida: ${res.detail}`)
  console.warn(JSON.stringify({ event: 'integration_health_failed', channel, tenantId: integ.tenantId, id: integ.id, detail: res.detail }))
  return { healthy: false }
}

// ─── Job para todas las integraciones activas ─────────────────────────────────

export async function runIntegrationHealthCheck(): Promise<{ checked: number; failed: number }> {
  const active = await directPrisma.integration.findMany({
    where:  { isActive: true, tokenEncrypted: { not: null }, channel: { in: ['WHATSAPP', 'GMAIL'] } },
    select: { id: true, tenantId: true, channel: true, identifier: true, tokenEncrypted: true, tokenExpiresAt: true, status: true },
  })
  console.info(JSON.stringify({ event: 'integration_health_start', total: active.length }))

  let failed = 0
  for (const integ of active) {
    try {
      const r = await verifyIntegration({ ...integ, tokenEncrypted: integ.tokenEncrypted! })
      if (!r.healthy) failed++
    } catch (err) {
      console.error(JSON.stringify({ event: 'integration_health_error', id: integ.id, error: err instanceof Error ? err.message : String(err) }))
    }
  }
  console.info(JSON.stringify({ event: 'integration_health_done', checked: active.length, failed }))
  return { checked: active.length, failed }
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
