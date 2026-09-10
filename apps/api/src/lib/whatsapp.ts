/**
 * HU-207 — Capa central de envío de notificaciones por WhatsApp Business (Cloud API oficial).
 *
 * Regla dura: SOLO la vía oficial (Graph API) con PLANTILLAS pre-aprobadas por Meta. Nunca un número
 * personal ni una librería no oficial. El token vive CIFRADO en `integrations` (por tenant) y jamás se
 * expone en logs ni respuestas. Cada envío se REGISTRA en `whatsapp_messages` (a quién, qué plantilla,
 * variables, estado y costo estimado). Los errores (número inválido, plantilla no aprobada/pausada,
 * límite, token vencido) se registran y NO tumban el flujo (esta función nunca lanza).
 *
 * Sobre esta base se apoyan las notificaciones concretas (HU-208, HU-209).
 *
 * Entorno: con el número de PRUEBA de Meta, los mensajes solo llegan a los ≤5 destinatarios registrados
 * en el panel de Meta; con el número de PRODUCCIÓN llegan a cualquiera. El número activo se define al
 * conectar la integración de WhatsApp del tenant (identifier = phone_number_id).
 */
import { directPrisma } from './prisma'
import { decrypt } from './encryption'

const GRAPH_VERSION = 'v19.0'
/** Código de país por defecto para números locales sin indicativo (Colombia = 57). Configurable. */
const DEFAULT_CC = (process.env['WHATSAPP_DEFAULT_COUNTRY_CODE'] ?? '57').replace(/\D/g, '')

type WaCategory = 'utility' | 'marketing' | 'authentication'

/** Costo estimado por mensaje (USD), por categoría — solo para observabilidad de gasto. Configurable. */
function estimatedCost(category: WaCategory): number {
  const n = (env: string, def: number) => { const v = Number(process.env[env]); return Number.isFinite(v) && v >= 0 ? v : def }
  if (category === 'marketing')      return n('WHATSAPP_MARKETING_COST', 0.025)
  if (category === 'authentication') return n('WHATSAPP_AUTH_COST',      0.01)
  return n('WHATSAPP_UTILITY_COST', 0.0125)
}

/**
 * Normaliza un número a formato internacional (E.164 sin '+', solo dígitos) para la Cloud API.
 * - Quita todo lo no numérico y el prefijo internacional "00".
 * - Un número local de 10 dígitos (celular colombiano empieza en 3) recibe el indicativo por defecto.
 * - Fuera del rango 10–15 dígitos → inválido (null): no se intenta enviar.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null
  let d = String(raw).replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 10 && DEFAULT_CC) d = DEFAULT_CC + d
  if (d.length < 10 || d.length > 15) return null
  return d
}

export interface SendTemplateParams {
  tenantId:      string
  to:            string          // número destino (se normaliza; si es inválido no se envía)
  templateName:  string          // nombre EXACTO de la plantilla aprobada en Meta
  languageCode?: string          // código de idioma de la plantilla (default 'es')
  bodyParams?:   (string | number)[]  // variables {{1}}, {{2}}… del cuerpo, en orden
  category?:     WaCategory      // para el costo estimado (default 'utility')
}

export type WaSendStatus = 'sent' | 'failed' | 'invalid_number' | 'no_integration'
export interface SendTemplateResult {
  status:     WaSendStatus
  messageId?: string
  errorCode?: string
  error?:     string
}

/** Traduce el error de Meta a un código corto y estable (para el registro y el monitoreo). */
function mapMetaError(httpStatus: number, detail: string): string {
  let code: number | undefined
  try { code = (JSON.parse(detail) as { error?: { code?: number } })?.error?.code } catch { /* no-json */ }
  switch (code) {
    case 190:    return 'TOKEN_EXPIRED'          // token vencido/ inválido
    case 100:    return 'INVALID_PARAM'          // parámetro/plantilla/número inválido
    case 131026: return 'UNDELIVERABLE'          // no se pudo entregar (número no en WhatsApp)
    case 131047: return 'RATE_LIMIT'             // re-engagement / límite
    case 131048: return 'SPAM_RATE_LIMIT'
    case 132000:
    case 132001:
    case 132005:
    case 132007:
    case 132012:
    case 132015:
    case 132016: return 'TEMPLATE_ERROR'         // plantilla no aprobada / pausada / no existe / formato
    case 80007:  return 'RATE_LIMIT'
    default:     return httpStatus === 401 ? 'UNAUTHORIZED' : `HTTP_${httpStatus}`
  }
}

