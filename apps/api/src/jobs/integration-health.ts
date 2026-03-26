/**
 * Job de salud de integraciones — verifica tokens semanalmente
 *
 * Para cada integración activa en la plataforma:
 *   - WHATSAPP: llama a Graph API de Meta con el access_token descifrado
 *   - GMAIL:    intenta obtener un access_token fresco con el refresh_token
 *
 * Si la verificación PASA:  actualiza last_verified_at
 * Si la verificación FALLA: marca is_active: false y crea una notificación
 *                           in-app para el TENANT_ADMIN del tenant afectado
 *
 * Deduplicación de notificaciones:
 *   Solo notifica si la integración estaba activa antes de la verificación
 *   (is_active: true era el estado al consultar el job). Como el job solo
 *   procesa integraciones activas, la primera vez que falla se notifica;
 *   las siguientes ejecuciones la encuentran inactiva y no la procesan.
 *   Cuando el admin reconecta (is_active vuelve a true) y vuelve a fallar,
 *   se notifica de nuevo — el ciclo se reinicia.
 *
 * Las integraciones inactivas no necesitan verificación aquí porque los
 * webhooks (HU-032, HU-035) ya las descartan con is_active: true en el WHERE.
 */

import { google } from 'googleapis'
import { directPrisma, withTenantContext } from '../lib/prisma'
import { decrypt } from '../lib/encryption'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

// ─── Verificadores por canal ──────────────────────────────────────────────────

