import { prisma, directPrisma } from '../../lib/prisma'
import { Prisma } from '@prisma/client'
import { ensureGenericSupplier } from '../nira/suppliers/service'
import { ensureGenericClient } from '../ari/clients/service'
import { businessToday } from '../../lib/dates'
import { matchProductByName } from '../../lib/text-match'
import { extractDocument, INVOICE_OCR_MODEL, type DocumentType, type OrderExtraction, type QuoteExtraction } from '../ocr/service'
import type { QuickPurchaseInput, QuickSaleInput, NewProductInputT, RegisterInvoiceInput } from './schema'

const num = (v: unknown): number => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n }
const numN = (v: unknown): number | null => (v === null || v === undefined ? null : num(v))

/** Categoría de transacción por nombre (idempotente). Da categoryId real para los reportes de VERA. */
async function ensureCategory(tx: Prisma.TransactionClient, tenantId: string, name: string, type: 'income' | 'expense'): Promise<string> {
  const existing = await tx.transactionCategory.findFirst({ where: { tenantId, name }, select: { id: true } })
  if (existing) return existing.id
  try {
    return (await tx.transactionCategory.create({ data: { tenantId, name, type }, select: { id: true } })).id
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      const again = await tx.transactionCategory.findFirst({ where: { tenantId, name }, select: { id: true } })
      if (again) return again.id
    }
    throw err
  }
}

// ─── Lookups (accesibles desde el registro rápido, sin gate de módulo) ─────────

export async function listQuickProducts(tenantId: string) {
  const data = await prisma.product.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, sku: true, name: true, unit: true, salePrice: true, costPrice: true },
    orderBy: { name: 'asc' },
  })
  return { data: data.map((p) => ({ ...p, salePrice: numN(p.salePrice), costPrice: numN(p.costPrice) })), total: data.length }
}

export async function listQuickSuppliers(tenantId: string) {
  await ensureGenericSupplier(prisma, tenantId)
  const data = await prisma.supplier.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true, isGeneric: true }, orderBy: [{ isGeneric: 'desc' }, { name: 'asc' }] })
  return { data, total: data.length }
}

export async function listQuickClients(tenantId: string) {
  await ensureGenericClient(prisma, tenantId)
  const data = await prisma.client.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true, isGeneric: true }, orderBy: [{ isGeneric: 'desc' }, { name: 'asc' }] })
  return { data, total: data.length }
}

export async function listQuickBranches(tenantId: string) {
  const data = await prisma.branch.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  return { data, total: data.length }
}

/**
 * HU-169/170 — Historial de registros rápidos (panel propio). Deriva de las transacciones VERA
 * `quick_purchase`/`quick_sale`; enriquece con el movimiento de stock vinculado (si afecta inventario).
 */
export async function listQuickRegisters(tenantId: string, opts: { kind?: 'purchase' | 'sale'; page: number; limit: number }) {
  const refTypes = opts.kind === 'purchase' ? ['quick_purchase'] : opts.kind === 'sale' ? ['quick_sale'] : ['quick_purchase', 'quick_sale']
  const where = { tenantId, referenceType: { in: refTypes } }
  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      select: { id: true, type: true, amount: true, description: true, date: true, referenceType: true, createdAt: true, branch: { select: { name: true } } },
      orderBy: { date: 'desc' },
      skip: (opts.page - 1) * opts.limit, take: opts.limit,
    }),
    prisma.transaction.count({ where }),
  ])
  const ids = rows.map((r) => r.id)
  const movs = ids.length
    ? await prisma.stockMovement.findMany({ where: { tenantId, referenceType: { in: refTypes }, referenceId: { in: ids } }, select: { referenceId: true, quantity: true, product: { select: { sku: true, name: true, unit: true } } } })
    : []
  const byTxn = new Map(movs.map((m) => [m.referenceId, m]))
  // La descripción tiene el formato "Compra/Venta rápida — <detalle> (<contraparte>)".
  const parse = (desc: string) => {
    const cp = desc.match(/\(([^()]+)\)\s*$/)?.[1] ?? null
    const detail = desc.replace(/^(Compra|Venta) rápida —\s*/, '').replace(/\s*\([^()]*\)\s*$/, '').trim()
    return { counterparty: cp, detail }
  }
  return {
    data: rows.map((r) => {
      const mov = byTxn.get(r.id)
      const { counterparty, detail } = parse(r.description)
      return {
        id:               r.id,
        kind:             r.referenceType === 'quick_purchase' ? 'purchase' : 'sale',
        amount:           num(r.amount),
        description:      r.description,
        detail,           // producto o descripción, sin prefijo ni contraparte
        counterparty,     // proveedor (compra) / cliente (venta)
        date:             r.date,
        branchName:       r.branch?.name ?? null,
        affectsInventory: !!mov,
        product:          mov ? { sku: mov.product.sku, name: mov.product.name, unit: mov.product.unit, quantity: num(mov.quantity) } : null,
      }
    }),
    total, page: opts.page, limit: opts.limit, totalPages: Math.ceil(total / opts.limit),
  }
}

