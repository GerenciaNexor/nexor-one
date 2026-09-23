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
    attempts: 3,
    backoff:  { type: 'exponential', delay: 3_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: false,
  },
})

/** Encola la lectura OCR de un ítem del lote. */
export async function enqueueInvoiceOcr(job: InvoiceOcrJob): Promise<void> {
  await invoiceOcrQueue.add('ocr', job, { jobId: `item:${job.itemId}` })
}

export async function closeInvoiceOcrQueue(): Promise<void> {
  await invoiceOcrQueue.close()
}