async function checkWhatsApp(phoneNumberId: string, encryptedToken: string): Promise<boolean> {
  try {
    const accessToken = decrypt(encryptedToken)
    const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}`, {
      method:  'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    return resp.ok
  } catch {
    return false
  }
}

async function checkGmail(encryptedRefreshToken: string): Promise<boolean> {
  try {
    const refreshToken = decrypt(encryptedRefreshToken)
    const oauthClient  = new google.auth.OAuth2(
      process.env['GOOGLE_CLIENT_ID'],
      process.env['GOOGLE_CLIENT_SECRET'],
    )
    oauthClient.setCredentials({ refresh_token: refreshToken })
    const { credentials } = await oauthClient.refreshAccessToken()
    return !!credentials.access_token
  } catch {
    return false
  }
}

// ─── Notificación al TENANT_ADMIN ─────────────────────────────────────────────

async function notifyTenantAdmin(
  tenantId:   string,
  channel:    'WHATSAPP' | 'GMAIL',
  identifier: string,
): Promise<void> {
  const channelLabel = channel === 'WHATSAPP' ? 'WhatsApp Business' : 'Gmail'
  // Tipo específico por canal — permite tener notificaciones independientes
  // si ambos canales fallan al mismo tiempo, y garantiza deduplicación correcta.
  const type = channel === 'WHATSAPP' ? 'INTEGRACION_CAIDA_WA' : 'INTEGRACION_CAIDA_GMAIL'
  const title = `Integración de ${channelLabel} desconectada`
  const message = channel === 'WHATSAPP'
    ? `El número de WhatsApp (ID: ${identifier}) no pasa la verificación. Reconecta la integración para seguir recibiendo mensajes.`
    : `La integración de Gmail (${identifier}) ya no está autorizada. Vuelve a conectar Gmail para continuar recibiendo emails.`
  const link = '/settings/integrations'

  try {
    await withTenantContext(tenantId, async (tx) => {
      const admins = await tx.user.findMany({
        where:  { tenantId, isActive: true, role: 'TENANT_ADMIN' },
        select: { id: true },
      })

      for (const admin of admins) {
        // Deduplicación: no crear si ya hay una alerta no leída para este canal.
        // El campo isRead actúa como barrera: cuando el admin lee la notificación
        // y reconecta la integración, el ciclo se reinicia si vuelve a caer.
        const existing = await tx.notification.findFirst({
          where: { userId: admin.id, tenantId, type, isRead: false },
        })
        if (existing) continue

        await tx.notification.create({
          data: {
            tenantId,
            userId:  admin.id,
            module:  null,
            type,
            title,
            message,
            link,
          },
        })
      }
    })
  } catch (err) {
    console.error(
      `[Integration Health] Error creando notificación tenant:${tenantId} channel:${channel}:`,
      err instanceof Error ? err.message : err,
    )
  }
}

// ─── Verificación de una sola integración ────────────────────────────────────

async function verifyIntegration(integration: {
  id:             string
  tenantId:       string
  channel:        string
  identifier:     string
  tokenEncrypted: string
}): Promise<void> {
  const channel = integration.channel as 'WHATSAPP' | 'GMAIL'

  let healthy = false
  if (channel === 'WHATSAPP') {
    healthy = await checkWhatsApp(integration.identifier, integration.tokenEncrypted)
  } else if (channel === 'GMAIL') {
    healthy = await checkGmail(integration.tokenEncrypted)
  } else {
    // Canal desconocido — ignorar
    return
  }

  if (healthy) {
    // Solo actualizar last_verified_at cuando la verificación es exitosa
    await directPrisma.integration.update({
      where: { id: integration.id },
      data:  { lastVerifiedAt: new Date() },
    })
    console.info(
      JSON.stringify({
        event:    'integration_health_ok',
        channel,
        tenantId: integration.tenantId,
        id:       integration.id,
      }),
    )
  } else {
    // Marcar inactiva — los webhooks descartarán mensajes de este tenant automáticamente
    await directPrisma.integration.update({
      where: { id: integration.id },
      data:  { isActive: false },
    })
    console.warn(
      JSON.stringify({
        event:      'integration_health_failed',
        channel,
        tenantId:   integration.tenantId,
        id:         integration.id,
        identifier: integration.identifier,
      }),
    )

    // Notificar al TENANT_ADMIN — una sola vez hasta que reconecte
    await notifyTenantAdmin(integration.tenantId, channel, integration.identifier)
  }
}

// ─── Job para todas las integraciones activas ─────────────────────────────────

export async function runIntegrationHealthCheck(): Promise<{
  checked: number
  failed:  number
}> {
  // directPrisma para leer todas las integraciones activas cross-tenant sin RLS
  const activeIntegrations = await directPrisma.integration.findMany({
    where: {
      isActive:       true,
      tokenEncrypted: { not: null },
      channel:        { in: ['WHATSAPP', 'GMAIL'] },
    },
    select: {
      id:             true,
      tenantId:       true,
      channel:        true,
      identifier:     true,
      tokenEncrypted: true,
    },
  })

  console.info(
    JSON.stringify({
      event:   'integration_health_start',
      total:   activeIntegrations.length,
    }),
  )

  let failed = 0

  for (const integration of activeIntegrations) {
    try {
      const before = await directPrisma.integration.findUnique({
        where:  { id: integration.id },
        select: { isActive: true },
      })

      await verifyIntegration({
        ...integration,
        tokenEncrypted: integration.tokenEncrypted!,
      })

      const after = await directPrisma.integration.findUnique({
        where:  { id: integration.id },
        select: { isActive: true },
      })

      if (before?.isActive && !after?.isActive) failed++
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'integration_health_error',
          id:    integration.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }

  console.info(
    JSON.stringify({
      event:   'integration_health_done',
      checked: activeIntegrations.length,
      failed,
    }),
  )

  return { checked: activeIntegrations.length, failed }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Inicia el job semanal de verificación de integraciones.
 * Llamar una vez al arrancar el servidor (en app.ts).
 *
 * No corre al arrancar — la primera ejecución ocurre 7 días después del deploy,
 * cuando los tokens podrían haber expirado. Las verificaciones manuales se hacen
 * desde el panel con GET /v1/integrations/:id/test.
 */
export function startIntegrationHealthScheduler(): void {
  setInterval(() => {
    runIntegrationHealthCheck().catch((err) =>
      console.error(
        JSON.stringify({
          event: 'integration_health_scheduler_error',
          error: err instanceof Error ? err.message : String(err),
        }),
      ),
    )
  }, SEVEN_DAYS_MS)

  console.info(
    JSON.stringify({ event: 'integration_health_scheduler_started', intervalDays: 7 }),
  )
}
