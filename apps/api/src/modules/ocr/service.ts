import Anthropic from '@anthropic-ai/sdk'
import { directPrisma } from '../../lib/prisma'

const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] })

// Usar Sonnet para OCR: más rápido y con excelente visión, reservamos Opus para el agente
const OCR_MODEL = process.env['OCR_MODEL'] ?? 'claude-sonnet-4-6'

// HU-191/192 — Modelo del OCR de FACTURAS del registro rápido: Haiku por defecto (céntimos por
// factura, nunca Opus), configurable por env para subir a Sonnet si alguna factura lee mal.
export const INVOICE_OCR_MODEL = process.env['OCR_INVOICE_MODEL'] ?? 'claude-haiku-4-5-20251001'

// ─── Tipos de respuesta ───────────────────────────────────────────────────────

export type DocumentType = 'quote' | 'order'
export type Confidence   = 'high' | 'medium' | 'low'

export interface FieldValue<T = string> {
  value:      T
  confidence: Confidence
}

export interface LineItem {
  description: FieldValue | null
  quantity:    FieldValue<number> | null
  unitPrice:   FieldValue<number> | null
  discount:    FieldValue<number> | null
  productId?:  string | null
}

interface BaseExtraction {
  canRead:            boolean
  readabilityIssues:  string | null
  confidence:         Confidence
  date:               FieldValue | null
  items:              LineItem[]
  total:              FieldValue<number> | null
  notes:              FieldValue | null
  unrecognizedItems?: string[]
}

export interface QuoteExtraction extends BaseExtraction {
  documentType: 'quote'
  client:       FieldValue | null
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
  "readabilityIssues": null,
  "confidence": "high|medium|low",
  "client": { "value": "nombre del cliente o empresa", "confidence": "high|medium|low" },
  "date": { "value": "YYYY-MM-DD", "confidence": "high|medium|low" },
  "items": [
    {
      "description": { "value": "descripción del producto o servicio", "confidence": "high|medium|low" },
      "quantity":    { "value": 2, "confidence": "high|medium|low" },
      "unitPrice":   { "value": 45900.00, "confidence": "high|medium|low" },
      "discount":    null
    }
  ],
  "total": { "value": 91800.00, "confidence": "high|medium|low" },
  "notes": { "value": "condiciones o notas adicionales", "confidence": "high|medium|low" }
}

Para tipo "order":
{
  "documentType": "order",
  "canRead": true,
  "readabilityIssues": null,
  "confidence": "high|medium|low",
  "supplier":     { "value": "nombre del proveedor", "confidence": "high|medium|low" },
  "supplierNit":  { "value": "NIT o identificación tributaria", "confidence": "high|medium|low" },
  "date":         { "value": "YYYY-MM-DD", "confidence": "high|medium|low" },
  "items": [
    {
      "description": { "value": "descripción del producto", "confidence": "high|medium|low" },
      "quantity":    { "value": 3, "confidence": "high|medium|low" },
      "unitPrice":   { "value": 12500.00, "confidence": "high|medium|low" },
      "discount":    null
    }
  ],
  "total":        { "value": 37500.00, "confidence": "high|medium|low" },
  "paymentTerms": { "value": "condiciones de pago", "confidence": "high|medium|low" },
  "notes":        { "value": "notas adicionales", "confidence": "high|medium|low" }
}

Reglas estrictas:
- Si no puedes leer el documento: pon "canRead": false y describe el problema en "readabilityIssues" con sugerencias concretas
- confidence "high": claramente visible y sin ambigüedad
- confidence "medium": legible pero podría tener errores menores de lectura
- confidence "low": apenas legible, estimado o inferido del contexto
- quantity, unitPrice, total y discount son SIEMPRE números JavaScript, nunca strings
- Los precios NO incluyen el símbolo de moneda en el JSON
- Separadores numéricos: en Colombia el punto es separador de miles y la coma es decimal. Ejemplo: "1.234,56" → 1234.56; "45.000" → 45000
- Fechas en formato YYYY-MM-DD; si solo hay mes/año usa YYYY-MM-01
- Si un campo opcional no aparece en el documento usa null directamente (no el objeto)
- Si no hay descuento usa null, no 0
- **PRECIOS — regla más importante**: Siempre extrae el precio real visible en el documento. NUNCA uses 0 como marcador. Si genuinamente no hay columna de precio visible para un ítem, devuelve unitPrice como null (el valor null directamente, no {"value": null}). Un 0 en la respuesta SOLO significa que el documento literalmente muestra "0" o "$0".
- PDFs de varias páginas: analiza solo la primera página`
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
  /** HU-191 — modelo por-llamada. El flujo de facturas del registro rápido pasa Haiku (disciplina de
   *  costos HU-192); OC/Cotización omiten → usan OCR_MODEL (Sonnet) y conservan su precisión. */
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
  const response = await client.messages.create({
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
  })

  // Observabilidad de costo por documento (HU-191/192): tokens y cache.
  const u = response.usage
  console.info('[OCR] cost', JSON.stringify({
    model, inputTokens: u.input_tokens, outputTokens: u.output_tokens,
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
