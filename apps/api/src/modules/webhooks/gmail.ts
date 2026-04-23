/**
 * Webhook de Gmail — Notificaciones de Google Pub/Sub
 *
 * POST /webhook/gmail — Recibe notificaciones de Pub/Sub cuando llega un email nuevo.
 *
 * Flujo de Google Pub/Sub:
 *   1. Email entra a la bandeja de una empresa conectada.
 *   2. Gmail publica una notificación en el topic de Pub/Sub configurado en HU-034.
 *   3. Pub/Sub hace POST a este endpoint con el payload envuelto en base64.
 *   4. Extraemos emailAddress + historyId, identificamos al tenant y encolamos.
 *
 * Formato del payload de Pub/Sub:
 *   {
 *     "message": {
 *       "data": "<base64({ emailAddress, historyId })>",
 *       "messageId": "...",
 *       "publishTime": "..."
 *     },
 *     "subscription": "projects/.../subscriptions/..."
 *   }
 *
 * Reglas críticas:
 * - El POST SIEMPRE responde 200 inmediatamente.
 *   Si Pub/Sub no recibe 200 en tiempo, reintenta el delivery → jobs duplicados.
 * - La deduplicación se hace con jobId estable en BullMQ (emailAddress + historyId).
 * - No requiere JWT — la autenticidad es responsabilidad del tenant de Pub/Sub.
 */

import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { directPrisma } from '../../lib/prisma'
import { incomingMessagesQueue, type GmailIncomingJob } from '../../lib/queue'

// ─── Tipos del payload de Pub/Sub ────────────────────────────────────────────

interface PubSubMessage {
  data:         string   // JSON base64: { emailAddress, historyId }
  messageId:    string
  publishTime:  string
  attributes?:  Record<string, string>
}

interface PubSubPayload {
  message:      PubSubMessage
  subscription: string
  __rawBuffer__?: Buffer
}

/** Contenido del campo data decodificado. */
interface GmailNotification {
  emailAddress: string
  historyId:    number | string
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default async function gmailWebhookRoutes(app: FastifyInstance): Promise<void> {

  /**
   * POST /webhook/gmail
   * Recibe notificaciones de Google Pub/Sub de todos los tenants.
   * Responde 200 inmediatamente; el procesamiento ocurre en el worker.
   */
  app.post('/', async (request, reply) => {

    // ── 0. Verificar token de autenticación del webhook ─────────────────────
    // La URL de Pub/Sub se configura como: .../webhook/gmail?token=<secret>
    // timingSafeEqual con SHA-256 normaliza longitudes y evita timing attacks.
    const secret        = process.env['GMAIL_WEBHOOK_SECRET']
    const providedToken = (request.query as { token?: string }).token ?? ''
    const sha256        = (s: string) => crypto.createHash('sha256').update(s).digest()
    if (!secret || !providedToken) {
      return reply.code(401).send({ error: 'Firma inválida', code: 'INVALID_SIGNATURE' })
    }
    try {
      if (!crypto.timingSafeEqual(sha256(secret), sha256(providedToken))) {
        return reply.code(401).send({ error: 'Firma inválida', code: 'INVALID_SIGNATURE' })
      }
    } catch {
      return reply.code(401).send({ error: 'Firma inválida', code: 'INVALID_SIGNATURE' })
    }

    // ── 1. Responder 200 a Pub/Sub INMEDIATAMENTE ───────────────────────────
    // Si Pub/Sub no recibe 200 en tiempo, reintenta el delivery.
    void reply.code(200).send({ status: 'ok' })

    // ── 2. Extraer el mensaje del envelope de Pub/Sub ───────────────────────
    const body = request.body as PubSubPayload
    const pubSubMessage = body?.message

    if (!pubSubMessage?.data) {
      request.log.warn(
        { event: 'gmail_webhook_missing_data' },
        'Webhook Gmail: payload de Pub/Sub sin campo data — descartado',
      )
      return
    }

    // ── 3. Decodificar base64 → JSON ────────────────────────────────────────
    let notification: GmailNotification
    try {
      const decoded = Buffer.from(pubSubMessage.data, 'base64').toString('utf8')
      notification  = JSON.parse(decoded) as GmailNotification
    } catch {
      request.log.warn(
        { event: 'gmail_webhook_decode_error', pubSubMessageId: pubSubMessage.messageId },
        'Webhook Gmail: error decodificando payload base64 — descartado',
      )
      return
    }

    const emailAddress = notification.emailAddress
    const historyId    = String(notification.historyId)

    if (!emailAddress || !historyId) {
      request.log.warn(
        { event: 'gmail_webhook_missing_fields', notification },
        'Webhook Gmail: faltan emailAddress o historyId — descartado',
      )
      return
    }

    // ── 4. Identificar tenant por emailAddress ──────────────────────────────
    let integration: { id: string; tenantId: string } | null = null
    try {
      integration = await directPrisma.integration.findFirst({
        where:  { channel: 'GMAIL', identifier: emailAddress, isActive: true },
        select: { id: true, tenantId: true },
      })
    } catch (err) {
      request.log.error(
        { event: 'gmail_db_error', emailAddress, err },
        'Webhook Gmail: error consultando integrations',
      )
      return
    }

    if (!integration) {
      request.log.info(
        {
          event:        'gmail_email_not_found',
          timestamp:    new Date().toISOString(),
          emailAddress,
          enqueued:     false,
        },
        'Webhook Gmail: emailAddress no registrado — descartado',
      )
      return
    }

    // ── 5. Encolar job con jobId estable (desduplicación) ───────────────────
    // jobId = gmail-<email>-<historyId> garantiza idempotencia en redeliveries.
    const jobData: GmailIncomingJob = {
      canal:         'gmail',
      tenantId:      integration.tenantId,
      integrationId: integration.id,
      emailAddress,
      historyId,
      rawPayload:    body,
    }

    try {
      await incomingMessagesQueue.add('incoming-message', jobData, {
        jobId: `gmail-${emailAddress}-${historyId}`,
      })

      request.log.info(
        {
          event:        'gmail_notification_enqueued',
          timestamp:    new Date().toISOString(),
          emailAddress,
          historyId,
          tenantId:     integration.tenantId,
          enqueued:     true,
        },
        'Webhook Gmail: notificación encolada',
      )
    } catch (err) {
      request.log.error(
        {
          event:        'gmail_queue_error',
          emailAddress,
          tenantId:     integration.tenantId,
          enqueued:     false,
          err,
        },
        'Webhook Gmail: error al encolar notificación',
      )
    }
  })
}