// ─── Núcleo por-ítem (reutilizado por el registro rápido y por la factura OCR — HU-191) ────────────

type PurchaseLine = {
  affectsInventory: boolean
  branchId?: string | null
  productId?: string
  newProduct?: NewProductInputT
  quantity?: number
  unitCost?: number
  description?: string
  amount?: number
}
type SaleLine = {
  affectsInventory: boolean
  branchId?: string | null
  productId?: string
  quantity?: number
  unitPrice?: number
  description?: string
  amount?: number
}

/** Aplica UN ítem de compra dentro de una transacción abierta (stock entrada + gasto VERA, o solo VERA). */
async function applyPurchaseItem(
  tx: Prisma.TransactionClient, tenantId: string, userId: string,
  ctx: { supplierName: string; categoryId: string; now: Date }, line: PurchaseLine,
) {
  if (line.affectsInventory) {
    const branch = await tx.branch.findFirst({ where: { id: line.branchId!, tenantId, isActive: true }, select: { id: true } })
    if (!branch) throw { statusCode: 400, message: 'Sucursal no encontrada en tu empresa', code: 'BRANCH_NOT_FOUND' }

    const qty = line.quantity!, cost = line.unitCost!

    // HU-170 — el producto puede ser EXISTENTE o crearse al vuelo (un producto nace cuando se compra).
    let product: { id: string; name: string }
    if (line.newProduct) {
      const np = line.newProduct
      try {
        product = await tx.product.create({
          data: {
            tenantId, sku: np.sku, name: np.name, description: np.description ?? null, category: np.category ?? null,
            unit: np.unit, salePrice: np.salePrice, costPrice: np.costPrice ?? cost, // por defecto, el costo de esta compra
            minStock: np.minStock, maxStock: np.maxStock, isSellable: np.isSellable, isRentable: np.isRentable,
            rentalPrice: np.isRentable ? np.rentalPrice : null,
          },
          select: { id: true, name: true },
        })
      } catch (err: unknown) {
        if ((err as { code?: string }).code === 'P2002') {
          throw { statusCode: 409, message: `Ya existe un producto con el SKU '${np.sku}'. Selecciónalo en vez de crearlo.`, code: 'DUPLICATE_SKU' }
        }
        throw err
      }
    } else {
      const found = await tx.product.findFirst({ where: { id: line.productId!, tenantId, isActive: true }, select: { id: true, name: true } })
      if (!found) throw { statusCode: 404, message: 'Producto no encontrado o inactivo', code: 'PRODUCT_NOT_FOUND' }
      product = found
    }

    const amount = qty * cost
    const stock = await tx.stock.findUnique({ where: { productId_branchId: { productId: product.id, branchId: branch.id } }, select: { quantity: true } })
    const before = stock ? num(stock.quantity) : 0
    const after  = before + qty // entrada: nunca negativo

    await tx.stock.upsert({
      where:  { productId_branchId: { productId: product.id, branchId: branch.id } },
      create: { productId: product.id, branchId: branch.id, quantity: after },
      update: { quantity: after },
    })
    const txn = await tx.transaction.create({
      data: { tenantId, branchId: branch.id, categoryId: ctx.categoryId, type: 'expense', amount, currency: 'COP',
        description: `Compra rápida — ${product.name} (${ctx.supplierName})`, category: 'Compras',
        referenceType: 'quick_purchase', date: ctx.now, isManual: true },
      select: { id: true },
    })
    // Movimiento inmutable (HU-128): quién/cómo/por qué, con costo congelado.
    await tx.stockMovement.create({
      data: { tenantId, productId: product.id, branchId: branch.id, userId, type: 'entrada', reason: 'compra',
        quantity: qty, quantityBefore: before, quantityAfter: after, costPriceFrozen: cost,
        referenceType: 'quick_purchase', referenceId: txn.id, notes: 'Compra rápida' },
    })
    return { transactionId: txn.id, productId: product.id, productName: product.name, affectsInventory: true, amount, stockBefore: before, stockAfter: after }
  }

  const amount = line.amount!
  const txn = await tx.transaction.create({
    data: { tenantId, branchId: line.branchId ?? null, categoryId: ctx.categoryId, type: 'expense', amount, currency: 'COP',
      description: `Compra rápida — ${line.description} (${ctx.supplierName})`, category: 'Compras',
      referenceType: 'quick_purchase', date: ctx.now, isManual: true },
    select: { id: true },
  })
  return { transactionId: txn.id, affectsInventory: false, amount }
}

