/**
 * Estado de salud de un canal (WhatsApp/Gmail) y notificaciones asociadas.
 *
 * Un canal puede caer (token vencido, verificación fallida, error al enviar). Cuando eso pasa,
 * NO se avisa por el propio canal (podría estar caído): se usa la notificación INTERNA de la
 * plataforma. Dos destinatarios:
 *   - PLATAFORMA (SUPER_ADMIN): bandeja `platform_notifications` con DETALLE para reconectar.
 *   - CLIENTE (TENANT_ADMIN):   `notifications` del tenant, en lenguaje NO técnico.
 *
 * Todo por `directPrisma` (plataforma, sin RLS) salvo la notificación del cliente, que va por
 * `withTenantContext` (RLS del tenant). Se deduplica por tipo mientras haya una alerta sin leer;
 * al recuperarse el canal, las alertas abiertas se marcan resueltas (persisten hasta resolverse).
 */
import { directPrisma, withTenantContext } from './prisma'

type Channel = 'WHATSAPP' | 'GMAIL'
interface IntegRef { id: string; tenantId: string; channel: string; identifier: string }

const label = (c: Channel) => (c === 'WHATSAPP' ? 'WhatsApp Business' : 'Gmail')
const downType = (c: Channel) => (c === 'WHATSAPP' ? 'WA_CHANNEL_DOWN' : 'GMAIL_CHANNEL_DOWN')
const expType  = (c: Channel) => (c === 'WHATSAPP' ? 'WA_TOKEN_EXPIRING' : 'GMAIL_TOKEN_EXPIRING')
const tenantType = (c: Channel) => (c === 'WHATSAPP' ? 'INTEGRACION_CAIDA_WA' : 'INTEGRACION_CAIDA_GMAIL')

async function tenantName(tenantId: string): Promise<string> {
  const t = await directPrisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
  return t?.name ?? tenantId
}

// ─── Notificación de PLATAFORMA (bandeja del SUPER_ADMIN) ─────────────────────
async function notifyPlatform(n: { type: string; title: string; message: string; tenantId?: string; link?: string; metadata?: Record<string, unknown> }): Promise<void> {
  try {
    const dup = await directPrisma.platformNotification.findFirst({
      where: { type: n.type, tenantId: n.tenantId ?? null, isRead: false }, select: { id: true },
    })
    if (dup) return // dedupe: ya hay una alerta abierta de este tipo para este cliente
    await directPrisma.platformNotification.create({
      data: { type: n.type, title: n.title, message: n.message, tenantId: n.tenantId ?? null, link: n.link ?? null, metadata: (n.metadata as object) ?? undefined },
    })
  } catch (err) {
    console.error('[integration-status] notifyPlatform:', err instanceof Error ? err.message : err)
  }
}

// ─── Notificación del CLIENTE (TENANT_ADMIN, lenguaje NO técnico) ──────────────
async function notifyTenantChannelDown(tenantId: string, channel: Channel, identifier: string): Promise<void> {
  const type = tenantType(channel)
  const title = `Tu ${label(channel)} está desconectado`
  const message = channel === 'WHATSAPP'
    ? 'Tu WhatsApp dejó de funcionar y por ahora no responde mensajes. Contáctanos para reactivarlo; podríamos pedirte de nuevo la información de la cuenta.'
    : 'Tu correo conectado dejó de funcionar. Contáctanos para reactivarlo; podríamos pedirte de nuevo la autorización.'
  try {
    await withTenantContext(tenantId, async (tx) => {
      const admins = await tx.user.findMany({ where: { tenantId, isActive: true, role: 'TENANT_ADMIN' }, select: { id: true } })
      for (const admin of admins) {
        const existing = await tx.notification.findFirst({ where: { userId: admin.id, tenantId, type, isRead: false }, select: { id: true } })
        if (existing) continue
        await tx.notification.create({ data: { tenantId, userId: admin.id, module: null, type, title, message, link: '/settings/integrations' } })
      }
    })
  } catch (err) {
    console.error(`[integration-status] notifyTenant ${tenantId}/${channel}:`, err instanceof Error ? err.message : err)
  }
}

// ─── Marcar canal CAÍDO (token vencido / verificación / envío falló) ───────────
export async function markIntegrationDown(integ: IntegRef, detail: string): Promise<void> {
  const channel = integ.channel as Channel
  const expired = /expired|#190|validating access token|session has expired|OAuthException/i.test(detail)
  await directPrisma.integration.update({
    where: { id: integ.id },
    data:  { isActive: false, status: 'error', lastError: detail.slice(0, 1000), lastErrorAt: new Date() },
  }).catch((e) => console.error('[integration-status] update down:', e))

  const name = await tenantName(integ.tenantId)
  await notifyPlatform({
    type:     downType(channel),
    tenantId: integ.tenantId,
    title:    `${label(channel)} caído — ${name}${expired ? ' (token vencido)' : ''}`,
    message:  `El canal ${label(channel)} de ${name} (ID ${integ.identifier}) dejó de funcionar${expired ? ' porque el token venció' : ''}. Detalle: ${detail.slice(0, 300)}. Reconéctalo desde la consola del cliente.`,
    link:     `/platform/clients/${integ.tenantId}`,
    metadata: { channel, identifier: integ.identifier, expired },
  })
  await notifyTenantChannelDown(integ.tenantId, channel, integ.identifier)
}

// ─── Marcar canal SANO (verificación OK / reconexión) → resuelve alertas ───────
export async function markIntegrationHealthy(integ: IntegRef): Promise<void> {
  const channel = integ.channel as Channel
  await directPrisma.integration.update({
    where: { id: integ.id },
    data:  { isActive: true, status: 'connected', lastVerifiedAt: new Date(), lastError: null, lastErrorAt: null },
  }).catch((e) => console.error('[integration-status] update healthy:', e))

  // Resolver (marcar leídas) las alertas abiertas de este canal — persisten hasta resolverse.
  await directPrisma.platformNotification.updateMany({
    where: { tenantId: integ.tenantId, type: { in: [downType(channel), expType(channel)] }, isRead: false },
    data:  { isRead: true },
  }).catch(() => {})
  await withTenantContext(integ.tenantId, (tx) =>
    tx.notification.updateMany({ where: { tenantId: integ.tenantId, type: tenantType(channel), isRead: false }, data: { isRead: true } }),
  ).catch(() => {})
}

// ─── Aviso PROACTIVO de token por vencer (solo a plataforma; el cliente no lo gestiona) ──
export async function warnIntegrationExpiring(integ: IntegRef, expiresAt: Date): Promise<void> {
  const channel = integ.channel as Channel
  await directPrisma.integration.update({ where: { id: integ.id }, data: { status: 'expiring' } }).catch(() => {})
  const name = await tenantName(integ.tenantId)
  await notifyPlatform({
    type:     expType(channel),
    tenantId: integ.tenantId,
    title:    `Token de ${label(channel)} por vencer — ${name}`,
    message:  `El token de ${label(channel)} de ${name} (ID ${integ.identifier}) vence el ${expiresAt.toISOString().slice(0, 10)}. Actualízalo antes de que el canal deje de responder.`,
    link:     `/platform/clients/${integ.tenantId}`,
    metadata: { channel, identifier: integ.identifier, tokenExpiresAt: expiresAt.toISOString() },
  })
}
