import Anthropic from '@anthropic-ai/sdk'
import { directPrisma } from '../../lib/prisma'

// HU-213/214 — El SDK gestiona el backoff de rate limit (429/529) respetando Retry-After. PERO ojo
// (HU-214): `timeout` acota cada request HTTP INDIVIDUAL, NO la espera de backoff entre reintentos.
// Con muchos reintentos y un Retry-After alto, un ítem podía "dormir" varios minutos reteniendo su
// slot. Por eso: (a) `maxRetries` BAJO (2) para acotar el backoff total, y (b) un tope de tiempo
// TOTAL por llamada vía AbortController (ver withHardTimeout) que corta pase lo que pase. Configurable.
const client = new Anthropic({
  apiKey:     process.env['ANTHROPIC_API_KEY'],
  maxRetries: Math.max(0, Number(process.env['OCR_MAX_RETRIES'] ?? 2)),
  timeout:    Math.max(10_000, Number(process.env['OCR_TIMEOUT_MS'] ?? 60_000)),
})

// HU-214 — Tope de tiempo TOTAL por llamada al OCR (incluye reintentos y esperas de backoff del SDK).
// Aborta con AbortController: el SDK deja de reintentar y libera el request, de modo que el slot de
// concurrencia del worker SIEMPRE se libera y el lote nunca queda colgado sin fin. Configurable.
const OCR_TOTAL_TIMEOUT_MS = Math.max(20_000, Number(process.env['OCR_TOTAL_TIMEOUT_MS'] ?? 90_000))

// Usar Sonnet para OCR: más rápido y con excelente visión, reservamos Opus para el agente
const OCR_MODEL = process.env['OCR_MODEL'] ?? 'claude-sonnet-4-6'

// HU-195 — Modelo del OCR de FACTURAS del registro rápido: Sonnet por defecto. Haiku (HU-191/192)
// leía mal facturas POS reales (mezclaba el NIT con el nombre del emisor, perdía el prefijo
// alfanumérico del número de factura, confundía dígitos). El OCR es de baja frecuencia y la exactitud
// importa más que el céntimo; nunca Opus. Configurable por env (OCR_INVOICE_MODEL) para bajar el costo.
export const INVOICE_OCR_MODEL = process.env['OCR_INVOICE_MODEL'] ?? 'claude-sonnet-4-6'

// ─── Tipos de respuesta ───────────────────────────────────────────────────────

export type DocumentType = 'quote' | 'order'
export type Confidence   = 'high' | 'medium' | 'low'

export interface FieldValue<T = string> {
  value:      T
  // HU-215 — opcional en la RESPUESTA del modelo (se omite cuando es "high" para acortar la salida y
  // acelerar la lectura); tras el parseo se normaliza a "high" por defecto, así los consumidores
  // siempre reciben un valor válido. Ver normalizeConfidence().
  confidence?: Confidence
}

export interface LineItem {
  description: FieldValue | null
  quantity:    FieldValue<number> | null
  unitPrice:   FieldValue<number> | null
  discount:    FieldValue<number> | null
  productId?:  string | null
}

/** HU-193-B — dato adicional presente en la factura que NO tiene campo propio (nada se pierde). */
export interface ExtraField {
  label: string
  value: string
}

interface BaseExtraction {
  canRead:            boolean
  readabilityIssues:  string | null
  confidence:         Confidence
  // HU-195 — número/código de la factura (compras y ventas). Campo dedicado, editable y visible.
  invoiceNumber:      FieldValue | null
  date:               FieldValue | null
  items:              LineItem[]
  total:              FieldValue<number> | null
  notes:              FieldValue | null
  unrecognizedItems?: string[]
  // HU-193-B — TODA la demás información presente en la factura (número de factura, vendedor, cliente
  // y su NIT/CC, forma de pago, subtotal, impuestos/IVA, puntos, resolución DIAN, dirección, etc.).
  additionalFields?:  ExtraField[]
}

export interface QuoteExtraction extends BaseExtraction {
  documentType: 'quote'
  client:       FieldValue | null
  // HU-194-B — paridad con supplierNit de compra: NIT/CC del cliente para el campo dedicado de venta.
  clientNit:    FieldValue | null
}

export interface OrderExtraction extends BaseExtraction {
  documentType: 'order'
  supplier:     FieldValue | null
  supplierNit:  FieldValue | null
  paymentTerms: FieldValue | null
  supplierId?:  string | null
}

export type ExtractionResult = QuoteExtraction | OrderExtraction

// ─── Prompt OCR ───────────────────────────────────────────────────────────────

