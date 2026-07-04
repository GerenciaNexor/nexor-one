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

export async function connectWhatsAppForTenant(
  tenantId: string,
  input: { phoneNumberId: string; accessToken: string; branchId?: string },
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
  const data = { tokenEncrypted, isActive: false, branchId: input.branchId ?? null }
  const integration = conflict
    ? await directPrisma.integration.update({ where: { id: conflict.id }, data, select: SAFE })
    : await directPrisma.integration.create({ data: { tenantId, channel: 'WHATSAPP', identifier: input.phoneNumberId, ...data }, select: SAFE })

  await logPlatformAction({ platformAdminId: actorId, tenantId, action: 'channel.connect', reason, ip, metadata: { channel: 'WHATSAPP', identifier: input.phoneNumberId } })
  return integration
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
    where: { id: integrationId, tenantId }, select: { id: true, identifier: true, tokenEncrypted: true, channel: true },
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
    const resp = await fetch(`https://graph.facebook.com/v19.0/${integration.identifier}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (resp.ok) passed = true
    else { const b = await resp.json() as { error?: { message?: string } }; message = b?.error?.message ?? `HTTP ${resp.status}` }
  } catch { message = 'No se pudo conectar con la API de Meta.' }

  await directPrisma.integration.update({ where: { id: integration.id }, data: { isActive: passed, lastVerifiedAt: passed ? new Date() : undefined } })
  return { success: passed, message: passed ? 'Conexión con WhatsApp verificada.' : `Verificación fallida: ${message}` }
}

export async function disconnectTenantIntegration(tenantId: string, integrationId: string, actorId: string, reason: string, ip?: string) {
  const integration = await directPrisma.integration.findFirst({ where: { id: integrationId, tenantId }, select: { id: true, channel: true, identifier: true } })
  if (!integration) throw Object.assign(new Error('Integración no encontrada.'), { statusCode: 404, code: 'NOT_FOUND' })
  await directPrisma.integration.update({ where: { id: integration.id }, data: { tokenEncrypted: null, isActive: false } })
  await logPlatformAction({ platformAdminId: actorId, tenantId, action: 'channel.disconnect', reason, ip, metadata: { channel: integration.channel, identifier: integration.identifier } })
}
