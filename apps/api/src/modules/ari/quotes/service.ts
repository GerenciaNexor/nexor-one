import type { Prisma } from '@prisma/client'
import type { Role } from '@nexor/shared'
import { prisma } from '../../../lib/prisma'
import { hasMinRole } from '../../../lib/guards'
import type { CreateQuoteInput, UpdateQuoteStatusInput, QuoteQuery } from './schema'

// ─── Transiciones de estado válidas ──────────────────────────────────────────
// accepted, rejected y expired son estados terminales — no se pueden cambiar.

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:    ['sent', 'rejected'],
  sent:     ['accepted', 'rejected'],
  accepted: [],
  rejected: [],
  expired:  [],
}

// ─── Selects ──────────────────────────────────────────────────────────────────

const QUOTE_LIST_SELECT = {
  id:          true,
  quoteNumber: true,
  status:      true,
  subtotal:    true,
  discount:    true,
  tax:         true,
  total:       true,
  validUntil:  true,
  notes:       true,
  createdAt:   true,
  updatedAt:   true,
  client:      { select: { id: true, name: true, company: true } },
  deal:        { select: { id: true, title: true } },
  creator:     { select: { id: true, name: true } },
  _count:      { select: { items: true } },
} as const

const QUOTE_DETAIL_SELECT = {
  id:          true,
  quoteNumber: true,
  status:      true,
  subtotal:    true,
  discount:    true,
  tax:         true,
  total:       true,
  validUntil:  true,
  notes:       true,
  createdAt:   true,
  updatedAt:   true,
  client: {
    select: {
      id: true, name: true, company: true,
      email: true, phone: true, address: true, city: true, taxId: true,
    },
  },
  deal:    { select: { id: true, title: true } },
  creator: { select: { id: true, name: true } },
  items: {
    select: {
      id:          true,
      description: true,
      quantity:    true,
      unitPrice:   true,
      discountPct: true,
      total:       true,
      product:     { select: { id: true, sku: true, name: true, unit: true } },
    },
  },
} as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toApiQuote(q: any) {
  const { _count, ...rest } = q
  return {
    ...rest,
    subtotal:  parseFloat(String(q.subtotal)),
    discount:  parseFloat(String(q.discount)),
    tax:       parseFloat(String(q.tax)),
    total:     parseFloat(String(q.total)),
    itemCount: _count?.items ?? q.items?.length ?? 0,
    items: q.items?.map((item: Record<string, unknown>) => ({
      ...item,
      quantity:    parseFloat(String(item['quantity'])),
      unitPrice:   parseFloat(String(item['unitPrice'])),
      discountPct: parseFloat(String(item['discountPct'])),
      total:       parseFloat(String(item['total'])),
    })),
  }
}

// ─── Generación de número — COT-YYYY-NNN ──────────────────────────────────────

async function generateQuoteNumber(tenantId: string): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `COT-${year}-`

  const last = await prisma.quote.findFirst({
    where:   { tenantId, quoteNumber: { startsWith: prefix } },
    orderBy: { quoteNumber: 'desc' },
    select:  { quoteNumber: true },
  })

  const seq  = last ? parseInt(last.quoteNumber.slice(prefix.length), 10) : 0
  return `${prefix}${String(seq + 1).padStart(3, '0')}`
}

// ─── Cálculo de totales ───────────────────────────────────────────────────────

function calculateTotals(
  items:   { quantity: number; unitPrice: number; discountPct: number }[],
  taxRate: number,
) {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const discount = items.reduce(
    (sum, i) => sum + i.quantity * i.unitPrice * (i.discountPct / 100),
    0,
  )
  const taxable = subtotal - discount
  const tax     = taxable * (taxRate / 100)
  const total   = taxable + tax
  return { subtotal, discount, tax, total }
}

// =============================================================================
// OPERACIONES
// =============================================================================

export async function listQuotes(
  tenantId: string,
  userId:   string,
  role:     Role,
  query:    QuoteQuery,
) {
  const isManager = hasMinRole(role, 'AREA_MANAGER')

  const where: Prisma.QuoteWhereInput = {
    tenantId,
    // OPERATIVE solo ve las cotizaciones que él creó
    ...(!isManager ? { createdBy: userId } : {}),
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.dealId   ? { dealId:   query.dealId }   : {}),
    ...(query.status   ? { status:   query.status }   : {}),
  }

  const quotes = await prisma.quote.findMany({
    where,
    select:  QUOTE_LIST_SELECT,
    orderBy: { createdAt: 'desc' },
  })
  return { data: quotes.map(toApiQuote), total: quotes.length }
}

export async function getQuote(tenantId: string, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where:  { id: quoteId, tenantId },
    select: QUOTE_DETAIL_SELECT,
  })
  if (!quote) throw { statusCode: 404, message: 'Cotización no encontrada', code: 'NOT_FOUND' }
  return toApiQuote(quote)
}

