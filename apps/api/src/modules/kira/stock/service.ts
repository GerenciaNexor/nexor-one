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
  reason:          true,
  quantity:       true,
  quantityBefore: true,
  quantityAfter:  true,
  referenceType:  true,
  referenceId:    true,
  salePriceFrozen: true,
  costPriceFrozen: true,
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
      id:             true,
      quantity:       true,
      rentedQuantity: true,
      updatedAt:      true,
      product: {
        select: {
          id:         true,
          sku:        true,
          name:       true,
          unit:       true,
          category:   true,
          minStock:   true,
          maxStock:   true,
          isSellable: true,
          isRentable: true,
        },
      },
      branch: {
        select: { id: true, name: true, city: true },
      },
    },
    orderBy: [{ branch: { name: 'asc' } }, { product: { name: 'asc' } }],
  })

  // HU-158 — disponible = total − alquilado. La alerta de mínimo mira el DISPONIBLE
  // (lo que realmente se puede usar); sin alquileres, disponible == total (sin cambios).
  let data = rows.map((r) => {
    const total     = safeQty(r.quantity)
    const rented    = safeQty(r.rentedQuantity)
    const available = Math.max(0, total - rented)
    return {
      id:        r.id,
      quantity:  total,       // compat: `quantity` sigue siendo el TOTAL
      total,
      rented,
      available,
      belowMin:  available < r.product.minStock,
      updatedAt: r.updatedAt,
      product:   r.product,
      branch:    r.branch,
    }
  })

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
      id:             true,
      quantity:       true,
      rentedQuantity: true,
      updatedAt:      true,
      branch: { select: { id: true, name: true, city: true, isActive: true } },
    },
    orderBy: { branch: { name: 'asc' } },
  })

  const branches = stocks.map((s) => {
    const total     = safeQty(s.quantity)
    const rented    = safeQty(s.rentedQuantity)
    const available = Math.max(0, total - rented)
    return {
      stockId:        s.id,
      branchId:       s.branch.id,
      branchName:     s.branch.name,
      city:           s.branch.city,
      isActiveBranch: s.branch.isActive,
      quantity:       total,   // compat: TOTAL
      total,
      rented,
      available,
      belowMin:       available < product.minStock,
      updatedAt:      s.updatedAt,
    }
  })

  const totalStock     = branches.reduce((sum, b) => sum + b.total, 0)
  const rentedStock    = branches.reduce((sum, b) => sum + b.rented, 0)
  const availableStock = branches.reduce((sum, b) => sum + b.available, 0)

  return { product, branches, totalStock, rentedStock, availableStock }
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
      select: { quantity: true, rentedQuantity: true },
    })
    const qtyBefore = stockRecord ? safeQty(stockRecord.quantity) : 0
    const rented    = stockRecord ? safeQty(stockRecord.rentedQuantity) : 0

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

    // 5b. HU-158 — el TOTAL nunca puede bajar por debajo de lo ALQUILADO (disponible ≥ 0).
    //     Una salida/ajuste no puede retirar unidades que están alquiladas afuera.
    if (qtyAfter < rented) {
      throw {
        statusCode: 409,
        message: `No puedes retirar esas unidades: ${rented} están alquiladas. Disponible para mover: ${Math.max(0, qtyBefore - rented)}.`,
        code: 'RENTED_UNITS_LOCKED',
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
        reason:         input.reason,   // HU-128 — motivo obligatorio
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
