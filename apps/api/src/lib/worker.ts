/**
 * Worker de mensajes entrantes — BullMQ
 *
 * Consume la cola 'incoming-messages' y procesa cada job según su canal.
 * Sprint 4 (HU-033): registra el mensaje en los logs con todos sus datos.
 * Sprint 6+: llamará a AgentRunner para generar respuestas con IA.
 *
 * BullMQ requiere una conexión Redis SEPARADA de la Queue — no se comparte.
 *
 * Configuración de reintentos (definida en queue.ts):
 *   attempts: 3, backoff: exponential (2 s, 4 s, 8 s)
 *   removeOnFail: false → los fallidos quedan en la DLQ (estado 'failed' en BullMQ)
 *   Son visibles y reprocesables manualmente desde el dashboard de Bull Board.
 */

import { Worker, type Job } from 'bullmq'
import { google } from 'googleapis'
import { QUEUE_NAME, redisConnection, type IncomingMessageJob } from './queue'
import { directPrisma } from './prisma'
import { decrypt } from './encryption'

// ─── Procesador ───────────────────────────────────────────────────────────────

async function processIncomingMessage(job: Job<IncomingMessageJob>): Promise<void> {
  const { canal } = job.data

  if (canal === 'whatsapp') {
    const d = job.data
    // Sprint 6: aquí se llamará a AgentRunner para procesar el mensaje con IA.
    // Por ahora, registro completo en logs para verificación y auditoría.
    console.info(
      JSON.stringify({
        event:         'worker_message_received',
        jobId:         job.id,
        attemptsMade:  job.attemptsMade,
        canal:         'whatsapp',
        tenantId:      d.tenantId,
        integrationId: d.integrationId,
        phoneNumberId: d.phoneNumberId,
        from:          d.from,
        content:       d.content,
        messageId:     d.messageId,
        timestamp:     d.timestamp,
      }),
    )
  } else if (canal === 'gmail') {
    const d = job.data

    // ── 1. Obtener el refresh_token cifrado de la DB ───────────────────────
    const integration = await directPrisma.integration.findFirst({
      where:  { id: d.integrationId, tenantId: d.tenantId, channel: 'GMAIL', isActive: true },
      select: { tokenEncrypted: true },
    })

    if (!integration?.tokenEncrypted) {
      throw new Error(`No hay integración de Gmail activa — tenant: ${d.tenantId}`)
    }

    // ── 2. Descifrar refresh_token y obtener access_token fresco ──────────
    // El access_token NUNCA se guarda — se genera aquí y se descarta al terminar el job.
    const refreshToken = decrypt(integration.tokenEncrypted)
    const oauthClient  = new google.auth.OAuth2(
      process.env['GOOGLE_CLIENT_ID'],
      process.env['GOOGLE_CLIENT_SECRET'],
    )
    oauthClient.setCredentials({ refresh_token: refreshToken })

    // ── 3. Consultar Gmail API: mensajes nuevos desde historyId ──────────
    const gmail = google.gmail({ version: 'v1', auth: oauthClient })

    const { data: historyData } = await gmail.users.history.list({
      userId:       'me',
      startHistoryId: d.historyId,
      historyTypes: ['messageAdded'],
      labelId:      'INBOX',
    })

    const historyRecords = historyData.history ?? []

    if (historyRecords.length === 0) {
      console.info(JSON.stringify({
        event:        'worker_gmail_no_new_messages',
        jobId:        job.id,
        tenantId:     d.tenantId,
        emailAddress: d.emailAddress,
        historyId:    d.historyId,
      }))
      return
    }

    // ── 4. Por cada mensaje nuevo, obtener sus metadatos y registrar ──────
    // Sprint 6: aquí se llamará a AgentRunner para responder con IA.
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

        const headers  = fullMsg.payload?.headers ?? []
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

        console.info(JSON.stringify({
          event:        'worker_gmail_message_received',
          jobId:        job.id,
          attemptsMade: job.attemptsMade,
          tenantId:     d.tenantId,
          emailAddress: d.emailAddress,
          historyId:    d.historyId,
          messageId:    fullMsg.id,
          threadId:     fullMsg.threadId,
          from:         getHeader('From'),
          to:           getHeader('To'),
          subject:      getHeader('Subject'),
          date:         getHeader('Date'),
          snippet:      fullMsg.snippet ?? '',
        }))
      }
    }
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

let workerInstance: Worker<IncomingMessageJob> | null = null

/**
 * Crea e inicia el worker.
 * Separado de la declaración del módulo para evitar efectos secundarios al importar
 * (p. ej., en tests o scripts que solo importan los tipos).
 */
export function startWorker(): Worker<IncomingMessageJob> {
  if (workerInstance) return workerInstance

  workerInstance = new Worker<IncomingMessageJob>(
    QUEUE_NAME,
    processIncomingMessage,
    {
      // Conexión SEPARADA de la Queue (requisito de BullMQ/ioredis)
      connection:  redisConnection(),
      // Procesar hasta 5 mensajes en paralelo — ajustar según carga real
      concurrency: 5,
    },
  )

  workerInstance.on('completed', (job) => {
    console.info(
      JSON.stringify({
        event:   'worker_job_completed',
        jobId:   job.id,
        canal:   job.data.canal,
        tenantId: job.data.tenantId,
      }),
    )
  })

  workerInstance.on('failed', (job, err) => {
    const isLastAttempt = job
      ? job.attemptsMade >= (job.opts.attempts ?? 3)
      : true

    console.error(
      JSON.stringify({
        event:        isLastAttempt ? 'worker_job_dead_letter' : 'worker_job_retry',
        jobId:        job?.id,
        canal:        job?.data.canal,
        tenantId:     job?.data.tenantId,
        attemptsMade: job?.attemptsMade,
        maxAttempts:  job?.opts.attempts ?? 3,
        error:        err.message,
      }),
    )
  })

  workerInstance.on('error', (err) => {
    console.error(JSON.stringify({ event: 'worker_redis_error', error: err.message }))
  })

  console.info(JSON.stringify({ event: 'worker_started', queue: QUEUE_NAME, concurrency: 5 }))

  return workerInstance
}

/**
 * Cierra el worker limpiamente — espera a que los jobs en curso terminen.
 * Llamar desde el hook onClose de Fastify antes de cerrar las colas.
 */
export async function closeWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close()
    workerInstance = null
  }
}
