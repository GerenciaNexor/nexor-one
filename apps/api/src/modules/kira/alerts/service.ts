import { prisma } from '../../../lib/prisma'

/**
 * Devuelve en tiempo real los productos con stock por debajo del mínimo.
 * No depende del job horario — consulta la DB directamente.
 *
 * @param tenantId       - Tenant del usuario
 * @param branchId       - Si se indica, filtra solo esa sucursal
 */
export async function listCriticalStock(tenantId: string, branchId?: string) {
  const stocks = await prisma.stock.findMany({
    where: {
      product: { tenantId, isActive: true, minStock: { gt: 0 } },
      ...(branchId ? { branchId } : {}),
    },
    select: {
      quantity:  true,
      productId: true,
      branchId:  true,
      product: { select: { name: true, sku: true, unit: true, minStock: true } },
      branch:  { select: { name: true } },
    },
  })

  const critical = stocks
    .filter((s) => parseFloat(String(s.quantity)) < s.product.minStock)
    .map((s) => {
      const currentQty = Math.max(0, parseFloat(String(s.quantity)))
      return {
        productId:   s.productId,
        productName: s.product.name,
        sku:         s.product.sku,
        unit:        s.product.unit,
        branchId:    s.branchId,
        branchName:  s.branch.name,
        currentQty,
        minQty:      s.product.minStock,
        deficit:     s.product.minStock - currentQty, // cuántas unidades faltan
      }
    })
    // Ordenar por déficit descendente (más urgente primero)
    .sort((a, b) => b.deficit - a.deficit)

  return { critical, total: critical.length }
}