/** Aplica UN ítem de venta dentro de una transacción abierta (stock salida del disponible + ingreso VERA, o solo VERA). */
async function applySaleItem(
  tx: Prisma.TransactionClient, tenantId: string, userId: string,
  ctx: { clientName: string; categoryId: string; now: Date }, line: SaleLine,
) {
  if (line.affectsInventory) {
    const branch = await tx.branch.findFirst({ where: { id: line.branchId!, tenantId, isActive: true }, select: { id: true } })
    if (!branch) throw { statusCode: 400, message: 'Sucursal no encontrada en tu empresa', code: 'BRANCH_NOT_FOUND' }
    // HU-170 — en venta el producto DEBE existir (no se vende algo no registrado): se bloquea.
    const product = await tx.product.findFirst({ where: { id: line.productId!, tenantId, isActive: true }, select: { id: true, name: true, costPrice: true } })
    if (!product) throw { statusCode: 404, message: 'Este producto no existe en tu inventario. Agrégalo primero (por ejemplo con una compra) antes de venderlo.', code: 'PRODUCT_NOT_FOUND' }

    const qty = line.quantity!, price = line.unitPrice!
    const amount = qty * price
    const stock = await tx.stock.findUnique({ where: { productId_branchId: { productId: product.id, branchId: branch.id } }, select: { quantity: true, rentedQuantity: true } })
    const total = stock ? num(stock.quantity) : 0
    const rented = stock ? num(stock.rentedQuantity) : 0
    const available = Math.max(0, total - rented) // HU-158 — no se vende lo alquilado
    if (available < qty) {
      throw { statusCode: 409, message: `Stock insuficiente para "${product.name}": disponible ${available}, requerido ${qty}.`, code: 'INSUFFICIENT_STOCK' }
    }
    const after = total - qty // el disponible resultante sigue ≥ 0 (available ≥ qty ⇒ total−qty ≥ rented)

    await tx.stock.update({ where: { productId_branchId: { productId: product.id, branchId: branch.id } }, data: { quantity: after } })
    const txn = await tx.transaction.create({
      data: { tenantId, branchId: branch.id, categoryId: ctx.categoryId, type: 'income', amount, currency: 'COP',
        description: `Venta rápida — ${product.name} (${ctx.clientName})`, category: 'Ventas',
        referenceType: 'quick_sale', date: ctx.now, isManual: true },
      select: { id: true },
    })
    await tx.stockMovement.create({
      data: { tenantId, productId: product.id, branchId: branch.id, userId, type: 'salida', reason: 'venta',
        quantity: qty, quantityBefore: total, quantityAfter: after,
        salePriceFrozen: price, costPriceFrozen: product.costPrice ?? null,
        referenceType: 'quick_sale', referenceId: txn.id, notes: 'Venta rápida' },
    })
    return { transactionId: txn.id, productId: product.id, productName: product.name, affectsInventory: true, amount, stockBefore: total, stockAfter: after }
  }

  const amount = line.amount!
  const txn = await tx.transaction.create({
    data: { tenantId, branchId: line.branchId ?? null, categoryId: ctx.categoryId, type: 'income', amount, currency: 'COP',
      description: `Venta rápida — ${line.description} (${ctx.clientName})`, category: 'Ventas',
      referenceType: 'quick_sale', date: ctx.now, isManual: true },
    select: { id: true },
  })
  return { transactionId: txn.id, affectsInventory: false, amount }
}

