/**
 * Worker de mensajes entrantes — BullMQ
 *
 * Consume la cola 'incoming-messages' y procesa cada job según su canal.
 * HU-033 (Sprint 4): cola + registro de mensajes.
 * HU-049 (Sprint 6): AgentRunner para generar respuestas con IA.
 * HU-104 (Sprint 11.6): Conversaciones — FindOrCreate por canal/remitente.
 *
 * BullMQ requiere una conexión Redis SEPARADA de la Queue — no se comparte.
 *
 * Configuración de reintentos (definida en queue.ts):
 *   attempts: 3, backoff: exponential (2 s, 4 s, 8 s)
 *   removeOnFail: false → los fallidos quedan en la DLQ (estado 'failed' en BullMQ)
 */

import { Worker, type Job } from 'bullmq'
import { google } from 'googleapis'
import type { ModuleName } from '@prisma/client'
import { QUEUE_NAME, redisConnection, type IncomingMessageJob } from './queue'
import { directPrisma } from './prisma'
import { decrypt } from './encryption'
import { markIntegrationDown, markIntegrationHealthy } from './integration-status'
import { isOwnGmailMessage } from './gmail-loop-guard'
import { runAgent } from '../modules/agents/agent.runner'
import type { AgentModule } from '../modules/agents/types'
import { extractDocument } from '../modules/ocr/service'
import type { OrderExtraction, QuoteExtraction } from '../modules/ocr/service'

// ─── Salvaguarda anti-bucle de Gmail (HU-184, 2ª capa) ────────────────────────
// Aunque el filtro de correos propios corta el bucle en su origen, este límite frena cualquier
// realimentación imprevista: no más de N respuestas del agente por conversación en una ventana corta.
const GMAIL_LOOP_WINDOW_MS  = 5 * 60 * 1000
const GMAIL_LOOP_MAX_REPLIES = 8

// ─── Helpers de conversaciones ───────────────────────────────────────────────

/**
 * Extrae la dirección de email pura del header "From" de un email.
 * Soporta los formatos: "Nombre <email>" y "email".
 */
function extractEmailAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/)
  if (match?.[1]) return match[1].toLowerCase().trim()
  return fromHeader.toLowerCase().trim()
}

/**
 * Extrae el nombre del remitente del header "From" de un email.
 * Devuelve undefined si solo hay una dirección sin nombre.
 */
function extractSenderName(fromHeader: string): string | undefined {
  const match = fromHeader.match(/^"?(.+?)"?\s*</)
  if (match?.[1]) return match[1].trim()
  return undefined
}

/**
 * Devuelve la conversación ÚNICA y persistente del contacto (por tenant, canal y remitente),
 * creándola si no existe. HU-186: sin ventana de tiempo ni filtro por estado — los mensajes del
 * mismo número/correo se agrupan siempre en la misma conversación, pasen minutos o días.
 *
 * Usa directPrisma porque el worker corre fuera del contexto de tenant HTTP.
 */
async function findOrCreateConversation(params: {
  tenantId:         string
  channel:          'WHATSAPP' | 'GMAIL'
  senderIdentifier: string
  senderName?:      string
  relatedModule?:   AgentModule
}): Promise<string> {
  const { tenantId, channel, senderIdentifier, senderName, relatedModule } = params
  const now = new Date()

  // HU-186 — UNA sola conversación persistente por contacto y canal. Sin ventana de tiempo ni filtro
  // por estado: los mensajes del mismo número/correo se agrupan SIEMPRE aquí, pasen minutos o días.
  // Upsert atómico sobre el índice único (tenant, channel, sender) → sin duplicados aunque lleguen
  // dos mensajes casi a la vez. Un mensaje nuevo REABRE la conversación (status 'open').
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const conv = await directPrisma.conversation.upsert({
        where:  { tenantId_channel_senderIdentifier: { tenantId, channel, senderIdentifier } },
        create: {
          tenantId, channel, senderIdentifier,
          senderName:    senderName ?? null,
          relatedModule: relatedModule ? (relatedModule as ModuleName) : null,
          status:        'open',
          lastMessageAt: now,
        },
        update: {
          lastMessageAt: now,
          status:        'open',
          ...(relatedModule ? { relatedModule: relatedModule as ModuleName } : {}),
          ...(senderName    ? { senderName } : {}),
        },
        select: { id: true },
      })
      return conv.id
    } catch (err) {
      // Carrera entre dos mensajes casi simultáneos: reintentar (en el 2º intento ya existe → update).
      if ((err as { code?: string }).code === 'P2002' && attempt === 0) continue
      throw err
    }
  }
  throw new Error('findOrCreateConversation: no se pudo resolver la conversación')
}

/**
 * Memoria del agente (HU-186): últimos N mensajes de una conversación en orden cronológico.
 * inbound → 'user' (el cliente), outbound → 'assistant' (el negocio/agente). Excluye mensajes de
 * sistema. La ventana (25) equilibra memoria y costo; no se cargan historiales ilimitados.
 */
async function loadConversationHistory(
  conversationId: string, tenantId: string, limit = 25,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const rows = await directPrisma.conversationMessage.findMany({
    where:   { conversationId, tenantId, messageType: { not: 'system' } },
    orderBy: { createdAt: 'desc' },
    take:    limit,
    select:  { direction: true, content: true },
  })
  return rows.reverse().map((r) => ({
    role:    r.direction === 'inbound' ? 'user' : 'assistant',
    content: r.content,
  }))
}

