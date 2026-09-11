/**
 * HU-211 — Notificación a usuarios internos: crea la notificación IN-APP (como siempre) y, si se pide,
 * la EXTIENDE por WhatsApp al número que cada usuario registró (con opt-in), usando la plantilla
 * aprobada `recordatorio_general` (1=nombre, 2=asunto, 3=fecha, 4=hora).
 *
 * Reglas (regla dura HU-211):
 *  - La interna SIEMPRE se crea; WhatsApp es un canal ADICIONAL, no un reemplazo.
 *  - Solo se envía WhatsApp a quien tenga número + opt-in; sin número → solo interna.
 *  - Usa el remitente GLOBAL (HU-210) y la capa de envío (HU-207): registra estado/costo y NUNCA lanza.
 *  - Zona horaria del tenant para fecha/hora (HU-189). Aislamiento por tenant en cada envío.
 */
import type { Prisma, ModuleName } from '@prisma/client'
import { directPrisma } from './prisma'
import { sendWhatsAppNotificationIfOptedIn } from './whatsapp'

export interface UserNotifyInput {
  tenantId: string
  userIds:  string[]
  module:   ModuleName | null
  type:     string
  title:    string
  message:  string
  link?:    string | null
  /**
   * Si se indica, la notificación TAMBIÉN se envía por WhatsApp (plantilla recordatorio_general):
   *  - `subject` → variable {{2}} (asunto); por defecto el `title`.
   *  - `when`    → fecha/hora del aviso ({{3}}/{{4}}); por defecto "ahora".
   */
  wa?: { subject?: string; when?: Date }
}

/**
 * Crea la notificación in-app para uno o varios usuarios y, si `wa` está presente, la extiende por
 * WhatsApp a cada usuario con número + opt-in. `client` = el Prisma a usar para la interna (proxy de
 * request, `tx` o `directPrisma`). El envío por WhatsApp es fire-and-forget y no bloquea el flujo.
 */
export async function notifyUsers(client: Prisma.TransactionClient, input: UserNotifyInput): Promise<void> {
  const ids = [...new Set(input.userIds)].filter(Boolean)
  if (ids.length === 0) return

  await client.notification.createMany({
    data: ids.map((userId) => ({
      tenantId: input.tenantId, userId, module: input.module, type: input.type,
      title: input.title, message: input.message, link: input.link ?? null,
    })) as Prisma.NotificationCreateManyInput[],
  })

  if (input.wa) void dispatchWhatsApp(input, ids).catch(() => { /* nunca rompe el flujo */ })
}

/** Envía la notificación por WhatsApp a los usuarios con número + opt-in (recordatorio_general). */
async function dispatchWhatsApp(input: UserNotifyInput, ids: string[]): Promise<void> {
  // Solo usuarios del MISMO tenant con número y opt-in activo (aislamiento + respeto del consentimiento).
  const [users, tenant] = await Promise.all([
    directPrisma.user.findMany({
      where:  { tenantId: input.tenantId, id: { in: ids }, phone: { not: null }, whatsappOptIn: true },
      select: { name: true, phone: true, whatsappOptIn: true },
    }),
    directPrisma.tenant.findFirst({ where: { id: input.tenantId }, select: { timezone: true } }),
  ])
  if (users.length === 0) return

  const tz    = tenant?.timezone ?? 'America/Bogota'
  const when  = input.wa?.when ?? new Date()
  const fecha = new Intl.DateTimeFormat('es-CO', { timeZone: tz, dateStyle: 'long' }).format(when)
  const hora  = new Intl.DateTimeFormat('es-CO', { timeZone: tz, timeStyle: 'short' }).format(when)
  const subject = input.wa?.subject ?? input.title

  for (const u of users) {
    if (!u.phone) continue
    void sendWhatsAppNotificationIfOptedIn('general_reminder', {
      tenantId: input.tenantId, to: u.phone, optIn: u.whatsappOptIn,
      bodyParams: [u.name, subject, fecha, hora],
    })
  }
}