// ─── Compra rápida ─────────────────────────────────────────────────────────────

/** HU-169 — Compra rápida (ya ocurrida). Afecta stock (entrada/compra + gasto VERA) o solo VERA. */
export async function quickPurchase(tenantId: string, userId: string, input: QuickPurchaseInput) {
  return prisma.$transaction(async (tx) => {
    const now = input.date ? new Date(input.date) : businessToday()
    const supplierId = input.supplierId ?? await ensureGenericSupplier(tx, tenantId)
    const supplier = await tx.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true, name: true } })
    if (!supplier) throw { statusCode: 400, message: 'Proveedor no encontrado en tu empresa', code: 'SUPPLIER_NOT_FOUND' }
    const categoryId = await ensureCategory(tx, tenantId, 'Compras', 'expense')
    return applyPurchaseItem(tx, tenantId, userId, { supplierName: supplier.name, categoryId, now }, {
      affectsInventory: input.affectsInventory, branchId: input.branchId, productId: input.productId,
      newProduct: input.newProduct, quantity: input.quantity, unitCost: input.unitCost,
      description: input.description, amount: input.amount,
    })
  })
}

// ─── Venta rápida ──────────────────────────────────────────────────────────────

/** HU-169 — Venta rápida (ya ocurrida). Descuenta del disponible (salida/venta + ingreso VERA) o solo VERA. */
export async function quickSale(tenantId: string, userId: string, input: QuickSaleInput) {
  return prisma.$transaction(async (tx) => {
    const now = input.date ? new Date(input.date) : businessToday()
    const clientId = input.clientId ?? await ensureGenericClient(tx, tenantId)
    const client = await tx.client.findFirst({ where: { id: clientId, tenantId }, select: { id: true, name: true } })
    if (!client) throw { statusCode: 400, message: 'Cliente no encontrado en tu empresa', code: 'CLIENT_NOT_FOUND' }
    const categoryId = await ensureCategory(tx, tenantId, 'Ventas', 'income')
    return applySaleItem(tx, tenantId, userId, { clientName: client.name, categoryId, now }, {
      affectsInventory: input.affectsInventory, branchId: input.branchId, productId: input.productId,
      quantity: input.quantity, unitPrice: input.unitPrice, description: input.description, amount: input.amount,
    })
  })
}

// ─── HU-191 — Factura por imagen (OCR): extraer (no persiste) y registrar (tras confirmación) ──────

/**
 * Lee UNA imagen de factura (Vision-por-Claude con Haiku+caching), cruza los ítems con el inventario
 * de forma LOCAL (sin 2ª llamada a la API) y devuelve la propuesta para que el humano la revise.
 * NO persiste nada. Si la imagen es ilegible → `{ canRead:false }` con el mensaje para caer a manual.
 */