/**
 * Persiste un mensaje individual en conversation_messages. APPEND-ONLY.
 *
 * Idempotente y ATÓMICO (HU-181): el índice UNIQUE (tenant_id, external_message_id) garantiza
 * que el mismo mensaje entrante (wamid/Gmail messageId) solo se inserta una vez, incluso con
 * varios jobs concurrentes o reintentos. Devuelve `true` si insertó (mensaje NUEVO) y `false` si
 * era un duplicado (violación de unicidad P2002). El worker usa este booleano como candado: si es
 * duplicado, NO corre el agente ni responde → un mensaje = una respuesta.
 *
 * Los mensajes outbound (externalMessageId NULL) siempre insertan (NULL es distinto en SQL).
 */
async function saveConversationMessage(params: {
  conversationId:     string
  tenantId:           string
  direction:          'inbound' | 'outbound'
  content:            string
  messageType?:       string
  isFromAgent?:       boolean
  userId?:            string
  externalMessageId?: string
  timestamp:          Date
}): Promise<boolean> {
  try {
    await directPrisma.conversationMessage.create({
      data: {
        conversationId:    params.conversationId,
        tenantId:          params.tenantId,
        direction:         params.direction,
        content:           params.content,
        messageType:       params.messageType ?? 'text',
        isFromAgent:       params.isFromAgent ?? false,
        userId:            params.userId ?? null,
        externalMessageId: params.externalMessageId ?? null,
        timestamp:         params.timestamp,
      },
    })
    return true
  } catch (err) {
    // P2002 = violación de índice único → el mensaje ya fue registrado (duplicado). No es un error.
    if ((err as { code?: string }).code === 'P2002') return false
    throw err
  }
}

// ─── Helpers de envío ─────────────────────────────────────────────────────────

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
 * Determina el módulo/agente que atiende un mensaje ENTRANTE de un canal externo
 * (WhatsApp/Gmail). HU-180 — corrige la causa raíz de HU-179 (antes enrutaba a KIRA,
 * el asistente de inventario interno, por defecto).
 *
 * Reglas (deterministas):
 *   1. Override por integración: `integration.metadata.module` permite forzar un módulo
 *      interno para un canal concreto ("este número/correo atiende ventas/compras"),
 *      siempre que ese módulo esté habilitado para el tenant.
 *   2. Por defecto: el agente de ATENCIÓN al cliente ('ATENCION'), que habla en nombre de
 *      la empresa, cotiza/orienta y hace handoff a un asesor humano.
 *
 * No se enruta por keywords ni se reutiliza el módulo del hilo previo: el routing externo
 * es estable por canal, así que la conversación no salta de agente entre mensajes.
 */
async function resolveExternalModule(tenantId: string, integrationId: string): Promise<AgentModule> {
  const VALID: AgentModule[] = ['KIRA', 'NIRA', 'ARI', 'AGENDA', 'VERA', 'ATENCION']

  const integ = await directPrisma.integration.findUnique({
    where:  { id: integrationId },
    select: { metadata: true },
  })
  const meta = (integ?.metadata ?? {}) as Record<string, unknown>
  const override = typeof meta['module'] === 'string' ? (meta['module'] as string).toUpperCase() : null

  if (override && override !== 'ATENCION' && VALID.includes(override as AgentModule)) {
    // Solo respeta el override si ese módulo interno está habilitado para el tenant.
    const flag = await directPrisma.featureFlag.findFirst({
      where:  { tenantId, module: override as never, enabled: true },
      select: { module: true },
    })
    if (flag) return override as AgentModule
  }

  return 'ATENCION'
}

// ─── Helpers OCR + creación de borradores ────────────────────────────────────

/** Descarga imagen/documento de WhatsApp usando la Media API de Meta (en memoria). */
async function downloadWhatsAppMedia(
  mediaId:     string,
  accessToken: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!metaRes.ok) return null
    const meta = await metaRes.json() as { url?: string; mime_type?: string }
    if (!meta.url) return null

    const fileRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!fileRes.ok) return null

    return {
      buffer:   Buffer.from(await fileRes.arrayBuffer()),
      mimeType: meta.mime_type ?? 'image/jpeg',
    }
  } catch {
    return null
  }
}

type GmailPart = {
  mimeType?: string | null
  filename?: string | null
  body?: { attachmentId?: string | null } | null
}

type GmailClient = ReturnType<typeof google.gmail>

/** Descarga el primer adjunto imagen/PDF de un mensaje Gmail (en memoria). */
async function downloadGmailAttachment(
  gmail:     GmailClient,
  messageId: string,
  parts:     GmailPart[],
): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
  const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    'application/octet-stream'])
  for (const part of parts) {
    if (!ALLOWED.has(part.mimeType ?? '') || !part.body?.attachmentId) continue
    try {
      const { data: att } = await gmail.users.messages.attachments.get({
        userId: 'me', messageId, id: part.body.attachmentId,
      })
      if (!att.data) continue
      const base64 = att.data.replace(/-/g, '+').replace(/_/g, '/')
      return {
        buffer:   Buffer.from(base64, 'base64'),
        mimeType: part.mimeType ?? 'application/octet-stream',
        filename: part.filename ?? 'attachment',
      }
    } catch { continue }
  }
  return null
}

/** Genera el siguiente número de OC para el tenant (OC-YYYY-NNN). */
async function generatePoNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const pfx  = `OC-${year}-`
  const last = await directPrisma.purchaseOrder.findFirst({
    where:   { tenantId, orderNumber: { startsWith: pfx } },
    orderBy: { orderNumber: 'desc' },
    select:  { orderNumber: true },
  })
  const seq = last ? parseInt(last.orderNumber.split('-')[2] ?? '0', 10) + 1 : 1
  return `${pfx}${String(seq).padStart(3, '0')}`
}

