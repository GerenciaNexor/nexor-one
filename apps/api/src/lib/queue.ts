/**
 * Cola unificada de mensajes entrantes — BullMQ + Redis
 *
 * Una sola cola ('incoming-messages') recibe mensajes de todos los canales
 * (WhatsApp, Gmail). El canal se discrimina por el campo `canal` del job.
 * Esto simplifica el monitoring, los reintentos y el dashboard de Bull Board.
 *
 * Workers: src/lib/worker.ts
 * Dashboard: /v1/admin/queues (solo SUPER_ADMIN)
 */

import { Queue } from 'bullmq'

// ─── Nombre de la cola ────────────────────────────────────────────────────────

export const QUEUE_NAME = 'incoming-messages'

// ─── Conexión Redis ───────────────────────────────────────────────────────────

/**
 * Parsea REDIS_URL y devuelve las opciones de conexión que acepta BullMQ/ioredis.
 * Se exporta para que el Worker pueda reusar la misma configuración con una
 * conexión separada (BullMQ requiere conexiones independientes para Queue y Worker).
 */
export function redisConnection(): {
  host:      string
  port:      number
  password?: string
  db?:       number
  tls?:      object
  // HU-214 — resiliencia de la conexión (ver notas abajo)
  maxRetriesPerRequest: null
  enableReadyCheck:     boolean
  family:               number
  keepAlive:            number
  connectTimeout:       number
  retryStrategy:        (times: number) => number
} {
  const raw = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
  // HU-214 — Ajustes de resiliencia (evitan que el worker pierda la conexión y deje jobs colgados):
  // - maxRetriesPerRequest: null  → requerido por BullMQ para el cliente bloqueante del worker.
  // - family: 0                   → DNS dual-stack: Railway resuelve `*.railway.internal` por IPv6;
  //                                 con el default IPv4 la conexión daba `connect ETIMEDOUT`.
  // - keepAlive / connectTimeout  → detecta y recicla conexiones muertas en vez de colgarse.
  // - retryStrategy               → reconecta con backoff acotado (no se rinde y no martilla).
  const resilience = {
    maxRetriesPerRequest: null as null,
    enableReadyCheck:     false,
    family:               0,
    keepAlive:            30_000,
    connectTimeout:       15_000,
    retryStrategy:        (times: number) => Math.min(times * 300, 5_000),
  }
  try {
    const u = new URL(raw)
    return {
      host:     u.hostname || 'localhost',
      port:     parseInt(u.port || '6379', 10),
      password: u.password || undefined,
      db:       u.pathname && u.pathname.length > 1 ? parseInt(u.pathname.slice(1), 10) : undefined,
      tls:      u.protocol === 'rediss:' ? {} : undefined,
      ...resilience,
    }
  } catch {
    return { host: 'localhost', port: 6379, ...resilience }
  }
}

// ─── Tipos de job — discriminated union por canal ─────────────────────────────

/** Job de mensaje de WhatsApp entrante. */
export interface WhatsAppIncomingJob {
  canal:         'whatsapp'
  /** Tenant identificado por phone_number_id */
  tenantId:      string
  /** ID en tabla integrations */
  integrationId: string
  /** phone_number_id del número de WhatsApp Business */
  phoneNumberId: string
  /** Número de teléfono del remitente (cliente) */
  from:          string
  /** Contenido del mensaje de texto */
  content:       string
  /** ID del mensaje asignado por Meta (wamid.xxx) */
  messageId:     string
  /** Unix timestamp del mensaje (string, según API de Meta) */
  timestamp:     string
  /** Media ID de Meta — presente si el mensaje tiene imagen o documento adjunto */
  mediaId?:       string
  /** MIME type del adjunto (image/jpeg, image/png, image/webp, application/pdf) */
  mediaType?:     string
  /** Nombre del archivo (solo para documentos) */
  mediaFileName?: string
  /** Payload completo del change.value para compatibilidad futura */
  rawPayload:    unknown
}

/** Job de notificación de Gmail entrante. */
export interface GmailIncomingJob {
  canal:         'gmail'
  tenantId:      string
  integrationId: string
  /** Dirección de email asociada al tenant */
  emailAddress:  string
  /** historyId enviado por Google pub/sub — usado para obtener los cambios reales */
  historyId:     string
  rawPayload:    unknown
}

/** Unión discriminada — el tipo real de un job de la cola incoming-messages. */
export type IncomingMessageJob = WhatsAppIncomingJob | GmailIncomingJob

// ─── Cola ─────────────────────────────────────────────────────────────────────

export const incomingMessagesQueue = new Queue<IncomingMessageJob>(QUEUE_NAME, {
  connection: redisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff:  { type: 'exponential', delay: 2_000 },
    // removeOnComplete: guardar últimos 500 para auditoría en Bull Board
    removeOnComplete: { count: 500 },
    // removeOnFail: FALSE — los fallidos son la DLQ, no se eliminan automáticamente
    removeOnFail: false,
  },
})

// ─── Cierre limpio ────────────────────────────────────────────────────────────

/** Cierra la cola al apagar el servidor. Ver también closeWorker() en worker.ts. */
export async function closeQueues(): Promise<void> {
  await incomingMessagesQueue.close()
}