export async function extractInvoice(params: {
  tenantId: string; kind: 'purchase' | 'sale'; fileBuffer: Buffer; mimeType: string; fileName: string
}) {
  const { tenantId, kind, fileBuffer, mimeType, fileName } = params
  const docType: DocumentType = kind === 'purchase' ? 'order' : 'quote'

  let result
  try {
    result = await extractDocument({ fileBuffer, mimeType, fileName, docType, tenantId, model: INVOICE_OCR_MODEL })
  } catch (err) {
    const e = err as { code?: string }
    if (e.code === 'OCR_UNREADABLE' || e.code === 'OCR_PARSE_ERROR') {
      return { canRead: false, message: 'Lo siento, la imagen no se logró entender, ingresa los valores manualmente.' }
    }
    throw err
  }

  // Catálogo del tenant (directPrisma: la ruta corre con tenantTx:false; filtro explícito por tenantId).
  const products = await directPrisma.product.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, sku: true, salePrice: true, costPrice: true },
  })
  const catalog = products.map((p) => ({ id: p.id, name: p.name, sku: p.sku }))

  const items = result.items.map((it) => {
    const description = it.description?.value ?? ''
    const match = description ? matchProductByName(description, catalog) : null
    const prod  = match ? products.find((p) => p.id === match.id) ?? null : null
    return {
      description,
      quantity:     it.quantity?.value ?? null,
      unitValue:    it.unitPrice?.value ?? null,
      productId:    prod?.id ?? null,
      productName:  prod?.name ?? null,
      inInventory:  !!prod,
      suggestedSalePrice: prod ? numN(prod.salePrice) : null,
      confidence:   it.description?.confidence ?? 'low',
    }
  })

  const header = kind === 'purchase'
    ? { issuer: (result as OrderExtraction).supplier?.value ?? null, nit: (result as OrderExtraction).supplierNit?.value ?? null }
    : { issuer: (result as QuoteExtraction).client?.value ?? null, nit: null as string | null }

  // HU-193-B — datos SIN campo propio (para "Información adicional obtenida"). Se incluyen las notas
  // si vienen. Ya viajan también en fullExtraction (persisten al registrar); esto es para mostrarlos.
  const additionalFields = [
    ...(result.additionalFields ?? []),
    ...(result.notes?.value ? [{ label: 'Notas', value: result.notes.value }] : []),
  ]

  return {
    canRead: true, kind,
    issuer: header.issuer, nit: header.nit,
    date:   result.date?.value ?? null,
    total:  result.total?.value ?? null,
    items,
    additionalFields,       // HU-193-B — lo que no tiene casilla propia
    fullExtraction: result, // factura COMPLETA (nada se pierde)
  }
}

/**
 * Registra la factura tras la revisión/confirmación humana: crea `QuickInvoice` (encabezado + factura
 * completa + imagen comprimida) y aplica cada ítem resuelto (stock + VERA) en UNA transacción.
 * Ítems de compra no agregados al inventario → quedan solo en el registro de la factura (sin stock).
 */