/** Genera el siguiente número de cotización para el tenant (COT-YYYY-NNN). */
async function generateQuoteNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const pfx  = `COT-${year}-`
  const last = await directPrisma.quote.findFirst({
    where:   { tenantId, quoteNumber: { startsWith: pfx } },
    orderBy: { quoteNumber: 'desc' },
    select:  { quoteNumber: true },
  })
  const seq = last ? parseInt(last.quoteNumber.split('-')[2] ?? '0', 10) + 1 : 1
  return `${pfx}${String(seq).padStart(3, '0')}`
}

/** Retorna los IDs de usuarios a notificar para el módulo dado. */
async function findUsersToNotify(tenantId: string, module: 'NIRA' | 'ARI'): Promise<string[]> {
  const users = await directPrisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [
        { role: 'TENANT_ADMIN' },
        { role: 'AREA_MANAGER', module: module as ModuleName },
      ],
    },
    select: { id: true },
  })
  return users.map((u) => u.id)
}

/** Crea notificaciones in-app para los usuarios dados. */
async function createOcrNotifications(params: {
  tenantId: string
  userIds:  string[]
  module:   'NIRA' | 'ARI'
  type:     string
  title:    string
  message:  string
  link:     string
}): Promise<void> {
  if (!params.userIds.length) return
  await directPrisma.notification.createMany({
    data: params.userIds.map((userId) => ({
      tenantId: params.tenantId,
      userId,
      module:   params.module as ModuleName,
      type:     params.type,
      title:    params.title,
      message:  params.message,
      link:     params.link,
      isRead:   false,
    })),
  })
}

/** Crea borrador de OC en NIRA a partir del resultado OCR. */
async function createNiraDraftFromOcr(params: {
  tenantId:       string
  ocrResult:      OrderExtraction
  conversationId: string | null
  jobId:          string | undefined
}): Promise<void> {
  const { tenantId, ocrResult, conversationId, jobId } = params

  try {
    // Buscar proveedor por nombre o NIT
    let supplierId: string | null = null
    if (ocrResult.supplier?.value) {
      const search = ocrResult.supplier.value.toLowerCase()
      const nit    = (ocrResult.supplierNit?.value ?? '').replace(/[^0-9]/g, '')
      const sup = await directPrisma.supplier.findFirst({
        where: {
          tenantId,
          isActive: true,
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            ...(nit ? [{ taxId: { contains: nit } }] : []),
          ],
        },
        select: { id: true },
      })
      supplierId = sup?.id ?? null
    }

    const userIds = await findUsersToNotify(tenantId, 'NIRA')

    if (!supplierId) {
      console.info(JSON.stringify({ event: 'worker_ocr_nira_supplier_not_found', jobId, tenantId, supplier: ocrResult.supplier?.value }))
      await createOcrNotifications({
        tenantId, userIds, module: 'NIRA', type: 'OCR_DRAFT_PENDING',
        title:   'Imagen OCR: proveedor no encontrado',
        message: `Se recibió una imagen de proveedor "${ocrResult.supplier?.value ?? 'desconocido'}" pero no existe en el catálogo. Crea la OC manualmente.`,
        link:    '/nira/purchase-orders',
      })
      return
    }

    // Encontrar usuario creador
    const creatorUser = await directPrisma.user.findFirst({
      where: {
        tenantId, isActive: true,
        OR: [{ role: 'AREA_MANAGER', module: 'NIRA' as ModuleName }, { role: 'TENANT_ADMIN' }],
      },
      orderBy: { role: 'asc' },
      select:  { id: true },
    })
    if (!creatorUser) return

    // Hacer match de ítems OCR contra catálogo KIRA
    const matchedItems: { productId: string; quantityOrdered: number; unitCost: number }[] = []
    const unmatchedDesc: string[] = []

    for (const item of ocrResult.items) {
      const desc = item.description?.value?.trim() ?? ''
      if (!desc) continue
      const product = await directPrisma.product.findFirst({
        where:  { tenantId, isActive: true, name: { contains: desc, mode: 'insensitive' } },
        select: { id: true, costPrice: true },
      })
      if (product) {
        matchedItems.push({
          productId:       product.id,
          quantityOrdered: item.quantity?.value || 1,
          unitCost:        item.unitPrice?.value || Number(product.costPrice ?? 0),
        })
      } else {
        unmatchedDesc.push(`${desc} (cant: ${item.quantity?.value || 1}, precio: ${item.unitPrice?.value || 0})`)
      }
    }

    if (matchedItems.length === 0) {
      console.info(JSON.stringify({ event: 'worker_ocr_nira_no_products_matched', jobId, tenantId }))
      await createOcrNotifications({
        tenantId, userIds, module: 'NIRA', type: 'OCR_DRAFT_PENDING',
        title:   'Imagen OCR: sin productos reconocidos',
        message: 'Se recibió una imagen de proveedor pero ningún producto coincidió con el catálogo KIRA. Crea la OC manualmente.',
        link:    '/nira/purchase-orders',
      })
      return
    }

    const subtotal     = matchedItems.reduce((s, i) => s + i.quantityOrdered * i.unitCost, 0)
    const orderNumber  = await generatePoNumber(tenantId)
    const notesLines   = [
      ocrResult.notes?.value,
      unmatchedDesc.length ? `Ítems sin coincidir (verificar): ${unmatchedDesc.join('; ')}` : null,
    ].filter(Boolean).join('\n')

    const po = await directPrisma.purchaseOrder.create({
      data: {
        tenantId,
        supplierId,
        createdBy:  creatorUser.id,
        orderNumber,
        status:     'draft',
        subtotal,
        tax:        0,
        total:      subtotal,
        notes:      notesLines || null,
        items: {
          create: matchedItems.map((i) => ({
            productId:       i.productId,
            quantityOrdered: i.quantityOrdered,
            unitCost:        i.unitCost,
            total:           i.quantityOrdered * i.unitCost,
          })),
        },
      },
      select: { id: true, orderNumber: true },
    })

    console.info(JSON.stringify({
      event: 'worker_ocr_nira_draft_created', jobId, tenantId,
      poId: po.id, orderNumber: po.orderNumber,
      matched: matchedItems.length, unmatched: unmatchedDesc.length,
    }))

    await createOcrNotifications({
      tenantId, userIds, module: 'NIRA', type: 'OCR_DRAFT_CREATED',
      title:   `Borrador OC creado: ${po.orderNumber}`,
      message: `El agente creó un borrador de OC a partir de una imagen. ${unmatchedDesc.length ? `${unmatchedDesc.length} ítem(s) sin coincidir — revisa las notas.` : 'Revisa y confirma los datos.'}`,
      link:    `/nira/purchase-orders/${po.id}`,
    })

    if (conversationId) {
      await saveConversationMessage({
        conversationId, tenantId, direction: 'outbound', isFromAgent: true,
        content:     `✓ Borrador de OC creado: ${po.orderNumber}. Revisa y confirma en NIRA.`,
        messageType: 'system', timestamp: new Date(),
      }).catch(() => null)
    }
  } catch (err) {
    console.error(JSON.stringify({ event: 'worker_ocr_nira_draft_failed', jobId, tenantId, error: String(err) }))
  }
}