export async function createQuote(
  tenantId:  string,
  createdBy: string,
  input:     CreateQuoteInput,
) {
  // Verificar cliente
  const client = await prisma.client.findFirst({
    where:  { id: input.clientId, tenantId },
    select: { id: true },
  })
  if (!client) throw { statusCode: 404, message: 'Cliente no encontrado', code: 'NOT_FOUND' }

  // Verificar deal si se provee
  if (input.dealId) {
    const deal = await prisma.deal.findFirst({
      where:  { id: input.dealId, tenantId },
      select: { id: true },
    })
    if (!deal) throw { statusCode: 404, message: 'Deal no encontrado', code: 'NOT_FOUND' }
  }

  const { subtotal, discount, tax, total } = calculateTotals(input.items, input.taxRate)
  const quoteNumber = await generateQuoteNumber(tenantId)

  const quote = await prisma.quote.create({
    data: {
      tenantId,
      clientId:   input.clientId,
      dealId:     input.dealId     ?? null,
      createdBy,
      quoteNumber,
      status:     'draft',
      subtotal,
      discount,
      tax,
      total,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      notes:      input.notes      ?? null,
      items: {
        create: input.items.map((item) => ({
          productId:   item.productId   ?? null,
          description: item.description,
          quantity:    item.quantity,
          unitPrice:   item.unitPrice,
          discountPct: item.discountPct,
          total:       item.quantity * item.unitPrice * (1 - item.discountPct / 100),
        })),
      },
    },
    select: QUOTE_DETAIL_SELECT,
  })
  return toApiQuote(quote)
}

export async function updateQuoteStatus(
  tenantId: string,
  quoteId:  string,
  input:    UpdateQuoteStatusInput,
) {
  const quote = await prisma.quote.findFirst({
    where:  { id: quoteId, tenantId },
    select: {
      id:          true,
      quoteNumber: true,
      status:      true,
      validUntil:  true,
      total:       true,
      createdBy:   true,
      client:      { select: { id: true, name: true } },
      deal:        { select: { branchId: true } },
    },
  })
  if (!quote) throw { statusCode: 404, message: 'Cotización no encontrada', code: 'NOT_FOUND' }

  // Verificar transición válida
  const allowed = VALID_TRANSITIONS[quote.status] ?? []
  if (!allowed.includes(input.status)) {
    throw {
      statusCode: 409,
      message:    `No se puede cambiar una cotización de '${quote.status}' a '${input.status}'`,
      code:       'INVALID_TRANSITION',
    }
  }

  // Regla: cotización vencida no puede aceptarse
  if (input.status === 'accepted' && quote.validUntil) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (new Date(quote.validUntil) < today) {
      throw {
        statusCode: 422,
        message:    'Esta cotización está vencida. Crea una nueva cotización para el cliente.',
        code:       'QUOTE_EXPIRED',
      }
    }
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. Actualizar estado
    const updated = await tx.quote.update({
      where:  { id: quoteId },
      data:   { status: input.status },
      select: QUOTE_DETAIL_SELECT,
    })

    // 2. Si accepted → generar ingreso en VERA
    if (input.status === 'accepted') {
      const amount   = parseFloat(String(quote.total))
      const branchId = quote.deal?.branchId ?? null

      if (amount > 0) {
        await tx.transaction.create({
          data: {
            tenantId,
            branchId,
            type:          'income',
            amount,
            currency:      'COP',
            description:   `Cotización aceptada ${quote.quoteNumber} — ${quote.client.name}`,
            category:      'Ventas',
            referenceType: 'quote',
            referenceId:   quoteId,
            date:          new Date(),
          },
        })
      }
    }

    return toApiQuote(updated)
  })
}

// =============================================================================
// CONSULTA DE STOCK — informativa (no reserva ni bloquea stock)
// =============================================================================

/**
 * Devuelve el stock del producto en todas las sucursales del tenant.
 * Reutiliza directamente la tabla `stocks` de KIRA — sin importar el servicio
 * de KIRA para evitar dependencia circular entre módulos.
 */
export async function getProductStockForQuote(tenantId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where:  { id: productId, tenantId, isActive: true },
    select: { id: true, sku: true, name: true, unit: true, salePrice: true, minStock: true },
  })
  if (!product) throw { statusCode: 404, message: 'Producto no encontrado', code: 'NOT_FOUND' }

  const stocks = await prisma.stock.findMany({
    where:  { productId },
    select: {
      quantity: true,
      branch:   { select: { id: true, name: true, city: true } },
    },
    orderBy: { branch: { name: 'asc' } },
  })

  const branches = stocks.map((s) => ({
    branchId:   s.branch.id,
    branchName: s.branch.name,
    city:       s.branch.city,
    quantity:   Math.max(0, parseFloat(String(s.quantity))),
  }))

  return {
    productId:  product.id,
    sku:        product.sku,
    name:       product.name,
    unit:       product.unit,
    salePrice:  product.salePrice ? parseFloat(String(product.salePrice)) : null,
    totalStock: branches.reduce((sum, b) => sum + b.quantity, 0),
    branches,
  }
}
