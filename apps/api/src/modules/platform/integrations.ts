/**
 * HU-139 — Gestión de canales (WhatsApp/Gmail) de cada cliente DESDE LA PLATAFORMA.
 * El equipo NEXOR conecta/desconecta; el cliente nunca ve ni toca credenciales.
 * directPrisma (la tabla `integrations` tiene RLS de tenant y aquí no hay contexto de tenant).
 * Los tokens se cifran (AES-256) y NUNCA salen en las respuestas. Todo queda auditado (HU-136).
 */
import { directPrisma } from '../../lib/prisma'
import { encrypt } from '../../lib/encryption'
import { logPlatformAction } from './audit'

// Nunca incluye tokenEncrypted → los secretos jamás salen de la API.
const SAFE = {
  id: true, channel: true, identifier: true, isActive: true,
  lastVerifiedAt: true, branchId: true, createdAt: true, updatedAt: true,
} as const

export async function listTenantIntegrations(tenantId: string) {
  return directPrisma.integration.findMany({ where: { tenantId }, select: SAFE, orderBy: { createdAt: 'desc' } })
}

const GRAPH_VERSION = 'v21.0'

/**
 * Suscribe la app de NEXOR a los webhooks del WABA (`POST /{waba}/subscribed_apps`).
 * SIN ESTO Meta NUNCA envía los mensajes ENTRANTES, aunque la app esté publicada, el número
 * conectado y el campo `messages` marcado (la salida y la verificación no lo requieren). Es el
 * paso que faltaba: por eso llegaban las respuestas pero no las entradas.
 */
export async function subscribeAppToWaba(wabaId: string, accessToken: string): Promise<{ ok: boolean; message: string }> {
  try {
    const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
    })
    const body = await resp.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } }
    if (resp.ok && body.success !== false) return { ok: true, message: 'App suscrita al WABA — recibirá mensajes entrantes.' }
    return { ok: false, message: body.error?.message ?? `HTTP ${resp.status}` }
  } catch {
    return { ok: false, message: 'No se pudo contactar la Graph API de Meta para suscribir el WABA.' }
  }
}

export async function connectWhatsAppForTenant(
  tenantId: string,
  input: { phoneNumberId: string; accessToken: string; wabaId?: string; branchId?: string },
  actorId: string, reason: string, ip?: string,
) {
  // phone_number_id es único globalmente (un número no puede estar en dos empresas).
  const conflict = await directPrisma.integration.findFirst({
    where: { channel: 'WHATSAPP', identifier: input.phoneNumberId }, select: { id: true, tenantId: true },
  })
  if (conflict && conflict.tenantId !== tenantId) {
    throw Object.assign(new Error('Ese Phone Number ID ya está registrado en otra empresa.'), { statusCode: 409, code: 'PHONE_NUMBER_ID_TAKEN' })
  }
  const tokenEncrypted = encrypt(input.accessToken)
  // El WABA ID se guarda para poder (re)suscribir la app a sus webhooks en "Probar conexión".
  const data = { tokenEncrypted, isActive: false, branchId: input.branchId ?? null, ...(input.wabaId ? { metadata: { wabaId: input.wabaId } } : {}) }
  const integration = conflict
    ? await directPrisma.integration.update({ where: { id: conflict.id }, data, select: SAFE })
    : await directPrisma.integration.create({ data: { tenantId, channel: 'WHATSAPP', identifier: input.phoneNumberId, ...data }, select: SAFE })

  // Suscribir la app al WABA para RECIBIR mensajes entrantes (paso clave, best-effort).
  let webhook: { ok: boolean; message: string } | undefined
  if (input.wabaId) webhook = await subscribeAppToWaba(input.wabaId, input.accessToken)

  await logPlatformAction({ platformAdminId: actorId, tenantId, action: 'channel.connect', reason, ip, metadata: { channel: 'WHATSAPP', identifier: input.phoneNumberId, wabaSubscribed: webhook?.ok ?? null } })
  return { ...integration, webhookSubscribed: webhook?.ok ?? null, webhookMessage: webhook?.message }
}