/** Crea borrador de cotización en ARI a partir del resultado OCR. */
async function createAriDraftFromOcr(params: {
  tenantId:       string
  ocrResult:      QuoteExtraction
  conversationId: string | null
  jobId:          string | undefined
}): Promise<void> {
  const { tenantId, ocrResult, conversationId, jobId } = params

  try {
    // Buscar cliente por nombre o empresa
    let clientId: string | null = null
    if (ocrResult.client?.value) {
      const search = ocrResult.client.value.toLowerCase()
      const cli = await directPrisma.client.findFirst({
        where: {
          tenantId,
          OR: [
            { name:    { contains: search, mode: 'insensitive' } },
            { company: { contains: search, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      })
      clientId = cli?.id ?? null
    }

    const userIds = await findUsersToNotify(tenantId, 'ARI')

    if (!clientId) {
      await createOcrNotifications({
        tenantId, userIds, module: 'ARI', type: 'OCR_DRAFT_PENDING',
        title:   'Imagen OCR: cliente no encontrado',
        message: `Se recibió una imagen con datos de cotización del cliente "${ocrResult.client?.value ?? 'desconocido'}" pero no existe en el catálogo. Crea la cotización manualmente.`,
        link:    '/ari/quotes',
      })
      return
    }

    const creatorUser = await directPrisma.user.findFirst({
      where: {
        tenantId, isActive: true,
        OR: [{ role: 'AREA_MANAGER', module: 'ARI' as ModuleName }, { role: 'TENANT_ADMIN' }],
      },
      orderBy: { role: 'asc' },
      select:  { id: true },
    })
    if (!creatorUser) return

    if (ocrResult.items.length === 0) {
      await createOcrNotifications({
        tenantId, userIds, module: 'ARI', type: 'OCR_DRAFT_PENDING',
        title:   'Imagen OCR: sin ítems detectados',
        message: 'Se recibió una imagen de cotización pero no se detectaron ítems. Crea la cotización manualmente.',
        link:    '/ari/quotes',
      })
      return
    }

    const items = ocrResult.items.map((item) => {
      const qty   = item.quantity?.value || 1
      const price = item.unitPrice?.value || 0
      const disc  = item.discount?.value || 0
      return {
        productId:   null as string | null,
        description: item.description?.value || '(sin descripción)',
        quantity:    qty,
        unitPrice:   price,
        discountPct: disc,
        total:       qty * price * (1 - disc / 100),
      }
    })

    const subtotal    = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const discount    = items.reduce((s, i) => s + i.quantity * i.unitPrice * (i.discountPct / 100), 0)
    const taxable     = subtotal - discount
    const quoteNumber = await generateQuoteNumber(tenantId)

    const quote = await directPrisma.quote.create({
      data: {
        tenantId,
        clientId,
        createdBy:  creatorUser.id,
        quoteNumber,
        status:     'draft',
        subtotal,
        discount,
        tax:        0,
        total:      taxable,
        notes:      ocrResult.notes?.value ?? null,
        items: { create: items },
      },
      select: { id: true, quoteNumber: true },
    })

    console.info(JSON.stringify({ event: 'worker_ocr_ari_draft_created', jobId, tenantId, quoteId: quote.id, quoteNumber: quote.quoteNumber }))

    await createOcrNotifications({
      tenantId, userIds, module: 'ARI', type: 'OCR_DRAFT_CREATED',
      title:   `Borrador de cotización creado: ${quote.quoteNumber}`,
      message: 'El agente creó un borrador de cotización a partir de una imagen. Revisa y confirma los datos.',
      link:    `/ari/quotes`,
    })

    if (conversationId) {
      await saveConversationMessage({
        conversationId, tenantId, direction: 'outbound', isFromAgent: true,
        content:     `✓ Borrador de cotización creado: ${quote.quoteNumber}. Revisa y confirma en ARI.`,
        messageType: 'system', timestamp: new Date(),
      }).catch(() => null)
    }
  } catch (err) {
    console.error(JSON.stringify({ event: 'worker_ocr_ari_draft_failed', jobId, tenantId, error: String(err) }))
  }
}

/**
 * Orquesta OCR + creación de borrador para un adjunto de imagen/PDF.
 * Fire-and-forget: todos los errores son capturados internamente.
 */
async function processOcrAndCreateDraft(params: {
  tenantId:       string
  module:         AgentModule
  fileBuffer:     Buffer
  mimeType:       string
  fileName:       string
  conversationId: string | null
  jobId:          string | undefined
}): Promise<void> {
  const { tenantId, module, fileBuffer, mimeType, fileName, conversationId, jobId } = params

  if (module !== 'NIRA' && module !== 'ARI') return

  // Registrar imagen en la conversación
  if (conversationId) {
    await saveConversationMessage({
      conversationId, tenantId, direction: 'inbound', isFromAgent: false,
      content: `[Imagen procesada por OCR: ${fileName}]`, messageType: 'image', timestamp: new Date(),
    }).catch(() => null)
  }

  const docType = module === 'NIRA' ? 'order' : 'quote'
  const t0      = Date.now()
  let ocrResult: Awaited<ReturnType<typeof extractDocument>>

  try {
    ocrResult = await extractDocument({ fileBuffer, mimeType, fileName, docType, tenantId })
  } catch (err) {
    console.error(JSON.stringify({ event: 'worker_ocr_failed', jobId, tenantId, module, error: String(err) }))
    if (conversationId) {
      await saveConversationMessage({
        conversationId, tenantId, direction: 'outbound', isFromAgent: true,
        content: 'No fue posible procesar el documento adjunto. El equipo lo revisará manualmente.',
        messageType: 'system', timestamp: new Date(),
      }).catch(() => null)
    }
    return
  }

  console.info(JSON.stringify({
    event: 'worker_ocr_done', jobId, tenantId, module, docType: ocrResult.documentType,
    items: ocrResult.items.length, durationMs: Date.now() - t0,
  }))

  if (module === 'NIRA' && ocrResult.documentType === 'order') {
    await createNiraDraftFromOcr({ tenantId, ocrResult, conversationId, jobId })
  } else if (module === 'ARI' && ocrResult.documentType === 'quote') {
    await createAriDraftFromOcr({ tenantId, ocrResult, conversationId, jobId })
  }
}

// ─── Procesador ───────────────────────────────────────────────────────────────

async function processIncomingMessage(job: Job<IncomingMessageJob>): Promise<void> {
  const { canal } = job.data

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  if (canal === 'whatsapp') {
    const d = job.data

    console.info(JSON.stringify({
      event:    'worker_whatsapp_received',
      jobId:    job.id,
      tenantId: d.tenantId,
      from:     d.from,
      content:  d.content,
    }))

    // Resolver módulo antes de FindOrCreate para asignarlo a la conversación
    const module = await resolveExternalModule(d.tenantId, d.integrationId)

    // ── Conversación: FindOrCreate (no bloquea el flujo si falla) ──────────
    let conversationId: string | null = null
    try {
      conversationId = await findOrCreateConversation({
        tenantId:         d.tenantId,
        channel:          'WHATSAPP',
        senderIdentifier: d.from,
        relatedModule:    module,
      })
    } catch (err) {
      console.error(JSON.stringify({
        event:    'worker_conversation_upsert_failed',
        jobId:    job.id,
        tenantId: d.tenantId,
        error:    String(err),
      }))
    }

    // Memoria del agente (HU-186): historial previo de la conversación, cargado ANTES de guardar el
    // mensaje actual para que no se duplique en el contexto.
    const history = conversationId ? await loadConversationHistory(conversationId, d.tenantId) : []

    // ── Obtener el token del canal ANTES del candado de dedup (HU-182) ─────────
    // Si la integración no existe, se lanza AQUÍ, antes de "consumir" el mensaje con el candado de
    // dedup, para que el reintento lo reprocese y NO quede sin respuesta. NO se filtra por isActive:
    // un canal marcado caído transitoriamente igual debe intentar responder; si el token está
    // vencido, el envío falla y se marca caído (sin relanzar) — pero el agente ya respondió.
    const integration = await directPrisma.integration.findFirst({
      where:  { id: d.integrationId, tenantId: d.tenantId, channel: 'WHATSAPP' },
      select: { tokenEncrypted: true, status: true, identifier: true },
    })
    if (!integration?.tokenEncrypted) {
      throw new Error(`No hay integración de WhatsApp — tenant: ${d.tenantId}`)
    }
    const accessToken = decrypt(integration.tokenEncrypted)

    // ── Guardar mensaje entrante (inbound) — actúa como candado de dedup (HU-181) ──────
    const msgTimestamp = new Date(Number(d.timestamp) * 1000)
    let inboundIsNew = true
    if (conversationId) {
      try {
        inboundIsNew = await saveConversationMessage({
          conversationId,
          tenantId:          d.tenantId,
          direction:         'inbound',
          content:           d.content,
          messageType:       'text',
          isFromAgent:       false,
          externalMessageId: d.messageId,
          timestamp:         isNaN(msgTimestamp.getTime()) ? new Date() : msgTimestamp,
        })
      } catch (err) {
        console.error(JSON.stringify({
          event:    'worker_inbound_save_failed',
          jobId:    job.id,
          tenantId: d.tenantId,
          error:    String(err),
        }))
      }
    }

    // HU-181 — un mensaje = una respuesta. Si el inbound ya estaba registrado (mismo wamid ya
    // procesado), este mensaje ya se atendió: no se corre el agente ni se responde de nuevo.
    if (conversationId && !inboundIsNew) {
      console.info(JSON.stringify({
        event: 'worker_duplicate_skipped', channel: 'whatsapp', jobId: job.id,
        tenantId: d.tenantId, messageId: d.messageId,
      }))
      return
    }

    // ── Procesar imagen adjunta (adicional al texto, fire-and-forget) ─────────
    if (d.mediaId) {
      void (async () => {
        try {
          const media = await downloadWhatsAppMedia(d.mediaId!, accessToken)
          if (media) {
            await processOcrAndCreateDraft({
              tenantId:       d.tenantId,
              module,
              fileBuffer:     media.buffer,
              mimeType:       media.mimeType,
              fileName:       d.mediaFileName ?? 'imagen-whatsapp',
              conversationId,
              jobId:          job.id,
            })
          }
        } catch (err) {
          console.error(JSON.stringify({
            event: 'worker_wa_media_download_failed', jobId: job.id,
            tenantId: d.tenantId, error: String(err),
          }))
        }
      })()
    }

    // Si el mensaje es solo imagen (sin texto), enviar acuse y no invocar el agente
    if (!d.content && d.mediaId) {
      const ackMsg = 'Recibí tu imagen y la estoy procesando. Recibirás una notificación cuando el borrador esté listo.'
      await sendWhatsAppReply(d.phoneNumberId, d.from, ackMsg, accessToken)
      if (conversationId) {
        await saveConversationMessage({
          conversationId, tenantId: d.tenantId, direction: 'outbound', isFromAgent: true,
          content: ackMsg, timestamp: new Date(),
        }).catch(() => null)
      }
      return
    }

    // Invocar AgentRunner (para el contenido de texto) — con memoria de la conversación (HU-186)
    const result = await runAgent({
      tenantId:      d.tenantId,
      module,
      channel:       'whatsapp',
      message:       d.content,
      senderId:      d.from,
      integrationId: d.integrationId,
      history,
    })

    console.info(JSON.stringify({
      event:       'worker_whatsapp_agent_done',
      jobId:       job.id,
      tenantId:    d.tenantId,
      turns:       result.turnCount,
      toolsUsed:   result.toolsUsed,
      hitMaxTurns: result.hitMaxTurns,
      durationMs:  result.durationMs,
    }))

    // ── Guardar respuesta del agente (outbound, no bloquea si falla) ───────
    if (conversationId) {
      try {
        await saveConversationMessage({
          conversationId,
          tenantId:    d.tenantId,
          direction:   'outbound',
          content:     result.reply,
          isFromAgent: true,
          timestamp:   new Date(),
        })
        if (result.hitMaxTurns) {
          await saveConversationMessage({
            conversationId,
            tenantId:    d.tenantId,
            direction:   'outbound',
            content:     'El agente alcanzó el límite de procesamiento. Esta conversación requiere atención humana.',
            messageType: 'system',
            isFromAgent: true,
            timestamp:   new Date(),
          })
        }
      } catch (err) {
        console.error(JSON.stringify({
          event:    'worker_outbound_save_failed',
          jobId:    job.id,
          tenantId: d.tenantId,
          error:    String(err),
        }))
      }
    }

    // Enviar respuesta al remitente. Si Meta rechaza el envío (token vencido, canal caído…),
    // marcamos el canal como CAÍDO y notificamos a plataforma+cliente — SIN relanzar el error
    // (así el job no se reintenta 3 veces re-ejecutando al agente y duplicando respuestas).
    try {
      await sendWhatsAppReply(d.phoneNumberId, d.from, result.reply, accessToken)

      // HU-188: si el canal estaba marcado caído (flag por un bache transitorio) pero acaba de enviar
      // con éxito, se AUTO-RECUPERA el estado → el usuario no tiene que darle "Verificar".
      if (integration.status !== 'connected') {
        await markIntegrationHealthy({ id: d.integrationId, tenantId: d.tenantId, channel: 'WHATSAPP', identifier: integration.identifier ?? d.phoneNumberId }).catch(() => {})
      }

      // Marcar conversación como replied si el agente respondió sin fallback
      if (conversationId && !result.hitMaxTurns) {
        directPrisma.conversation.update({
          where: { id: conversationId },
          data:  { status: 'replied' },
        }).catch((err: unknown) => {
          console.error(JSON.stringify({ event: 'worker_status_update_failed', error: String(err) }))
        })
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error(JSON.stringify({ event: 'worker_whatsapp_send_failed', tenantId: d.tenantId, integrationId: d.integrationId, detail }))
      await markIntegrationDown(
        { id: d.integrationId, tenantId: d.tenantId, channel: 'WHATSAPP', identifier: d.phoneNumberId },
        `Fallo al enviar por WhatsApp: ${detail}`,
      ).catch(() => {})
    }

  // ── Gmail ─────────────────────────────────────────────────────────────────
  } else if (canal === 'gmail') {
    const d = job.data

    // NO se filtra por isActive (HU-182): un canal marcado caído transitoriamente igual debe
    // intentar responder; el fetch va antes del bucle, así un fallo aquí no consume ningún mensaje.
    const integration = await directPrisma.integration.findFirst({
      where:  { id: d.integrationId, tenantId: d.tenantId, channel: 'GMAIL' },
      select: { tokenEncrypted: true, identifier: true, metadata: true, status: true },
    })

    if (!integration?.tokenEncrypted) {
      throw new Error(`No hay integración de Gmail — tenant: ${d.tenantId}`)
    }

    const refreshToken = decrypt(integration.tokenEncrypted)
    const oauthClient  = new google.auth.OAuth2(
      process.env['GOOGLE_CLIENT_ID'],
      process.env['GOOGLE_CLIENT_SECRET'],
    )
    oauthClient.setCredentials({ refresh_token: refreshToken })

    const gmail = google.gmail({ version: 'v1', auth: oauthClient })

    // Las notificaciones push de Gmail traen el historyId MÁS RECIENTE. Para obtener los cambios
    // hay que listar DESDE el último historyId procesado (guardado en metadata), NO desde el de la
    // notificación (que devolvería vacío: history.list retorna cambios POSTERIORES al startHistoryId).
    // Tras procesar, se avanza el historyId guardado para no reprocesar ni perder correos.
    const meta      = (integration.metadata ?? {}) as Record<string, unknown>
    const storedHid = typeof meta['historyId'] === 'string' ? (meta['historyId'] as string) : null
    const startHid  = storedHid ?? d.historyId

    const advanceHistoryId = async (to: string): Promise<void> => {
      await directPrisma.integration.update({
        where: { id: d.integrationId },
        data:  { metadata: { ...meta, historyId: to } },
      }).catch((e) => console.error('[worker gmail] avanzar historyId:', e))
    }

    const { data: historyData } = await gmail.users.history.list({
      userId:         'me',
      startHistoryId: startHid,
      historyTypes:   ['messageAdded'],
      labelId:        'INBOX',
    })

    const historyRecords = historyData.history ?? []
    const latestHid      = String(historyData.historyId ?? d.historyId)

    if (historyRecords.length === 0) {
      console.info(JSON.stringify({
        event:    'worker_gmail_no_new_messages',
        jobId:    job.id,
        tenantId: d.tenantId,
        startHid,
      }))
      await advanceHistoryId(latestHid)
      return
    }

    for (const record of historyRecords) {
      for (const added of record.messagesAdded ?? []) {
        const messageId = added.message?.id
        if (!messageId) continue

        const { data: fullMsg } = await gmail.users.messages.get({
          userId: 'me',
          id:     messageId,
          format: 'full',
        })

        const headers   = fullMsg.payload?.headers ?? []
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

        const from      = getHeader('From')
        const subject   = getHeader('Subject')
        const snippet   = fullMsg.snippet ?? ''
        const origMsgId = getHeader('Message-ID')
        const threadId  = fullMsg.threadId ?? ''

        // ── REGLA DURA HU-184 — nunca procesar un correo PROPIO (evita el bucle de auto-respuesta) ──
        // El agente envía la respuesta desde la propia cuenta; ese correo saliente reaparece en el
        // historial. Se ignora por completo (no se guarda, no dispara al agente, no responde) si tiene
        // etiqueta SENT/DRAFT o el remitente es la cuenta conectada. SENT cubre cualquier alias de envío.
        if (isOwnGmailMessage({ from, labelIds: fullMsg.labelIds, ownEmail: integration.identifier ?? '' })) {
          console.info(JSON.stringify({
            event: 'worker_gmail_self_skip', jobId: job.id, tenantId: d.tenantId, from: extractEmailAddress(from),
          }))
          continue
        }

        console.info(JSON.stringify({
          event:    'worker_gmail_message_received',
          jobId:    job.id,
          tenantId: d.tenantId,
          from,
          subject,
        }))

        // Invocar AgentRunner con el contenido del email
        const emailMessage = `Asunto: ${subject}\nDe: ${from}\n\n${snippet}`
        const module       = await resolveExternalModule(d.tenantId, d.integrationId)

        // ── Conversación: FindOrCreate (no bloquea el flujo si falla) ────
        const senderEmail = extractEmailAddress(from)
        const senderName  = extractSenderName(from)

        let conversationId: string | null = null
        try {
          conversationId = await findOrCreateConversation({
            tenantId:         d.tenantId,
            channel:          'GMAIL',
            senderIdentifier: senderEmail,
            senderName,
            relatedModule:    module,
          })
        } catch (err) {
          console.error(JSON.stringify({
            event:    'worker_conversation_upsert_failed',
            jobId:    job.id,
            tenantId: d.tenantId,
            error:    String(err),
          }))
        }

        // Memoria del agente (HU-186): historial previo, ANTES de guardar el mensaje actual.
        const history = conversationId ? await loadConversationHistory(conversationId, d.tenantId) : []

        // ── Guardar mensaje entrante (inbound) — actúa como candado de dedup ──────
        let inboundIsNew = true
        if (conversationId) {
          try {
            inboundIsNew = await saveConversationMessage({
              conversationId,
              tenantId:          d.tenantId,
              direction:         'inbound',
              content:           emailMessage,
              messageType:       'text',
              isFromAgent:       false,
              externalMessageId: messageId,
              timestamp:         new Date(),
            })
          } catch (err) {
            console.error(JSON.stringify({
              event:    'worker_inbound_save_failed',
              jobId:    job.id,
              tenantId: d.tenantId,
              error:    String(err),
            }))
          }
        }

        // HU-181 — un mensaje = una respuesta. Gmail puede entregar varias notificaciones (distinto
        // historyId) cuyos rangos de history.list se solapan y devuelven el MISMO correo. Si este
        // messageId ya se registró, no se corre el agente ni se responde otra vez.
        if (conversationId && !inboundIsNew) {
          console.info(JSON.stringify({
            event: 'worker_duplicate_skipped', channel: 'gmail', jobId: job.id,
            tenantId: d.tenantId, messageId,
          }))
          continue
        }

        // ── Salvaguarda anti-bucle (HU-184, 2ª capa) ──────────────────────────
        // Si en esta conversación ya se enviaron demasiadas respuestas del agente en una ventana
        // corta, se corta (no se responde) para frenar cualquier realimentación que escape al filtro.
        if (conversationId) {
          const recentReplies = await directPrisma.conversationMessage.count({
            where: {
              conversationId, direction: 'outbound', isFromAgent: true,
              createdAt: { gte: new Date(Date.now() - GMAIL_LOOP_WINDOW_MS) },
            },
          })
          if (recentReplies >= GMAIL_LOOP_MAX_REPLIES) {
            console.warn(JSON.stringify({
              event: 'worker_gmail_loop_guard_tripped', jobId: job.id, tenantId: d.tenantId,
              conversationId, recentReplies,
            }))
            continue
          }
        }

        const result = await runAgent({
          tenantId:      d.tenantId,
          module,
          channel:       'gmail',
          message:       emailMessage,
          senderId:      from,
          integrationId: d.integrationId,
          history,
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

        // ── Guardar respuesta del agente (outbound, no bloquea si falla) ─
        if (conversationId) {
          try {
            await saveConversationMessage({
              conversationId,
              tenantId:    d.tenantId,
              direction:   'outbound',
              content:     result.reply,
              isFromAgent: true,
              timestamp:   new Date(),
            })
            if (result.hitMaxTurns) {
              await saveConversationMessage({
                conversationId,
                tenantId:    d.tenantId,
                direction:   'outbound',
                content:     'El agente alcanzó el límite de procesamiento. Esta conversación requiere atención humana.',
                messageType: 'system',
                isFromAgent: true,
                timestamp:   new Date(),
              })
            }
          } catch (err) {
            console.error(JSON.stringify({
              event:    'worker_outbound_save_failed',
              jobId:    job.id,
              tenantId: d.tenantId,
              error:    String(err),
            }))
          }
        }

        // ── Procesar adjunto Gmail (fire-and-forget, adicional al texto) ────
        const msgParts = fullMsg.payload?.parts ?? []
        if (msgParts.length > 0) {
          const capConvIdOcr    = conversationId
          const capModuleOcr    = module
          const capTenantIdOcr  = d.tenantId
          const capJobIdOcr     = job.id
          void (async () => {
            try {
              const attachment = await downloadGmailAttachment(gmail, messageId, msgParts)
              if (attachment) {
                await processOcrAndCreateDraft({
                  tenantId:       capTenantIdOcr,
                  module:         capModuleOcr,
                  fileBuffer:     attachment.buffer,
                  mimeType:       attachment.mimeType,
                  fileName:       attachment.filename,
                  conversationId: capConvIdOcr,
                  jobId:          capJobIdOcr,
                })
              }
            } catch (err) {
              console.error(JSON.stringify({
                event: 'worker_gmail_attachment_failed', jobId: job.id,
                tenantId: d.tenantId, error: String(err),
              }))
            }
          })()
        }

        // ── Envío automático por Gmail (fire-and-forget) ─────────────────
        // Solo se envía cuando el agente resuelve la solicitud (no fallback).
        if (!result.hitMaxTurns) {
          const fromEmail    = integration.identifier ?? ''
          const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`
          const capConvId    = conversationId

          void (async () => {
            try {
              const rawEmail = [
                `From: ${fromEmail}`,
                `To: ${senderEmail}`,
                `Subject: ${replySubject}`,
                ...(origMsgId
                  ? [`In-Reply-To: ${origMsgId}`, `References: ${origMsgId}`]
                  : []),
                'Content-Type: text/plain; charset=utf-8',
                'MIME-Version: 1.0',
                '',
                result.reply,
              ].join('\r\n')

              const encoded = Buffer.from(rawEmail)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '')

              await gmail.users.messages.send({
                userId:      'me',
                requestBody: { raw: encoded, threadId },
              })

              console.info(JSON.stringify({
                event:    'worker_gmail_reply_sent',
                jobId:    job.id,
                tenantId: d.tenantId,
                threadId,
              }))

              // HU-188: envío exitoso → auto-recuperar el flag si estaba caído (sin "Verificar").
              if (integration.status !== 'connected') {
                await markIntegrationHealthy({ id: d.integrationId, tenantId: d.tenantId, channel: 'GMAIL', identifier: integration.identifier ?? '' }).catch(() => {})
              }

              if (capConvId) {
                await directPrisma.conversation.update({
                  where: { id: capConvId },
                  data:  { status: 'replied' },
                })
              }
            } catch (err) {
              const detail = String((err as { message?: string })?.message ?? err)
              console.error(JSON.stringify({
                event:    'worker_gmail_reply_failed',
                jobId:    job.id,
                tenantId: d.tenantId,
                error:    detail,
              }))
              // HU-182 — el envío ya NO falla en silencio: si es un problema de scope/permiso/token
              // (p. ej. falta gmail.send), se marca el canal caído (alerta a SUPER_ADMIN + cliente)
              // para que se reconecte. Un fallo transitorio de red no dispara la alerta.
              if (/insufficient|scope|permission|invalid_grant|unauthorized|forbidden|\b401\b|\b403\b/i.test(detail)) {
                await markIntegrationDown(
                  { id: d.integrationId, tenantId: d.tenantId, channel: 'GMAIL', identifier: integration.identifier ?? '' },
                  `No se pudo enviar la respuesta por Gmail: ${detail.slice(0, 300)}`,
                ).catch(() => {})
              }
            }
          })()
        } else {
          console.info(JSON.stringify({
            event:    'worker_gmail_fallback_no_reply',
            jobId:    job.id,
            tenantId: d.tenantId,
          }))
        }
      }
    }

    // Avanzar el historyId guardado al último visto — evita reprocesar y deja el baseline listo
    // para la próxima notificación (patrón recomendado por la doc de Gmail push).
    await advanceHistoryId(latestHid)
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
