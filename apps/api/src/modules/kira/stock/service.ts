import { prisma } from '../../../lib/prisma'
import type { StockQuery } from './schema'

// Garantiza que el stock nunca se muestre negativo (regla de negocio).
function safeQty(qty: unknown): number {
  const n = parseFloat(String(qty))
  return isNaN(n) ? 0 : Math.max(0, n)
}

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
      id:       true,
      sku:      true,
      name:     true,
      unit:     true,
      minStock: true,
      maxStock: true,
      isActive: true,
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