export async function connectGmailForTenant(
  tenantId: string, input: { email: string }, actorId: string, reason: string, ip?: string,
) {
  // Gmail: la gestión queda PREPARADA en la plataforma; el consumo entrante depende de los
  // permisos de Google (fuera de alcance). Se registra el buzón; isActive=false hasta habilitar.
  const existing = await directPrisma.integration.findFirst({ where: { tenantId, channel: 'GMAIL' }, select: { id: true } })
  const integration = existing
    ? await directPrisma.integration.update({ where: { id: existing.id }, data: { identifier: input.email, metadata: { prepared: true } }, select: SAFE })
    : await directPrisma.integration.create({ data: { tenantId, channel: 'GMAIL', identifier: input.email, isActive: false, metadata: { prepared: true } }, select: SAFE })

  await logPlatformAction({ platformAdminId: actorId, tenantId, action: 'channel.connect', reason, ip, metadata: { channel: 'GMAIL', identifier: input.email } })
  return integration
}

/** Verifica el token de una integración contra el proveedor. WhatsApp: Graph API de Meta. */
export async function testTenantIntegration(tenantId: string, integrationId: string) {
  const integration = await directPrisma.integration.findFirst({
    where: { id: integrationId, tenantId }, select: { id: true, identifier: true, tokenEncrypted: true, channel: true, metadata: true },
  })
  if (!integration) throw Object.assign(new Error('Integración no encontrada.'), { statusCode: 404, code: 'NOT_FOUND' })

  if (integration.channel === 'GMAIL') {
    // Consumo de Gmail pendiente de permisos de Google — se reporta como preparado.
    return { success: false, message: 'Gmail queda preparado; el consumo entrante depende de permisos de Google.' }
  }
  if (!integration.tokenEncrypted) {
    throw Object.assign(new Error('Esta integración no tiene token. Reconéctala.'), { statusCode: 400, code: 'NO_TOKEN' })
  }

  const { decrypt } = await import('../../lib/encryption')
  const accessToken = decrypt(integration.tokenEncrypted)
  let passed = false, message = ''
  try {
    const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${integration.identifier}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (resp.ok) passed = true
    else { const b = await resp.json() as { error?: { message?: string } }; message = b?.error?.message ?? `HTTP ${resp.status}` }
  } catch { message = 'No se pudo conectar con la API de Meta.' }

  // Si el token es válido y tenemos el WABA ID, (re)suscribimos la app a sus webhooks para
  // RECIBIR mensajes entrantes — sin esto Meta no envía las entradas (arregla la conexión actual).
  let webhookMsg = ''
  const wabaId = (integration.metadata as { wabaId?: string } | null)?.wabaId
  if (passed && wabaId) {
    const sub = await subscribeAppToWaba(wabaId, accessToken)
    webhookMsg = sub.ok ? ' App suscrita al WABA (recibirá mensajes entrantes).' : ` Aviso: no se pudo suscribir el WABA (${sub.message}).`
  } else if (passed && !wabaId) {
    webhookMsg = ' Nota: falta el WABA ID para suscribir los mensajes entrantes — reconéctalo incluyéndolo.'
  }

  await directPrisma.integration.update({ where: { id: integration.id }, data: { isActive: passed, lastVerifiedAt: passed ? new Date() : undefined } })
  return { success: passed, message: (passed ? 'Conexión con WhatsApp verificada.' : `Verificación fallida: ${message}`) + webhookMsg }
}

export async function disconnectTenantIntegration(tenantId: string, integrationId: string, actorId: string, reason: string, ip?: string) {
  const integration = await directPrisma.integration.findFirst({ where: { id: integrationId, tenantId }, select: { id: true, channel: true, identifier: true } })
  if (!integration) throw Object.assign(new Error('Integración no encontrada.'), { statusCode: 404, code: 'NOT_FOUND' })
  // Desconectar ELIMINA la integración (la tarjeta desaparece y libera el Phone Number ID para
  // reconectar). El historial queda en platform_audit_logs vía logPlatformAction.
  await directPrisma.integration.delete({ where: { id: integration.id } })
  await logPlatformAction({ platformAdminId: actorId, tenantId, action: 'channel.disconnect', reason, ip, metadata: { channel: integration.channel, identifier: integration.identifier } })
}