function buildPrompt(docType: DocumentType | null): string {
  const typeInstruction = docType
    ? `El tipo de documento es: **${docType === 'quote' ? 'cotización de cliente / ventas (quote)' : 'orden de compra o cotización de proveedor (order)'}**`
    : 'Detecta el tipo de documento automáticamente. Si es una cotización o propuesta para un cliente usa "quote". Si es una orden de compra, cotización de proveedor o factura de proveedor usa "order".'

  return `Eres un experto en extracción de datos de documentos comerciales latinoamericanos (facturas, cotizaciones, órdenes de compra, listas de precios). Tu tarea es leer TODOS los valores numéricos que aparecen en el documento, incluyendo precios unitarios, cantidades y totales.

${typeInstruction}

ANTES de generar el JSON, analiza visualmente el documento completo:
1. Identifica las columnas o secciones donde aparecen precios (pueden llamarse: Precio, Precio Unit., V. Unitario, Valor, Unit. Price, P. Unit, Vr. Unit., etc.)
2. Lee cada fila de ítems y extrae el valor numérico de la columna de precio unitario
3. Los precios en documentos colombianos suelen estar en formato: 12.500 o 12,500 o $12.500 — todos representan doce mil quinientos; conviértelos a número puro: 12500

Responde ÚNICAMENTE con un JSON válido, sin texto adicional ni marcadores de código, con esta estructura:

Para tipo "quote":
{
  "documentType": "quote",
  "canRead": true,
  "confidence": "high",
  "client":    { "value": "nombre del cliente o empresa" },
  "clientNit": { "value": "NIT o CC/identificación del cliente" },
  "invoiceNumber": { "value": "número o código de la factura" },
  "date": { "value": "YYYY-MM-DD" },
  "items": [
    { "description": { "value": "descripción del producto o servicio" }, "quantity": { "value": 2 }, "unitPrice": { "value": 45900.00 }, "discount": null }
  ],
  "total": { "value": 91800.00 },
  "notes": { "value": "condiciones o notas adicionales" }
}

Para tipo "order":
{
  "documentType": "order",
  "canRead": true,
  "confidence": "high",
  "supplier":     { "value": "nombre del proveedor" },
  "supplierNit":  { "value": "NIT o identificación tributaria" },
  "invoiceNumber": { "value": "número o código de la factura" },
  "date":         { "value": "YYYY-MM-DD" },
  "items": [
    { "description": { "value": "descripción del producto" }, "quantity": { "value": 3 }, "unitPrice": { "value": 12500.00 }, "discount": null }
  ],
  "total":        { "value": 37500.00 },
  "paymentTerms": { "value": "condiciones de pago" },
  "notes":        { "value": "notas adicionales" }
}

Reglas estrictas:
- Si no puedes leer el documento: pon "canRead": false y describe el problema en "readabilityIssues" con sugerencias concretas
- RESPUESTA CORTA (importante para la velocidad): cada campo es un objeto { "value": ... }. El atributo
  "confidence" es OPCIONAL y por defecto se asume "high": inclúyelo ("medium" o "low") SOLO cuando el dato
  sea dudoso o poco legible; si el dato es claro, OMITE "confidence" por completo. Emite un JSON compacto,
  sin espacios ni saltos de línea innecesarios.
- quantity, unitPrice, total y discount son SIEMPRE números JavaScript, nunca strings
- Los precios NO incluyen el símbolo de moneda en el JSON
- Separadores numéricos: en Colombia el punto es separador de miles y la coma es decimal. Ejemplo: "1.234,56" → 1234.56; "45.000" → 45000
- **NÚMERO DE FACTURA (invoiceNumber)**: extrae el número o código que identifica la factura. En facturas electrónicas colombianas (DIAN) suele ser el consecutivo con prefijo que acompaña a "Factura Electrónica de Venta", "Factura Nro.", "No.", "Nro", "Factura #", "Documento", "FE", "POS" o similar (ej: "GOZ5292464", "FE-1234", "FVE 001"). Cópialo EXACTAMENTE como aparece, respetando letras, dígitos y prefijos alfanuméricos: "GOZ5292464" se transcribe tal cual, NUNCA lo conviertas a solo dígitos ni le quites las letras. El prefijo (p. ej. "GOZ5") aparece cerca de la resolución DIAN ("Prefijo GOZ5") — únelo al consecutivo si van juntos en "Factura Electrónica de Venta". NO tomes el CUFE/CUDE, NI la resolución DIAN, NI el NIT. Si no aparece, usa null.
- **EMISOR/PROVEEDOR y NIT (campos separados)**: en "supplier"/"client" pon SOLO la razón social o nombre del negocio (ej: "D1 SAS"). NO incluyas ahí el NIT, ni el régimen o textos fiscales ("Gran contribuyente", "Agente retenedor de IVA", "Res.", teléfono, dirección). El NIT/identificación va SOLO en su campo dedicado ("supplierNit"/"clientNit"), como dígitos con su verificador (ej: "900276962-1"), sin el prefijo "NIT". Lee los dígitos con cuidado, sin agregar ni quitar ninguno.
- Fechas en formato YYYY-MM-DD; si solo hay mes/año usa YYYY-MM-01
- Si un campo opcional no aparece en el documento usa null directamente (no el objeto)
- Si no hay descuento usa null, no 0
- **PRECIOS — regla más importante**: Siempre extrae el precio real visible en el documento. NUNCA uses 0 como marcador. Si genuinamente no hay columna de precio visible para un ítem, devuelve unitPrice como null (el valor null directamente, no {"value": null}). Un 0 en la respuesta SOLO significa que el documento literalmente muestra "0" o "$0".
- **TOTAL DE LA FACTURA (total)** — regla dura: es el valor A PAGAR de la compra. Toma la cifra rotulada como "Total", "Total factura", "Total a pagar", "Valor total", "Total neto" o "Total COP". NUNCA tomes como total el dinero con que se pagó ni el cambio: IGNORA por completo "Efectivo", "Recibido", "Pago con", "Entregado", "Medios de pago", "Cambio", "Vueltas" o "Devuelta" (con frecuencia son MAYORES que el total y NO son el total). Cuando haya varias cifras, el total correcto es el que concuerda con subtotal + impuestos y con la suma de los ítems (cantidad × precio), no el efectivo entregado. Si dudas entre dos, prefiere la rotulada explícitamente como "Total factura"/"Total a pagar".
- PDFs de varias páginas: analiza solo la primera página

CAPTURA TOTAL (regla dura — nada se pierde): además de los campos de arriba, extrae TODA otra
información que aparezca en la factura y NO tenga un campo propio, en el arreglo "additionalFields"
como pares { "label": "...", "value": "..." }. Incluye (solo si aparecen, nunca inventes): cliente y
su NIT/CC/identificación, vendedor/cajero, forma de pago, subtotal, IVA/impuestos y su base,
descuentos, retenciones, puntos/fidelización, resolución DIAN y su rango, dirección,
teléfono/contacto, correo, moneda, términos, observaciones, etc. Usa el mismo
nombre/etiqueta que muestra la factura ("Vendedor", "CC", "Puntos"…). Si un dato YA está en un campo
propio (emisor, NIT del emisor, número de factura, fecha, total, ítems) NO lo repitas aquí. Si la
factura no trae datos adicionales, devuelve "additionalFields": [].
- HU-215 (salida corta): en additionalFields NO incluyas CUFE, CUDE, códigos QR, URLs, ni cadenas de más
  de ~50 caracteres (no aportan al registro contable y alargan la respuesta). Máximo ~12 pares.`
}

