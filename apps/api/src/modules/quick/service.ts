import { prisma } from '../../lib/prisma'
import type { Prisma } from '@prisma/client'
import { ensureGenericSupplier } from '../nira/suppliers/service'
import { ensureGenericClient } from '../ari/clients/service'
import type { QuickPurchaseInput, QuickSaleInput } from './schema'

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

// ─── Compra rápida ─────────────────────────────────────────────────────────────

/**
 * HU-169 — Compra rápida (ya ocurrida, sin aprobación).
 *  - afecta inventario → suma stock (entrada, motivo `compra`, append-only HU-128) + gasto en VERA.
 *  - no afecta inventario → solo gasto en VERA (servicios/consumos).
 */
export async function quickPurchase(tenantId: string, userId: string, input: QuickPurchaseInput) {
  return prisma.$transaction(async (tx) => {
    const now = input.date ? new Date(input.date) : new Date()
    const supplierId = input.supplierId ?? await ensureGenericSupplier(tx, tenantId)
    const supplier = await tx.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true, name: true } })
    if (!supplier) throw { statusCode: 400, message: 'Proveedor no encontrado en tu empresa', code: 'SUPPLIER_NOT_FOUND' }
    const categoryId = await ensureCategory(tx, tenantId, 'Compras', 'expense')

    if (input.affectsInventory) {
      const branch = await tx.branch.findFirst({ where: { id: input.branchId!, tenantId, isActive: true }, select: { id: true } })
      if (!branch) throw { statusCode: 400, message: 'Sucursal no encontrada en tu empresa', code: 'BRANCH_NOT_FOUND' }

      const qty = input.quantity!, cost = input.unitCost!

      // HU-170 — el producto puede ser EXISTENTE o crearse al vuelo (un producto nace cuando se compra).
      let product: { id: string; name: string }
      if (input.newProduct) {
        const np = input.newProduct
        try {
          product = await tx.product.create({
            data: {
              tenantId,
              sku:         np.sku,
              name:        np.name,
              description: np.description ?? null,
              category:    np.category ?? null,
              unit:        np.unit,
              salePrice:   np.salePrice,
              costPrice:   np.costPrice ?? cost, // por defecto, el costo de esta compra
              minStock:    np.minStock,
              maxStock:    np.maxStock,
              isSellable:  np.isSellable,
              isRentable:  np.isRentable,
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
        const found = await tx.product.findFirst({ where: { id: input.productId!, tenantId, isActive: true }, select: { id: true, name: true } })
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
        data: { tenantId, branchId: branch.id, categoryId, type: 'expense', amount, currency: 'COP',
          description: `Compra rápida — ${product.name} (${supplier.name})`, category: 'Compras',
          referenceType: 'quick_purchase', date: now, isManual: true },
        select: { id: true },
      })
      // Movimiento inmutable (HU-128): quién/cómo/por qué, con costo congelado.
      await tx.stockMovement.create({
        data: { tenantId, productId: product.id, branchId: branch.id, userId, type: 'entrada', reason: 'compra',
          quantity: qty, quantityBefore: before, quantityAfter: after, costPriceFrozen: cost,
          referenceType: 'quick_purchase', referenceId: txn.id, notes: 'Compra rápida' },
      })
      return { transactionId: txn.id, affectsInventory: true, amount, stockBefore: before, stockAfter: after }
    }

    const amount = input.amount!
    const txn = await tx.transaction.create({
      data: { tenantId, branchId: input.branchId ?? null, categoryId, type: 'expense', amount, currency: 'COP',
        description: `Compra rápida — ${input.description} (${supplier.name})`, category: 'Compras',
        referenceType: 'quick_purchase', date: now, isManual: true },
      select: { id: true },
    })
    return { transactionId: txn.id, affectsInventory: false, amount }
  })
}

// ─── Venta rápida ──────────────────────────────────────────────────────────────

/**
 * HU-169 — Venta rápida (ya ocurrida, sin pipeline).
 *  - afecta inventario → descuenta stock del DISPONIBLE (salida, motivo `venta`, precio congelado,
 *    append-only, sin negativo — HU-128/158) + ingreso en VERA.
 *  - no afecta inventario → solo ingreso en VERA (servicios).
 */
export async function quickSale(tenantId: string, userId: string, input: QuickSaleInput) {
  return prisma.$transaction(async (tx) => {
    const now = input.date ? new Date(input.date) : new Date()
    const clientId = input.clientId ?? await ensureGenericClient(tx, tenantId)
    const client = await tx.client.findFirst({ where: { id: clientId, tenantId }, select: { id: true, name: true } })
    if (!client) throw { statusCode: 400, message: 'Cliente no encontrado en tu empresa', code: 'CLIENT_NOT_FOUND' }
    const categoryId = await ensureCategory(tx, tenantId, 'Ventas', 'income')

    if (input.affectsInventory) {
      const branch = await tx.branch.findFirst({ where: { id: input.branchId!, tenantId, isActive: true }, select: { id: true } })
      if (!branch) throw { statusCode: 400, message: 'Sucursal no encontrada en tu empresa', code: 'BRANCH_NOT_FOUND' }
      // HU-170 — en venta el producto DEBE existir (no se vende algo no registrado): se bloquea.
      const product = await tx.product.findFirst({ where: { id: input.productId!, tenantId, isActive: true }, select: { id: true, name: true, costPrice: true } })
      if (!product) throw { statusCode: 404, message: 'Este producto no existe en tu inventario. Agrégalo primero (por ejemplo con una compra) antes de venderlo.', code: 'PRODUCT_NOT_FOUND' }

      const qty = input.quantity!, price = input.unitPrice!
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
        data: { tenantId, branchId: branch.id, categoryId, type: 'income', amount, currency: 'COP',
          description: `Venta rápida — ${product.name} (${client.name})`, category: 'Ventas',
          referenceType: 'quick_sale', date: now, isManual: true },
        select: { id: true },
      })
      await tx.stockMovement.create({
        data: { tenantId, productId: product.id, branchId: branch.id, userId, type: 'salida', reason: 'venta',
          quantity: qty, quantityBefore: total, quantityAfter: after,
          salePriceFrozen: price, costPriceFrozen: product.costPrice ?? null,
          referenceType: 'quick_sale', referenceId: txn.id, notes: 'Venta rápida' },
      })
      return { transactionId: txn.id, affectsInventory: true, amount, stockBefore: total, stockAfter: after }
    }

    const amount = input.amount!
    const txn = await tx.transaction.create({
      data: { tenantId, branchId: input.branchId ?? null, categoryId, type: 'income', amount, currency: 'COP',
        description: `Venta rápida — ${input.description} (${client.name})`, category: 'Ventas',
        referenceType: 'quick_sale', date: now, isManual: true },
      select: { id: true },
    })
    return { transactionId: txn.id, affectsInventory: false, amount }
  })
}