export async function registerInvoice(tenantId: string, userId: string, branchId: string | null, input: RegisterInvoiceInput) {
  return prisma.$transaction(async (tx) => {
    const now = input.date ? new Date(input.date) : businessToday()
    const effectiveBranch = branchId ?? input.branchId ?? null

    let counterpartyName: string
    let categoryId: string
    if (input.kind === 'purchase') {
      const supplierId = input.supplierId ?? await ensureGenericSupplier(tx, tenantId)
      const supplier = await tx.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { name: true } })
      if (!supplier) throw { statusCode: 400, message: 'Proveedor no encontrado en tu empresa', code: 'SUPPLIER_NOT_FOUND' }
      counterpartyName = supplier.name
      categoryId = await ensureCategory(tx, tenantId, 'Compras', 'expense')
    } else {
      const clientId = input.clientId ?? await ensureGenericClient(tx, tenantId)
      const client = await tx.client.findFirst({ where: { id: clientId, tenantId }, select: { name: true } })
      if (!client) throw { statusCode: 400, message: 'Cliente no encontrado en tu empresa', code: 'CLIENT_NOT_FOUND' }
      counterpartyName = client.name
      categoryId = await ensureCategory(tx, tenantId, 'Ventas', 'income')
    }

    const resolution: unknown[] = []
    for (const item of input.items) {
      if (input.kind === 'purchase') {
        const adds = item.addToInventory !== false && (item.productId || item.newProduct)
        // HU-193-A — un ítem "no agregado al inventario" NO toca stock, pero SÍ se registra como gasto
        // (la factura se pagó): así aparece en "Compras rápidas" y las finanzas quedan completas. Antes
        // se saltaba (continue) → la factura se guardaba pero no aparecía por ningún lado (bug silencioso).
        const line = adds
          ? { affectsInventory: true, branchId: effectiveBranch, productId: item.productId ?? undefined, newProduct: item.newProduct, quantity: item.quantity, unitCost: item.unitValue }
          : { affectsInventory: false, branchId: effectiveBranch, description: item.description, amount: item.quantity * item.unitValue }
        const r = await applyPurchaseItem(tx, tenantId, userId, { supplierName: counterpartyName, categoryId, now }, line)
        resolution.push({ description: item.description, quantity: item.quantity, unitValue: item.unitValue, addedToInventory: adds && !!item.newProduct, affectsStock: adds, ...r })
      } else {
        const r = await applySaleItem(tx, tenantId, userId, { clientName: counterpartyName, categoryId, now }, {
          affectsInventory: true, branchId: effectiveBranch, productId: item.productId!, quantity: item.quantity, unitPrice: item.unitValue,
        })
        resolution.push({ description: item.description, quantity: item.quantity, unitValue: item.unitValue, affectsStock: true, ...r })
      }
    }

    const image = input.imageBase64 ? Buffer.from(input.imageBase64, 'base64') : null
    const invoice = await tx.quickInvoice.create({
      data: {
        tenantId, branchId: effectiveBranch, userId, kind: input.kind,
        issuer: input.issuer ?? null, nit: input.nit ?? null,
        invoiceDate: input.date ? new Date(input.date) : null, total: input.total ?? null,
        // La factura COMPLETA + la resolución final por-ítem (qué se agregó, ids creados) — nada se pierde.
        fullExtraction: { ...input.fullExtraction, _resolution: resolution } as Prisma.InputJsonValue,
        imageData: image, imageMime: image ? (input.imageMime ?? 'image/jpeg') : null,
      },
      select: { id: true },
    })

    return { invoiceId: invoice.id, kind: input.kind, itemsRegistered: resolution.length, items: resolution }
  })
}

/** Sirve la imagen comprimida de una factura (trazabilidad). */
export async function getInvoiceImage(tenantId: string, id: string) {
  const inv = await prisma.quickInvoice.findFirst({ where: { id, tenantId }, select: { imageData: true, imageMime: true } })
  if (!inv?.imageData) throw { statusCode: 404, message: 'Imagen no encontrada', code: 'NOT_FOUND' }
  return { data: Buffer.from(inv.imageData), mime: inv.imageMime ?? 'image/jpeg' }
}

/**
 * HU-193-B — Devuelve una factura guardada con su encabezado + la "Información adicional obtenida"
 * (reconstruida de fullExtraction). Hace RECUPERABLE después todo lo que la factura traía.
 */
