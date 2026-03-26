/**
 * Webhook de WhatsApp Business API (Meta)
 *
 * GET  /webhook/whatsapp — Verificación de webhook (handshake con Meta)
 * POST /webhook/whatsapp — Recepción de mensajes entrantes
 *
 * Reglas críticas:
 * - El POST SIEMPRE responde 200 a Meta, incluso si el procesamiento falla.
 *   Si Meta no recibe 200 en < 5 s, reintenta el envío → mensajes duplicados.
 * - La firma HMAC-SHA256 (x-hub-signature-256) se verifica antes de procesar.
 * - Los tenants se identifican por phone_number_id via la tabla integrations.
 * - No pasa por JWT ni tenantHook — autenticidad garantizada por HMAC.
 * - Se encola un job por mensaje individual (no por change), con jobId estable
 *   basado en el message.id de Meta para desduplicar reenvíos automáticos.
 */

import type { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'
import { directPrisma } from '../../lib/prisma'
import { incomingMessagesQueue, type WhatsAppIncomingJob } from '../../lib/queue'

// ─── Tipos del payload de Meta ────────────────────────────────────────────────

interface WaMessage {
  id:        string
  from:      string
  timestamp: string
  type:      string
  text?:     { body: string }
}

interface WaChangeValue {
  messaging_product: string
  metadata: {
    display_phone_number: string
    phone_number_id:      string
  }
  messages?:  WaMessage[]
  statuses?:  unknown[]
  contacts?:  unknown[]
}

interface WaPayload {
  object: string
  entry: Array<{
    id:      string
    changes: Array<{ field: string; value: WaChangeValue }>
  }>
  /** Buffer del body original — inyectado por el content-type parser del módulo. */
  __rawBuffer__?: Buffer
}

// ─── Verificación HMAC ────────────────────────────────────────────────────────

function isSignatureValid(rawBody: Buffer, signatureHeader: string): boolean {
  const secret = process.env['WHATSAPP_APP_SECRET']
  if (!secret) return false

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  if (expected.length !== signatureHeader.length) return false

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(signatureHeader, 'utf8'),
    )
  } catch {
    return false
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default async function whatsappWebhookRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /webhook/whatsapp
   * Meta verifica el webhook antes de activarlo.
   */
  app.get<{
    Querystring: {
      'hub.mode':         string
      'hub.verify_token': string
      'hub.challenge':    string
    }
  }>('/', async (request, reply) => {
    const mode      = request.query['hub.mode']
    const token     = request.query['hub.verify_token']
    const challenge = request.query['hub.challenge']

    if (mode === 'subscribe' && token === process.env['WHATSAPP_VERIFY_TOKEN']) {
      request.log.info({ event: 'whatsapp_webhook_verified' }, 'Webhook verificado por Meta')
      return reply.code(200).send(challenge)
    }

    request.log.warn({ event: 'whatsapp_verify_failed', mode }, 'Verificación fallida — verify_token inválido')
    return reply.code(403).send({ error: 'Forbidden' })
  })

  /**
   * POST /webhook/whatsapp
   * Recibe mensajes de todos los tenants.
   * Responde 200 inmediatamente; el procesamiento real ocurre en el worker.
   */
  app.post('/', async (request, reply) => {

    // ── 1. Responder 200 a Meta INMEDIATAMENTE ──────────────────────────────
    void reply.code(200).send({ status: 'ok' })

    // ── 2. Verificar firma HMAC-SHA256 ──────────────────────────────────────
    const payload   = request.body as WaPayload
    const rawBuffer = payload?.__rawBuffer__
    const signature = (request.headers['x-hub-signature-256'] ?? '') as string

    if (!rawBuffer) {
      request.log.warn({ event: 'whatsapp_no_raw_buffer' }, 'Webhook: rawBuffer no disponible — descartado')
      return
    }

    if (!isSignatureValid(rawBuffer, signature)) {
      request.log.warn(
        { event: 'whatsapp_invalid_hmac', signaturePrefix: signature.slice(0, 20) },
        'Webhook: firma HMAC-SHA256 inválida — request descartado',
      )
      return
    }

    // ── 3. Validar tipo de objeto ───────────────────────────────────────────
    if (payload?.object !== 'whatsapp_business_account') return

    // ── 4. Procesar entries ─────────────────────────────────────────────────
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue

        const value         = change.value
        const phoneNumberId = value?.metadata?.phone_number_id
        if (!phoneNumberId) continue

        // ── 5. Identificar tenant ───────────────────────────────────────────
        let integration: { id: string; tenantId: string } | null = null
        try {
          integration = await directPrisma.integration.findFirst({
            where:  { channel: 'WHATSAPP', identifier: phoneNumberId, isActive: true },
            select: { id: true, tenantId: true },
          })
        } catch (err) {
          request.log.error({ event: 'whatsapp_db_error', phoneNumberId, err }, 'Error consultando integrations')
          continue
        }

        if (!integration) {
          request.log.info(
            { event: 'whatsapp_phone_id_not_found', timestamp: new Date().toISOString(), phoneNumberId, enqueued: false },
            'Webhook: phone_number_id no registrado — descartado',
          )
          continue
        }

        // ── 6. Encolar un job por mensaje (no por change) ───────────────────
        // jobId = wamid garantiza desduplicación en reenvíos de Meta.
        for (const msg of value.messages ?? []) {
          const jobData: WhatsAppIncomingJob = {
            canal:         'whatsapp',
            tenantId:      integration.tenantId,
            integrationId: integration.id,
            phoneNumberId,
            from:          msg.from,
            content:       msg.text?.body ?? '',
            messageId:     msg.id,
            timestamp:     msg.timestamp,
            rawPayload:    value,
          }

          try {
            await incomingMessagesQueue.add('incoming-message', jobData, { jobId: `wa-${msg.id}` })

            request.log.info(
              {
                event:         'whatsapp_message_enqueued',
                timestamp:     new Date().toISOString(),
                phoneNumberId,
                tenantId:      integration.tenantId,
                from:          msg.from,
                messageId:     msg.id,
                enqueued:      true,
              },
              'Webhook: mensaje encolado',
            )
          } catch (err) {
            request.log.error(
              { event: 'whatsapp_queue_error', phoneNumberId, tenantId: integration.tenantId, enqueued: false, err },
              'Webhook: error al encolar mensaje',
            )
          }
        }
      }
    }
  })
}
