/**
 * HU-210 — Configuración del REMITENTE notificador de WhatsApp a nivel de PLATAFORMA (global de NEXOR).
 * Solo el equipo NEXOR (SUPER_ADMIN) lo configura. El token se cifra (AES-256) y NUNCA sale en las
 * respuestas ni en logs. `notifier_senders` tiene RLS deny-all → directPrisma. Distinto del agente de
 * atención (tabla `integrations`), que no se toca aquí.
 */
import { directPrisma } from '../../lib/prisma'
import { encrypt, decrypt } from '../../lib/encryption'
import { logPlatformAction } from './audit'

const GRAPH_VERSION = 'v21.0'

// Config pública del remitente — SIN token, jamás.
const SAFE = { id: true, phoneNumberId: true, wabaId: true, isActive: true, updatedAt: true } as const

/** Estado del remitente GLOBAL para la consola (sin token). */
export async function getGlobalNotifier() {
  const s = await directPrisma.notifierSender.findFirst({ where: { tenantId: null }, select: SAFE })
  return s ? { configured: true, ...s } : { configured: false }
}

/** Crea/actualiza el remitente GLOBAL (upsert por tenant_id NULL). Cifra el token. Auditado. */
export async function setGlobalNotifier(
  input: { phoneNumberId: string; wabaId?: string | null; accessToken: string },
  actorId: string, reason: string, ip?: string,
) {
  const data = { phoneNumberId: input.phoneNumberId, wabaId: input.wabaId ?? null, tokenEncrypted: encrypt(input.accessToken), isActive: true }
  const existing = await directPrisma.notifierSender.findFirst({ where: { tenantId: null }, select: { id: true } })
  const saved = existing
    ? await directPrisma.notifierSender.update({ where: { id: existing.id }, data, select: SAFE })
    : await directPrisma.notifierSender.create({ data: { tenantId: null, ...data }, select: SAFE })

  await logPlatformAction({ platformAdminId: actorId, tenantId: null, action: 'notifier.configure', reason, ip, metadata: { phoneNumberId: input.phoneNumberId, wabaId: input.wabaId ?? null } })
  return { configured: true, ...saved }
}

/** Verifica el token del remitente GLOBAL contra la Graph API de Meta (sin exponerlo). */
export async function testGlobalNotifier(): Promise<{ success: boolean; message: string }> {
  const s = await directPrisma.notifierSender.findFirst({ where: { tenantId: null }, select: { phoneNumberId: true, tokenEncrypted: true } })
  if (!s) throw Object.assign(new Error('No hay remitente notificador configurado.'), { statusCode: 404, code: 'NOT_FOUND' })

  const token = decrypt(s.tokenEncrypted)  // nunca se registra
  try {
    const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${s.phoneNumberId}`, { headers: { Authorization: `Bearer ${token}` } })
    if (resp.ok) return { success: true, message: 'Remitente verificado: el token es válido para enviar notificaciones.' }
    const b = await resp.json().catch(() => ({})) as { error?: { message?: string } }
    return { success: false, message: `Verificación fallida: ${b?.error?.message ?? `HTTP ${resp.status}`}` }
  } catch {
    return { success: false, message: 'No se pudo conectar con la API de Meta.' }
  }
}
