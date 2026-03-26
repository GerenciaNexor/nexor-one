import { prisma } from '../../../lib/prisma'
import type { Prisma } from '@prisma/client'
import type { StockQuery, CreateMovementInput, MovementQuery } from './schema'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Garantiza que el stock nunca se muestre negativo (regla de negocio).
function safeQty(qty: unknown): number {
  const n = parseFloat(String(qty))
  return isNaN(n) ? 0 : Math.max(0, n)
}

function toNum(qty: unknown): number {
  return parseFloat(String(qty))
}

const MOVEMENT_SELECT = {
  id:             true,
  tenantId:       true,
  productId:      true,
  branchId:       true,
  userId:         true,
  type:           true,
  quantity:       true,
  quantityBefore: true,
  quantityAfter:  true,
  referenceType:  true,
  referenceId:    true,
  lotNumber:      true,
  expiryDate:     true,
  notes:          true,
  createdAt:      true,
  product: { select: { sku: true, name: true, unit: true } },
  branch:  { select: { name: true } },
  user:    { select: { name: true, email: true } },
} as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatMovement(m: any) {
  return {
    ...m,
    quantity:       toNum(m.quantity),
    quantityBefore: toNum(m.quantityBefore),
    quantityAfter:  toNum(m.quantityAfter),
  }
}

// ─── HU-022: Consulta de stock ────────────────────────────────────────────────

/**
 * Lista el stock actual de todos los productos activos del tenant.
 *
 * - forcedBranchId: se pasa cuando el usuario es OPERATIVE — siempre
 *   filtrado a su propia sucursal, ignorando el branchId del query.
 * - query.branchId: filtro opcional para AREA_MANAGER / BRANCH_ADMIN / TENANT_ADMIN.
 * - query.belowMin: si es 'true', filtra solo los que están bajo mínimo.
 */
export async function listStock(
  tenantId: string,
  query: StockQuery,
  forcedBranchId?: string,
) {
  const branchId = forcedBranchId ?? query.branchId

  const rows = await prisma.stock.findMany({
    where: {
      product: { tenantId, isActive: true },
      ...(branchId ? { branchId } : {}),
    },
    select: {
      id:        true,
      quantity:  true,
      updatedAt: true,
      product: {
        select: {
          id:       true,
          sku:      true,
          name:     true,
          unit:     true,
          category: true,
          minStock: true,
          maxStock: true,
        },
      },
      branch: {
        select: { id: true, name: true, city: true },
      },
    },
    orderBy: [{ branch: { name: 'asc' } }, { product: { name: 'asc' } }],
  })

  let data = rows.map((r) => ({
    id:        r.id,
    quantity:  safeQty(r.quantity),
    belowMin:  safeQty(r.quantity) < r.product.minStock,
    updatedAt: r.updatedAt,
    product:   r.product,
    branch:    r.branch,
  }))

  if (query.belowMin === 'true') {
    data = data.filter((r) => r.belowMin)
  }

  return { data, total: data.length }
}

/**
 * Devuelve el stock de un producto específico en TODAS las sucursales del tenant.
 * Usado por KIRA para decisiones de inventario y por ARI antes de cotizar.
 */
export async function getCrossBranchStock(tenantId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    select: {
      id:          true,
      sku:         true,
      name:        true,
      description: true,
      category:    true,
      unit:        true,
      salePrice:   true,
      costPrice:   true,
      minStock:    true,
      maxStock:    true,
      abcClass:    true,
      isActive:    true,
      createdAt:   true,
    },
  })
  if (!product) throw { statusCode: 404, message: 'Producto no encontrado', code: 'NOT_FOUND' }

  const stocks = await prisma.stock.findMany({
    where: { productId },
    select: {
      id:        true,
      quantity:  true,
      updatedAt: true,
      branch: { select: { id: true, name: true, city: true, isActive: true } },
    },
    orderBy: { branch: { name: 'asc' } },
  })

  const branches = stocks.map((s) => {
    const qty = safeQty(s.quantity)
    return {
      stockId:        s.id,
      branchId:       s.branch.id,
      branchName:     s.branch.name,
      city:           s.branch.city,
      isActiveBranch: s.branch.isActive,
      quantity:       qty,
      belowMin:       qty < product.minStock,
      updatedAt:      s.updatedAt,
    }
  })

  const totalStock = branches.reduce((sum, b) => sum + b.quantity, 0)

  return { product, branches, totalStock }
}