/**
 * Envía una notificación por WhatsApp usando una plantilla aprobada. Resuelve la integración del
 * tenant (phone_number_id + token cifrado), normaliza el destino, envía por la Cloud API y registra el
 * resultado. NUNCA lanza: cualquier fallo queda en `whatsapp_messages` y se devuelve en el resultado.
 */
export async function sendWhatsAppTemplate(p: SendTemplateParams): Promise<SendTemplateResult> {
  const language = p.languageCode ?? 'es'
  const category = p.category ?? 'utility'
  const to = normalizePhone(p.to)

  // Registro del envío (sin token). `toPhone` acotado a 20 chars por el esquema.
  const record = async (
    status: string,
    extra: { messageId?: string; errorCode?: string; errorDetail?: string; cost?: number } = {},
  ): Promise<void> => {
    await directPrisma.whatsAppMessage.create({
      data: {
        tenantId:      p.tenantId,
        toPhone:       (to ?? String(p.to ?? '').replace(/\D/g, '')).slice(0, 20),
        templateName:  p.templateName,
        languageCode:  language,
        variables:     (p.bodyParams ?? []).map(String),
        category,
        status,
        messageId:     extra.messageId ?? null,
        estimatedCost: extra.cost ?? null,
        errorCode:     extra.errorCode ?? null,
        errorDetail:   extra.errorDetail ? extra.errorDetail.slice(0, 1500) : null,
      },
    }).catch((err) => console.error('[WhatsApp] no se pudo registrar el envío:', err))
  }

  // ── 1. Número inválido → no se intenta enviar ──────────────────────────────
  if (!to) {
    await record('invalid_number', { errorCode: 'INVALID_NUMBER', errorDetail: `Número inválido: "${String(p.to)}"` })
    console.info('[WhatsApp] skip', JSON.stringify({ tenantId: p.tenantId, template: p.templateName, reason: 'invalid_number' }))
    return { status: 'invalid_number', errorCode: 'INVALID_NUMBER', error: 'Número de destino inválido' }
  }

  // ── 2. Integración de WhatsApp del tenant (phone_number_id + token cifrado) ─
  const integ = await directPrisma.integration.findFirst({
    where:  { tenantId: p.tenantId, channel: 'WHATSAPP' },
    select: { identifier: true, tokenEncrypted: true },
  })
  if (!integ?.tokenEncrypted || !integ.identifier) {
    await record('failed', { errorCode: 'NO_INTEGRATION', errorDetail: 'El tenant no tiene WhatsApp configurado' })
    return { status: 'no_integration', errorCode: 'NO_INTEGRATION', error: 'Sin integración de WhatsApp' }
  }

  let token: string
  try { token = decrypt(integ.tokenEncrypted) }
  catch { await record('failed', { errorCode: 'TOKEN_DECRYPT', errorDetail: 'No se pudo descifrar el token' }); return { status: 'failed', errorCode: 'TOKEN_DECRYPT', error: 'Token ilegible' } }

  // ── 3. Enviar por la Cloud API oficial con la plantilla ────────────────────
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${integ.identifier}/messages`
  const components = (p.bodyParams && p.bodyParams.length)
    ? [{ type: 'body', parameters: p.bodyParams.map((t) => ({ type: 'text', text: String(t) })) }]
    : undefined
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: p.templateName, language: { code: language }, ...(components ? { components } : {}) },
  }

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(payload),
    })

    if (!res.ok) {
      const detail  = await res.text()
      const errCode = mapMetaError(res.status, detail)
      await record('failed', { errorCode: errCode, errorDetail: detail })
      // Observabilidad: nunca se registra el token, solo el error.
      console.error('[WhatsApp] send failed', JSON.stringify({ tenantId: p.tenantId, template: p.templateName, httpStatus: res.status, errCode }))
      return { status: 'failed', errorCode: errCode, error: errCode }
    }

    const json      = await res.json().catch(() => ({})) as { messages?: Array<{ id?: string }> }
    const messageId = json.messages?.[0]?.id
    const cost      = estimatedCost(category)
    await record('sent', { messageId, cost })
    // Observabilidad de costo (como en la IA): volumen y gasto estimado por plantilla.
    console.info('[WhatsApp] cost', JSON.stringify({ tenantId: p.tenantId, template: p.templateName, category, estimatedCost: cost, messageId }))
    return { status: 'sent', messageId }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    await record('failed', { errorCode: 'NETWORK', errorDetail: detail })
    console.error('[WhatsApp] send error', JSON.stringify({ tenantId: p.tenantId, template: p.templateName, error: detail }))
    return { status: 'failed', errorCode: 'NETWORK', error: detail }
  }
}

/**
 * HU-207 — Registro de plantillas configurables (nombre + idioma + categoría). El NOMBRE debe coincidir
 * EXACTAMENTE con el aprobado en Meta; se puede sobreescribir por env sin tocar código. Las
 * notificaciones concretas (HU-208/209) llenan las variables al invocar `sendWhatsAppTemplate`.
 */
export const WHATSAPP_TEMPLATES = {
  appointment_reminder: {
    name:     process.env['WA_TPL_APPOINTMENT_REMINDER'] ?? 'appointment_reminder',
    language: process.env['WA_TPL_APPOINTMENT_REMINDER_LANG'] ?? 'es',
    category: 'utility' as WaCategory,
  },
  appointment_confirmation: {
    name:     process.env['WA_TPL_APPOINTMENT_CONFIRMATION'] ?? 'appointment_confirmation',
    language: process.env['WA_TPL_APPOINTMENT_CONFIRMATION_LANG'] ?? 'es',
    category: 'utility' as WaCategory,
  },
  general_reminder: {
    name:     process.env['WA_TPL_GENERAL_REMINDER'] ?? 'general_reminder',
    language: process.env['WA_TPL_GENERAL_REMINDER_LANG'] ?? 'es',
    category: 'utility' as WaCategory,
  },
} as const

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_TEMPLATES

/** Atajo tipado: envía usando una plantilla del registro (HU-208/209 la usan por clave). */
export async function sendWhatsAppNotification(
  key: WhatsAppTemplateKey,
  args: { tenantId: string; to: string; bodyParams?: (string | number)[] },
): Promise<SendTemplateResult> {
  const tpl = WHATSAPP_TEMPLATES[key]
  return sendWhatsAppTemplate({
    tenantId:     args.tenantId,
    to:           args.to,
    templateName: tpl.name,
    languageCode: tpl.language,
    category:     tpl.category,
    bodyParams:   args.bodyParams,
  })
}

/**
 * HU-209 — Envío que RESPETA EL CONSENTIMIENTO (opt-in) del destinatario. Regla dura del sprint: solo se
 * envía WhatsApp a quien lo aceptó. Si `optIn` es false NO se envía (el canal interno queda como respaldo)
 * y se devuelve `opted_out` sin registrar nada en `whatsapp_messages` (no fue un intento de envío). Es la
 * ÚNICA vía que usan las notificaciones de cliente/usuario; preparada para más tipos a futuro sin rehacer
 * la base: quien llame resuelve el `optIn` del destinatario y pasa la clave de plantilla.
 */
export async function sendWhatsAppNotificationIfOptedIn(
  key: WhatsAppTemplateKey,
  args: { tenantId: string; to: string; optIn: boolean; bodyParams?: (string | number)[] },
): Promise<SendTemplateResult | { status: 'opted_out' }> {
  if (!args.optIn) {
    console.info('[WhatsApp] skip', JSON.stringify({ tenantId: args.tenantId, template: WHATSAPP_TEMPLATES[key].name, reason: 'opted_out' }))
    return { status: 'opted_out' }
  }
  return sendWhatsAppNotification(key, { tenantId: args.tenantId, to: args.to, bodyParams: args.bodyParams })
}
