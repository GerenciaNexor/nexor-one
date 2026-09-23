/**
 * HU-212 — Worker de OCR para la carga masiva de facturas (BullMQ). Un job por imagen: lee con OCR y
 * guarda la propuesta; reintentos automáticos. Conexión Redis separada de la cola (requisito de BullMQ).
 */
import { Worker } from 'bullmq'
import { redisConnection } from '../lib/queue'
import { INVOICE_OCR_QUEUE, type InvoiceOcrJob } from '../lib/invoice-queue'
import { processBatchItem, finalizeFailedItem, sweepStuckInvoiceBatches } from '../modules/quick/service'

let worker: Worker<InvoiceOcrJob> | null = null
let sweeper: NodeJS.Timeout | null = null

/**
 * HU-213/214 — Concurrencia CONFIGURABLE (paralelo con control). Default 3: procesa varias facturas a
 * la vez, pero SIN disparar una tormenta de 429 (HU-214: con 5 simultáneas se saturaba el rate limit y
 * cada request entraba en un backoff de varios minutos que parecía un cuelgue). El tope de tiempo TOTAL
 * por llamada (OCR_TOTAL_TIMEOUT_MS, ver ocr/service) garantiza que el slot SIEMPRE se libera. Subir
 * `INVOICE_OCR_CONCURRENCY` solo si la cuenta de la API tiene un rate limit alto.
 */
const CONCURRENCY = Math.min(20, Math.max(1, Number(process.env['INVOICE_OCR_CONCURRENCY'] ?? 3)))

export function startInvoiceOcrWorker(): Worker<InvoiceOcrJob> {
  if (worker) return worker
  worker = new Worker<InvoiceOcrJob>(
    INVOICE_OCR_QUEUE,
    async (job) => { await processBatchItem(job.data.itemId) },
    { connection: redisConnection(), concurrency: CONCURRENCY },
  )
  worker.on('failed', (job, err) => {
    console.error(JSON.stringify({ event: 'invoice_ocr_failed', itemId: job?.data?.itemId, attempts: job?.attemptsMade, err: String(err?.message ?? err) }))
    // Solo tras agotar los reintentos se marca el ítem como fallido (el lote no se bloquea por uno).
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      finalizeFailedItem(job.data.itemId).catch((e) => console.error('[InvoiceOCR] finalizeFailed error:', e))
    }
  })
  // HU-214 — Barredor periódico: garantiza que ningún lote quede colgado sin fin (marca ítems atascados
  // como fallidos y cierra el lote). unref() para no impedir el apagado del proceso.
  if (!sweeper) {
    sweeper = setInterval(() => { sweepStuckInvoiceBatches().catch((e) => console.error('[InvoiceOCR] sweep error:', e)) }, 60_000)
    sweeper.unref?.()
  }
  console.info(JSON.stringify({ event: 'invoice_ocr_worker_started', queue: INVOICE_OCR_QUEUE, concurrency: CONCURRENCY }))
  return worker
}

export async function closeInvoiceOcrWorker(): Promise<void> {
  if (sweeper) { clearInterval(sweeper); sweeper = null }
  if (worker) { await worker.close(); worker = null }
}
