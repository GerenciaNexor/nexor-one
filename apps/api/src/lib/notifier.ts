/**
 * HU-210 — Resolución del REMITENTE notificador de WhatsApp (el número que ENVÍA notificaciones).
 *
 * Es OTRA cosa que el agente de atención (tabla `integrations`, que recibe/responde y NO se toca aquí).
 * Regla de resolución (extensible sin rehacer): si el tenant tiene su propio remitente notificador
 * configurado, se usa ese; si no, se usa el GLOBAL de NEXOR (tenant_id NULL). Hoy hay uno global para
 * todas las empresas; mañana puede haber uno por tenant.
 *
 * `notifier_senders` es tabla de PLATAFORMA con RLS deny-all → solo `directPrisma` la lee. El token
 * viaja cifrado; quien envía lo descifra en el momento y jamás lo registra.
 */
import { directPrisma } from './prisma'

export interface ResolvedSender {
  phoneNumberId:  string
  tokenEncrypted: string
  wabaId:         string | null
  scope:          'tenant' | 'global'
}

/** Devuelve el remitente notificador a usar para un tenant (propio → global), o null si no hay ninguno. */
export async function resolveNotifierSender(tenantId: string): Promise<ResolvedSender | null> {
  // 1) Remitente propio del tenant (futuro uno-por-tenant).
  const own = await directPrisma.notifierSender.findFirst({
    where:  { tenantId, isActive: true },
    select: { phoneNumberId: true, tokenEncrypted: true, wabaId: true },
  })
  if (own) return { ...own, scope: 'tenant' }

  // 2) Remitente GLOBAL de NEXOR (tenant_id NULL).
  const global = await directPrisma.notifierSender.findFirst({
    where:  { tenantId: null, isActive: true },
    select: { phoneNumberId: true, tokenEncrypted: true, wabaId: true },
  })
  return global ? { ...global, scope: 'global' } : null
}