// ─── Prompt de matching semántico ─────────────────────────────────────────────

type CatalogEntry = { id: string; name: string; sku: string }

function buildMatchPrompt(
  descriptions: Array<{ index: number; description: string }>,
  products: CatalogEntry[],
): string {
  return `Analiza estas descripciones extraídas de un documento comercial y compáralas con el catálogo de productos.

Descripciones del documento:
${JSON.stringify(descriptions)}

Catálogo de productos (id, nombre, sku):
${JSON.stringify(products)}

Para cada descripción indica:
1. ¿Es un producto o servicio facturable? (isProduct: true/false). Marca false para texto no-producto: garantías, notas de envío, condiciones de pago, texto genérico.
2. Si isProduct es true, ¿cuál producto del catálogo coincide mejor? (productId: string o null si no hay coincidencia suficiente)

Responde ÚNICAMENTE con un JSON array:
[
  { "index": 0, "isProduct": true, "productId": "clxxx..." },
  { "index": 1, "isProduct": false, "productId": null }
]

Usa coincidencia semántica difusa: "Papel Bond A4" coincide con "Papel carta bond A4 75g". El productId debe ser exactamente el id del catálogo o null.`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * HU-215 — El modelo omite `confidence` cuando es "high" (respuesta más corta → lectura más rápida).
 * Aquí se rellena a "high" por defecto para que los consumidores (badges de OC, mapeo de facturas)
 * siempre reciban un valor válido. Defensivo: nunca lanza.
 */
function normalizeConfidence(parsed: ExtractionResult): void {
  const fix = (f: unknown): void => {
    if (f && typeof f === 'object' && 'value' in (f as Record<string, unknown>) && !(f as FieldValue).confidence) {
      (f as FieldValue).confidence = 'high'
    }
  }
  if (!parsed.confidence) parsed.confidence = 'high'
  const p = parsed as unknown as Record<string, unknown>
  for (const k of ['invoiceNumber', 'date', 'total', 'notes', 'client', 'clientNit', 'supplier', 'supplierNit', 'paymentTerms']) fix(p[k])
  if (Array.isArray(parsed.items)) {
    for (const it of parsed.items) { fix(it.description); fix(it.quantity); fix(it.unitPrice); fix(it.discount) }
  }
}

function resolveMediaType(mimeType: string, fileName: string): string {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType
  const ext = fileName.split('.').pop()?.toLowerCase()
  const MAP: Record<string, string> = {
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    png:  'image/png',
    webp: 'image/webp',
    pdf:  'application/pdf',
  }
  return MAP[ext ?? ''] ?? mimeType
}

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

// ─── extractDocument ──────────────────────────────────────────────────────────

export async function extractDocument(params: {
  fileBuffer: Buffer
  mimeType:   string
  fileName:   string
  docType:    DocumentType | null
  tenantId:   string
  /** Modelo por-llamada. El flujo de facturas pasa INVOICE_OCR_MODEL (Sonnet — HU-195, exactitud en
   *  facturas POS reales); OC/Cotización omiten → usan OCR_MODEL (Sonnet). Configurable por env. */
  model?:     string
}): Promise<ExtractionResult> {
  const { fileBuffer, fileName, docType } = params
  const mimeType = resolveMediaType(params.mimeType, fileName)
  const model    = params.model ?? OCR_MODEL

  if (!ALLOWED_TYPES.has(mimeType)) {
    throw {
      statusCode: 422,
      message:    `Formato de archivo no soportado: ${mimeType}. Usa JPG, PNG, WEBP o PDF.`,
      code:       'OCR_UNSUPPORTED_FORMAT',
    }
  }

  if (fileBuffer.length === 0) {
    throw {
      statusCode: 422,
      message:    'El archivo está vacío.',
      code:       'OCR_EMPTY_FILE',
    }
  }

  const base64 = fileBuffer.toString('base64')
  const isPdf  = mimeType === 'application/pdf'
  const prompt = buildPrompt(docType)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileBlock: any = isPdf
    ? {
        type:   'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      }
    : {
        type:   'image',
        source: {
          type:       'base64',
          media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
          data:       base64,
        },
      }

  // Prompt caching (HU-192): las INSTRUCCIONES (estables por tipo de documento) van en el bloque
  // `system` con cache_control → se cachean entre facturas; solo la imagen (variable) va en el user.
  // HU-214 — `signal` con tope TOTAL: si la llamada (incluidas esperas de backoff) excede el límite,
  // se aborta, el SDK deja de reintentar y el slot del worker se libera; el ítem se marca fallido.
  const abort   = new AbortController()
  const abortAt = setTimeout(() => abort.abort(), OCR_TOTAL_TIMEOUT_MS)
  let response
  const modelStart = Date.now()   // HU-215 — cronometrar la llamada al modelo (el grueso del tiempo)
  try {
    response = await client.messages.create({
      model,
      max_tokens:  2048,
      temperature: 0,
      system: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role:    'user',
          content: [
            fileBlock,
            { type: 'text', text: 'Extrae los datos de este documento siguiendo las instrucciones y responde solo con el JSON.' },
          ],
        },
      ],
    }, { signal: abort.signal })
  } finally {
    clearTimeout(abortAt)
  }
  const modelMs = Date.now() - modelStart

  // HU-215 — Desglose de tiempo + costo por documento (diagnóstico de velocidad; tokens y cache).
  // La generación de tokens de SALIDA es serial y domina la latencia: menos salida = más rápido.
  const u = response.usage
  console.info('[OCR] cost', JSON.stringify({
    model, modelMs, inputTokens: u.input_tokens, outputTokens: u.output_tokens,
    cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0,
  }))

  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  // Claude a veces devuelve el JSON dentro de bloques de código markdown
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const jsonStr   = (jsonMatch ? jsonMatch[1] : rawText).trim()

  let parsed: ExtractionResult
  try {
    parsed = JSON.parse(jsonStr) as ExtractionResult
    normalizeConfidence(parsed)   // HU-215 — el modelo omite confidence cuando es "high"; rellenar aquí
  } catch {
    throw {
      statusCode: 422,
      message:    'El documento no pudo ser procesado. Por favor intenta con una imagen de mayor calidad o mejor iluminación.',
      code:       'OCR_PARSE_ERROR',
    }
  }

  if (!parsed.canRead) {
    throw {
      statusCode: 422,
      message:    parsed.readabilityIssues
        ?? 'El documento no es legible. Intenta con una imagen de mayor resolución, mejor iluminación y el documento completo sin cortar.',
      code:       'OCR_UNREADABLE',
    }
  }

  return parsed
}