// ─── HU-023: Movimientos de inventario ───────────────────────────────────────

/**
 * Registra un movimiento de inventario de forma atómica:
 * 1. Verifica producto y sucursal del tenant
 * 2. Lee el stock actual
 * 3. Calcula el nuevo stock y valida que no quede negativo
 * 4. Actualiza stocks y crea el movimiento en una sola transacción
 *
 * Los movimientos son INMUTABLES — esta función es la única que crea registros
 * en stock_movements. Nunca se editan ni eliminan.
 */
export async function createMovement(
  tenantId: string,
  userId: string,
  input: CreateMovementInput,
) {
  return prisma.$transaction(async (tx) => {
    // 1. Verificar que el producto pertenece al tenant y está activo
    const product = await tx.product.findFirst({
      where: { id: input.productId, tenantId, isActive: true },
      select: { id: true, name: true },
    })
    if (!product) {
      throw { statusCode: 404, message: 'Producto no encontrado o inactivo', code: 'PRODUCT_NOT_FOUND' }
    }

    // 2. Verificar que la sucursal pertenece al tenant y está activa
    const branch = await tx.branch.findFirst({
      where: { id: input.branchId, tenantId, isActive: true },
      select: { id: true },
    })
    if (!branch) {
      throw { statusCode: 404, message: 'Sucursal no encontrada', code: 'BRANCH_NOT_FOUND' }
    }

    // 3. Leer stock actual (puede no existir aún si nunca hubo movimientos)
    const stockRecord = await tx.stock.findUnique({
      where: { productId_branchId: { productId: input.productId, branchId: input.branchId } },
      select: { quantity: true },
    })
    const qtyBefore = stockRecord ? safeQty(stockRecord.quantity) : 0

    // 4. Calcular delta según tipo de movimiento
    //    - entrada: suma (quantity siempre positivo)
    //    - salida:  resta (quantity siempre positivo, se almacena el delta negativo)
    //    - ajuste:  delta puede ser positivo o negativo
    const delta = input.type === 'salida' ? -input.quantity : input.quantity
    const qtyAfter = qtyBefore + delta

    // 5. Validar que el stock no quede negativo
    if (qtyAfter < 0) {
      throw {
        statusCode: 400,
        message: `Stock insuficiente. Stock actual: ${qtyBefore}, cantidad solicitada: ${input.quantity}`,
        code: 'INSUFFICIENT_STOCK',
      }
    }

    // 6. Upsert del registro de stock (puede ser la primera vez para este producto/sucursal)
    await tx.stock.upsert({
      where: { productId_branchId: { productId: input.productId, branchId: input.branchId } },
      create: { productId: input.productId, branchId: input.branchId, quantity: qtyAfter },
      update: { quantity: qtyAfter },
    })

    // 7. Crear el movimiento inmutable
    //    quantity almacena el valor absoluto del delta; la dirección queda en
    //    quantityBefore/quantityAfter y en el tipo.
    return tx.stockMovement.create({
      data: {
        tenantId,
        productId:      input.productId,
        branchId:       input.branchId,
        userId,
        type:           input.type,
        quantity:       Math.abs(delta),
        quantityBefore: qtyBefore,
        quantityAfter:  qtyAfter,
        notes:          input.notes,
        lotNumber:      input.lotNumber,
        expiryDate:     input.expiryDate ? new Date(input.expiryDate) : undefined,
        referenceType:  input.referenceType,
        referenceId:    input.referenceId,
      },
      select: MOVEMENT_SELECT,
    })
  })
}

/**
 * Historial de movimientos con filtros y paginación.
 * Filtrable por producto, sucursal, tipo y rango de fechas.
 */
export async function listMovements(tenantId: string, query: MovementQuery) {
  const where: Prisma.StockMovementWhereInput = {
    tenantId,
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.branchId  ? { branchId:  query.branchId  } : {}),
    ...(query.type      ? { type:      query.type      } : {}),
    ...(query.lotNumber ? { lotNumber: query.lotNumber } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to   ? { lte: new Date(query.to)   } : {}),
          },
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      select: MOVEMENT_SELECT,
      orderBy: { createdAt: 'desc' },
      skip:  (query.page - 1) * query.limit,
      take:  query.limit,
    }),
    prisma.stockMovement.count({ where }),
  ])

  return {
    data:       rows.map(formatMovement),
    total,
    page:       query.page,
    limit:      query.limit,
    totalPages: Math.ceil(total / query.limit),
  }
}
