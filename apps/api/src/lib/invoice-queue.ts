/**
 * HU-212 — Cola de OCR para la carga masiva de facturas (BullMQ + Redis).
 *
 * Un job por IMAGEN del lote: el worker lee la imagen con OCR (pipeline HU-191), guarda la propuesta y
 * detecta duplicados, con reintentos. No bloquea al usuario (procesamiento en segundo plano). El worker
 * vive en `jobs/invoice-ocr-worker.ts` (conexión Redis separada, como exige BullMQ).
 */
import { Queue } from 'bullmq'
import { redisConnection } from './queue'

export const INVOICE_OCR_QUEUE = 'invoice-ocr'

/** Un job = una imagen del lote a leer por OCR. */
export interface InvoiceOcrJob {
  itemId:   string
  tenantId: string
}

export const invoiceOcrQueue = new Queue<InvoiceOcrJob>(INVOICE_OCR_QUEUE, {
  connection: redisConnection(),
  defaultJobOptions: {
    // HU-213 — El backoff del rate limit (429/529) lo gestiona el SDK de Anthropic (respeta
    // Retry-After). Por eso BullMQ solo reintenta 2 veces (1 reintento) como red de seguridad ante
    // fallos transitorios de red/DB: así un error NO multiplica el costo de tokens en la cola.
    // Los ítems ya finalizados (ready/duplicate/unreadable/registered) no se re-procesan (guarda en
    // processBatchItem), así que un reintento nunca re-cobra un OCR ya resuelto.
    attempts: 2,
    backoff:  { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: false,
  },
})

/** Encola la lectura OCR de un ítem del lote. */
export async function enqueueInvoiceOcr(job: InvoiceOcrJob): Promise<void> {
  // BullMQ no admite ':' en un jobId personalizado; usamos '-' (idempotente por ítem).
  await invoiceOcrQueue.add('ocr', job, { jobId: `item-${job.itemId}` })
}

export async function closeInvoiceOcrQueue(): Promise<void> {
  await invoiceOcrQueue.close()
}