export async function getInvoice(tenantId: string, id: string) {
  const inv = await prisma.quickInvoice.findFirst({
    where:  { id, tenantId },
    select: { id: true, kind: true, issuer: true, nit: true, invoiceDate: true, total: true, imageMime: true, fullExtraction: true, createdAt: true },
  })
  if (!inv) throw { statusCode: 404, message: 'Factura no encontrada', code: 'NOT_FOUND' }
  const fe = (inv.fullExtraction ?? {}) as {
    additionalFields?: { label: string; value: string }[]
    notes?: { value?: string }
    _resolution?: Array<Record<string, unknown>>
  }
  const additionalFields = [
    ...(Array.isArray(fe.additionalFields) ? fe.additionalFields : []),
    ...(fe.notes?.value ? [{ label: 'Notas', value: fe.notes.value }] : []),
  ].filter((f) => f?.label && f?.value)
  // Ítems registrados (con su transacción/efecto en stock o finanzas) — HU-194-A: liga con el efecto.
  const items = Array.isArray(fe._resolution) ? fe._resolution : []
  return {
    id: inv.id, kind: inv.kind, issuer: inv.issuer, nit: inv.nit,
    date: inv.invoiceDate, total: inv.total != null ? Number(inv.total) : null,
    hasImage: !!inv.imageMime, additionalFields, items, fullExtraction: inv.fullExtraction, createdAt: inv.createdAt,
  }
}

/** Etiqueta que parece "número de factura" dentro de la información adicional (para la lista/búsqueda). */
function invoiceNumberOf(fe: unknown): string | null {
  const af = (fe as { additionalFields?: { label: string; value: string }[] })?.additionalFields
  if (!Array.isArray(af)) return null
  const f = af.find((x) => /(factura|comprobante|documento|invoice|folio|consecutivo).*(n[uú]m|nro|no\b|#)|n[uú]mero|nro|folio|consecutivo/i.test(x.label))
  return f?.value ?? null
}

/**
 * HU-194-A — Lista de facturas cargadas por OCR (por tipo compra/venta), con búsqueda por número de
 * factura / emisor / NIT (texto), rango de fecha y rango de total. RLS por tenant (proxy + filtro).
 */
export async function listInvoices(tenantId: string, opts: {
  kind: 'purchase' | 'sale'; q?: string; from?: string; to?: string; minTotal?: number; maxTotal?: number; page: number; limit: number
}) {
  const conds: Prisma.Sql[] = [Prisma.sql`tenant_id = ${tenantId}`, Prisma.sql`kind = ${opts.kind}`]
  if (opts.from)             conds.push(Prisma.sql`invoice_date >= ${new Date(opts.from)}`)
  if (opts.to)               conds.push(Prisma.sql`invoice_date <= ${new Date(opts.to)}`)
  if (opts.minTotal != null) conds.push(Prisma.sql`total >= ${opts.minTotal}`)
  if (opts.maxTotal != null) conds.push(Prisma.sql`total <= ${opts.maxTotal}`)
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim()}%`
    // El número de factura vive en full_extraction (info adicional): se busca sobre el texto del JSON.
    conds.push(Prisma.sql`(issuer ILIKE ${like} OR nit ILIKE ${like} OR full_extraction::text ILIKE ${like})`)
  }
  const where  = Prisma.join(conds, ' AND ')
  const offset = (opts.page - 1) * opts.limit

  const rows = await prisma.$queryRaw<Array<{
    id: string; kind: string; issuer: string | null; nit: string | null; invoice_date: Date | null
    total: Prisma.Decimal | null; image_mime: string | null; full_extraction: unknown; created_at: Date
  }>>(Prisma.sql`
    SELECT id, kind, issuer, nit, invoice_date, total, image_mime, full_extraction, created_at
    FROM quick_invoices WHERE ${where} ORDER BY created_at DESC LIMIT ${opts.limit} OFFSET ${offset}`)
  const countRes = await prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT count(*)::int AS n FROM quick_invoices WHERE ${where}`)
  const total = Number(countRes[0]?.n ?? 0)

  return {
    data: rows.map((r) => ({
      id: r.id, kind: r.kind, issuer: r.issuer, nit: r.nit,
      date: r.invoice_date, total: r.total != null ? Number(r.total) : null,
      invoiceNumber: invoiceNumberOf(r.full_extraction), hasImage: !!r.image_mime, createdAt: r.created_at,
    })),
    total, page: opts.page, limit: opts.limit, totalPages: Math.ceil(total / opts.limit),
  }
}
