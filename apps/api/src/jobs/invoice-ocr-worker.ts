/**
 * HU-212 — Worker de OCR para la carga masiva de facturas (BullMQ). Un job por imagen: lee con OCR y
 * guarda la propuesta; reintentos automáticos. Conexión Redis separada de la cola (requisito de BullMQ).
 */
import { Worker } from 'bullmq'
import { redisConnection } from '../lib/queue'
import { INVOICE_OCR_QUEUE, type InvoiceOcrJob } from '../lib/invoice-queue'
import { processBatchItem, finalizeFailedItem } from '../modules/quick/service'

let worker: Worker<InvoiceOcrJob> | null = null

export function startInvoiceOcrWorker(): Worker<InvoiceOcrJob> {
  if (worker) return worker
  worker = new Worker<InvoiceOcrJob>(
    INVOICE_OCR_QUEUE,
    async (job) => { await processBatchItem(job.data.itemId) },
    { connection: redisConnection(), concurrency: 3 },
  )
  worker.on('failed', (job, err) => {
    console.error(JSON.stringify({ event: 'invoice_ocr_failed', itemId: job?.data?.itemId, attempts: job?.attemptsMade, err: String(err?.message ?? err) }))
    // Solo tras agotar los reintentos se marca el ítem como fallido (el lote no se bloquea por uno).
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      finalizeFailedItem(job.data.itemId).catch((e) => console.error('[InvoiceOCR] finalizeFailed error:', e))
    }
  })
  console.info(JSON.stringify({ event: 'invoice_ocr_worker_started', queue: INVOICE_OCR_QUEUE, concurrency: 3 }))
  return worker
}

export async function closeInvoiceOcrWorker(): Promise<void> {
  if (worker) { await worker.close(); worker = null }
}
