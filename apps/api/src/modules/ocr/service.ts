import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] })

// Usar Sonnet para OCR: más rápido y con excelente visión, reservamos Opus para el agente
const OCR_MODEL = process.env['OCR_MODEL'] ?? 'claude-sonnet-4-6'

// ─── Tipos de respuesta ───────────────────────────────────────────────────────

export type DocumentType = 'quote' | 'order'
export type Confidence   = 'high' | 'medium' | 'low'

export interface FieldValue<T = string> {
  value:      T
  confidence: Confidence
}

export interface LineItem {
  description: FieldValue
  quantity:    FieldValue<number>
  unitPrice:   FieldValue<number> | null
  discount:    FieldValue<number> | null
}

interface BaseExtraction {
  canRead:           boolean
  readabilityIssues: string | null
  confidence:        Confidence
  date:              FieldValue | null
  items:             LineItem[]
  total:             FieldValue<number> | null
  notes:             FieldValue | null
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
}

export type ExtractionResult = QuoteExtraction | OrderExtraction

// ─── Prompt ───────────────────────────────────────────────────────────────────

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

// ─── Función principal ────────────────────────────────────────────────────────

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

export async function extractDocument(params: {
  fileBuffer: Buffer
  mimeType:   string
  fileName:   string
  docType:    DocumentType | null
  tenantId:   string
}): Promise<ExtractionResult> {
  const { fileBuffer, fileName, docType, tenantId } = params
  const mimeType = resolveMediaType(params.mimeType, fileName)

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

  const base64   = fileBuffer.toString('base64')
  const isPdf    = mimeType === 'application/pdf'
  const prompt   = buildPrompt(docType)

  // Construir el bloque de contenido según el tipo de archivo
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

  const response = await client.messages.create({
    model:       OCR_MODEL,
    max_tokens:  2048,
    temperature: 0,
    messages: [
      {
        role:    'user',
        content: [
          fileBlock,
          { type: 'text', text: prompt },
        ],
      },
    ],
  })

  // Registrar uso de tokens para monitoreo de costos
  console.info(JSON.stringify({
    event:        'ocr_extract_done',
    tenantId,
    model:        OCR_MODEL,
    mimeType,
    docType,
    inputTokens:  response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    fileBytes:    fileBuffer.length,
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