// ─── enrichExtraction ─────────────────────────────────────────────────────────

type MatchResult = { index: number; isProduct: boolean; productId: string | null }
type CatalogProduct = {
  id:        string
  name:      string
  sku:       string
  salePrice: number | null
  costPrice: number | null
}

export async function enrichExtraction(params: {
  extraction: ExtractionResult
  tenantId:   string
}): Promise<ExtractionResult> {
  const { extraction, tenantId } = params

  // ── 1. Fetch catalog ────────────────────────────────────────────────────
  let products: CatalogProduct[] = []
  try {
    const rows = await directPrisma.product.findMany({
      where:  { tenantId, isActive: true },
      select: { id: true, name: true, sku: true, salePrice: true, costPrice: true },
      take:   500,
    })
    products = rows.map(r => ({
      id:        r.id,
      name:      r.name,
      sku:       r.sku,
      salePrice: r.salePrice !== null ? Number(r.salePrice) : null,
      costPrice: r.costPrice !== null ? Number(r.costPrice) : null,
    }))
  } catch { /* catalog fetch failed — proceed without enrichment */ }

  // ── 2. Semantic matching ────────────────────────────────────────────────
  let matchResults: MatchResult[] = []

  if (products.length > 0 && extraction.items.length > 0) {
    const descriptions = extraction.items.map((item, i) => ({
      index:       i,
      description: item.description?.value ?? '',
    }))

    try {
      const response = await client.messages.create({
        model:       OCR_MODEL,
        max_tokens:  1024,
        temperature: 0,
        messages: [{
          role:    'user',
          content: buildMatchPrompt(
            descriptions,
            products.map(p => ({ id: p.id, name: p.name, sku: p.sku })),
          ),
        }],
      })
      const rawText   = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      matchResults    = JSON.parse((jsonMatch ? jsonMatch[1] : rawText).trim()) as MatchResult[]
    } catch { /* matching failed — proceed without catalog enrichment */ }
  }

  // ── 3. Build enriched items ─────────────────────────────────────────────
  const matchMap        = new Map(matchResults.map(r => [r.index, r]))
  const recognizedItems: LineItem[] = []
  const unrecognizedItems: string[] = []

  for (let i = 0; i < extraction.items.length; i++) {
    const item  = extraction.items[i]!
    const match = matchMap.get(i)

    if (match && !match.isProduct) {
      unrecognizedItems.push(item.description?.value ?? '')
      continue
    }

    const productId      = match?.productId ?? null
    const catalogProduct = productId ? products.find(p => p.id === productId) : null

    let enrichedItem: LineItem = { ...item, productId }

    // Para cotizaciones (quote): precio de venta del catálogo sobreescribe el del documento
    if (
      extraction.documentType === 'quote' &&
      catalogProduct != null &&
      catalogProduct.salePrice !== null
    ) {
      enrichedItem = {
        ...enrichedItem,
        unitPrice: { value: catalogProduct.salePrice, confidence: 'high' },
      }
    }

    recognizedItems.push(enrichedItem)
  }

  // ── 4. Supplier lookup for purchase orders ──────────────────────────────
  if (extraction.documentType === 'order') {
    let supplierId: string | null = null
    if (extraction.supplier?.value) {
      try {
        const name = extraction.supplier.value.toLowerCase()
        const rows = await directPrisma.supplier.findMany({
          where:  { tenantId, isActive: true },
          select: { id: true, name: true },
          take:   100,
        })
        const supplierMatch = rows.find(
          s => s.name.toLowerCase().includes(name) || name.includes(s.name.toLowerCase()),
        )
        supplierId = supplierMatch?.id ?? null
      } catch {
        supplierId = null
      }
    }

    return {
      ...(extraction as OrderExtraction),
      items: recognizedItems,
      unrecognizedItems,
      supplierId,
    }
  }

  return {
    ...extraction,
    items: recognizedItems,
    unrecognizedItems,
  }
}
