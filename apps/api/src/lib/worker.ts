/**
 * Worker de mensajes entrantes — BullMQ
 *
 * Consume la cola 'incoming-messages' y procesa cada job según su canal.
 * HU-033 (Sprint 4): cola + registro de mensajes.
 * HU-049 (Sprint 6): AgentRunner para generar respuestas con IA.
 *
 * BullMQ requiere una conexión Redis SEPARADA de la Queue — no se comparte.
 *
 * Configuración de reintentos (definida en queue.ts):
 *   attempts: 3, backoff: exponential (2 s, 4 s, 8 s)
 *   removeOnFail: false → los fallidos quedan en la DLQ (estado 'failed' en BullMQ)
 */

import { Worker, type Job } from 'bullmq'
import { google } from 'googleapis'
import { QUEUE_NAME, redisConnection, type IncomingMessageJob } from './queue'
import { directPrisma } from './prisma'
import { decrypt } from './encryption'
import { runAgent } from '../modules/agents/agent.runner'
import type { AgentModule } from '../modules/agents/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Envía un mensaje de texto de vuelta al remitente por WhatsApp Business API */
async function sendWhatsAppReply(
  phoneNumberId: string,
  to:            string,
  text:          string,
  accessToken:   string,
): Promise<void> {
  const url  = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`
  const body = {
    messaging_product: 'whatsapp',
    to,
    type:              'text',
    text:              { body: text },
  }

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body:    JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`[worker] WhatsApp send failed (${res.status}): ${detail}`)
  }
}

/**
 * Determina el módulo del agente a invocar según los feature flags del tenant.
 *
 * - Si solo hay un módulo activo: lo devuelve directamente.
 * - Si hay varios activos: puntúa el mensaje con keywords de cada módulo
 *   y elige el de mayor score. En caso de empate, aplica la prioridad fija.
 *
 * La decisión es determinista — el mismo mensaje siempre produce el mismo módulo.
 */
async function resolveModule(tenantId: string, message: string): Promise<AgentModule> {
  const flags = await directPrisma.featureFlag.findMany({
    where:  { tenantId, enabled: true },
    select: { module: true },
  })
  const enabled = new Set(flags.map((f) => f.module as string))

  // Prioridad fija cuando no hay distinción por keywords
  const PRIORITY: AgentModule[] = ['KIRA', 'NIRA', 'ARI', 'AGENDA']
  const active = PRIORITY.filter((m) => enabled.has(m))

  if (active.length === 0) return 'KIRA'  // fallback de seguridad
  if (active.length === 1) return active[0]!

  // ── Routing por keywords cuando hay múltiples módulos activos ────────────
  const KEYWORDS: Partial<Record<AgentModule, string[]>> = {
    KIRA:   ['stock', 'inventario', 'producto', 'entrada', 'salida', 'unidades',
              'bodega', 'almacén', 'cantidad', 'existencia', 'mercancía'],
    NIRA:   ['compra', 'proveedor', 'orden', 'cotización', 'precio', 'pedido',
              'factura', 'surtir', ' oc ', 'suministro', 'abastec'],
    ARI:    ['cliente', 'venta', 'cotizar', 'lead', 'oportunidad', 'oferta',
              'presupuesto', 'negocio', 'contrato'],
    AGENDA: ['cita', 'turno', 'agendar', 'horario', 'disponibilidad', 'reservar',
              'appointment', 'agenda'],
  }

  const lower = message.toLowerCase()
  const scores = new Map<AgentModule, number>()

  for (const mod of active) {
    const hits = (KEYWORDS[mod] ?? []).filter((kw) => lower.includes(kw)).length
    scores.set(mod, hits)
  }

  // Módulo con mayor score; en empate, prioridad fija
  const best = active.reduce((a, b) => (scores.get(b) ?? 0) > (scores.get(a) ?? 0) ? b : a)
  return best
}

// ─── Procesador ───────────────────────────────────────────────────────────────

async function processIncomingMessage(job: Job<IncomingMessageJob>): Promise<void> {
  const { canal } = job.data

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  if (canal === 'whatsapp') {
    const d = job.data

    console.info(JSON.stringify({
      event:         'worker_whatsapp_received',
      jobId:         job.id,
      tenantId:      d.tenantId,
      from:          d.from,
      content:       d.content,
    }))

    // Obtener access_token cifrado de la integración
    const integration = await directPrisma.integration.findFirst({
      where:  { id: d.integrationId, tenantId: d.tenantId, channel: 'WHATSAPP', isActive: true },
      select: { tokenEncrypted: true },
    })

    if (!integration?.tokenEncrypted) {
      throw new Error(`No hay integración de WhatsApp activa — tenant: ${d.tenantId}`)
    }

    const accessToken = decrypt(integration.tokenEncrypted)
    const module      = await resolveModule(d.tenantId, d.content)

    // Invocar AgentRunner
    const result = await runAgent({
      tenantId:      d.tenantId,
      module,
      channel:       'whatsapp',
      message:       d.content,
      senderId:      d.from,
      integrationId: d.integrationId,
    })

    console.info(JSON.stringify({
      event:      'worker_whatsapp_agent_done',
      jobId:      job.id,
      tenantId:   d.tenantId,
      turns:      result.turnCount,
      toolsUsed:  result.toolsUsed,
      hitMaxTurns: result.hitMaxTurns,
      durationMs: result.durationMs,
    }))

    // Enviar respuesta al remitente
    await sendWhatsAppReply(d.phoneNumberId, d.from, result.reply, accessToken)

  // ── Gmail ─────────────────────────────────────────────────────────────────
  } else if (canal === 'gmail') {
    const d = job.data

    const integration = await directPrisma.integration.findFirst({
      where:  { id: d.integrationId, tenantId: d.tenantId, channel: 'GMAIL', isActive: true },
      select: { tokenEncrypted: true },
    })

    if (!integration?.tokenEncrypted) {
      throw new Error(`No hay integración de Gmail activa — tenant: ${d.tenantId}`)
    }

    const refreshToken = decrypt(integration.tokenEncrypted)
    const oauthClient  = new google.auth.OAuth2(
      process.env['GOOGLE_CLIENT_ID'],
      process.env['GOOGLE_CLIENT_SECRET'],
    )
    oauthClient.setCredentials({ refresh_token: refreshToken })

    const gmail = google.gmail({ version: 'v1', auth: oauthClient })

    const { data: historyData } = await gmail.users.history.list({
      userId:         'me',
      startHistoryId: d.historyId,
      historyTypes:   ['messageAdded'],
      labelId:        'INBOX',
    })

    const historyRecords = historyData.history ?? []

    if (historyRecords.length === 0) {
      console.info(JSON.stringify({
        event:    'worker_gmail_no_new_messages',
        jobId:    job.id,
        tenantId: d.tenantId,
      }))
      return
    }

    for (const record of historyRecords) {
      for (const added of record.messagesAdded ?? []) {
        const messageId = added.message?.id
        if (!messageId) continue

        const { data: fullMsg } = await gmail.users.messages.get({
          userId:          'me',
          id:              messageId,
          format:          'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date'],
        })

        const headers   = fullMsg.payload?.headers ?? []
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

        const from    = getHeader('From')
        const subject = getHeader('Subject')
        const snippet = fullMsg.snippet ?? ''

        console.info(JSON.stringify({
          event:    'worker_gmail_message_received',
          jobId:    job.id,
          tenantId: d.tenantId,
          from,
          subject,
        }))

        // Invocar AgentRunner con el contenido del email
        const emailMessage = `Asunto: ${subject}\nDe: ${from}\n\n${snippet}`
        const module       = await resolveModule(d.tenantId, emailMessage)

        const result = await runAgent({
          tenantId:      d.tenantId,
          module,
          channel:       'gmail',
          message:       emailMessage,
          senderId:      from,
          integrationId: d.integrationId,
        })

        console.info(JSON.stringify({
          event:       'worker_gmail_agent_done',
          jobId:       job.id,
          tenantId:    d.tenantId,
          turns:       result.turnCount,
          toolsUsed:   result.toolsUsed,
          hitMaxTurns: result.hitMaxTurns,
          durationMs:  result.durationMs,
        }))

        // Sprint 6+: enviar respuesta por Gmail (reply al thread)
        // Por ahora el log queda registrado en agent_logs
      }
    }
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

let workerInstance: Worker<IncomingMessageJob> | null = null

export function startWorker(): Worker<IncomingMessageJob> {
  if (workerInstance) return workerInstance

  workerInstance = new Worker<IncomingMessageJob>(
    QUEUE_NAME,
    processIncomingMessage,
    {
      connection:  redisConnection(),
      concurrency: 5,
    },
  )

  workerInstance.on('completed', (job) => {
    console.info(JSON.stringify({
      event:    'worker_job_completed',
      jobId:    job.id,
      canal:    job.data.canal,
      tenantId: job.data.tenantId,
    }))
  })

  workerInstance.on('failed', (job, err) => {
    const isLastAttempt = job
      ? job.attemptsMade >= (job.opts.attempts ?? 3)
      : true

    console.error(JSON.stringify({
      event:        isLastAttempt ? 'worker_job_dead_letter' : 'worker_job_retry',
      jobId:        job?.id,
      canal:        job?.data.canal,
      tenantId:     job?.data.tenantId,
      attemptsMade: job?.attemptsMade,
      maxAttempts:  job?.opts.attempts ?? 3,
      error:        err.message,
    }))
  })

  workerInstance.on('error', (err) => {
    console.error(JSON.stringify({ event: 'worker_redis_error', error: err.message }))
  })

  console.info(JSON.stringify({ event: 'worker_started', queue: QUEUE_NAME, concurrency: 5 }))

  return workerInstance
}

export async function closeWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close()
    workerInstance = null
  }
}
