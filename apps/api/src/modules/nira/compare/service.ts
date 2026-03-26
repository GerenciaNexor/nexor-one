import { prisma } from '../../../lib/prisma'

// ─── HU-042: Comparador de cotizaciones ──────────────────────────────────────

/**
 * Devuelve el historial de precios de un producto agrupado por proveedor.
 *
 * Solo considera OC en estado 'received' — las canceladas o borradores no cuentan.
 * Filtra automáticamente proveedores inactivos.
 * Ordena por precio promedio ascendente (el más barato primero).
 */
export async function compareSupplierPrices(tenantId: string, productId: string) {
  // 1. Verificar que el producto existe y pertenece al tenant
  const product = await prisma.product.findFirst({
    where:  { id: productId, tenantId },
    select: { id: true, sku: true, name: true, unit: true },
  })
  if (!product) {
    throw { statusCode: 404, message: 'Producto no encontrado', code: 'NOT_FOUND' }
  }

  // 2. Obtener todas las líneas de OC recibidas para este producto
  const items = await prisma.purchaseOrderItem.findMany({
    where: {
      productId,
      purchaseOrder: {
        tenantId,
        status: 'received',
        supplier: { isActive: true },
      },
    },
    select: {
      unitCost: true,
      purchaseOrder: {
        select: {
          createdAt: true,
          supplier: {
            select: {
              id:   true,
              name: true,
              score: {
                select: { overallScore: true },
              },
            },
          },
        },
      },
    },
  })

  // 3. Agrupar por proveedor y calcular estadísticas en memoria
  const bySupplier = new Map<string, {
    supplierId:       string
    supplierName:     string
    overallScore:     number | null
    costs:            number[]
    lastPurchaseDate: Date
  }>()

  for (const item of items) {
    const supplier   = item.purchaseOrder.supplier
    if (!supplier) continue   // OC sin proveedor — no aplica al comparador
    const unitCost   = parseFloat(String(item.unitCost))
    const createdAt  = item.purchaseOrder.createdAt

    const existing = bySupplier.get(supplier.id)
    if (existing) {
      existing.costs.push(unitCost)
      if (createdAt > existing.lastPurchaseDate) {
        existing.lastPurchaseDate = createdAt
      }
    } else {
      bySupplier.set(supplier.id, {
        supplierId:       supplier.id,
        supplierName:     supplier.name,
        overallScore:     supplier.score ? parseFloat(String(supplier.score.overallScore)) : null,
        costs:            [unitCost],
        lastPurchaseDate: createdAt,
      })
    }
  }

  if (bySupplier.size === 0) {
    return {
      product,
      data:    [],
      total:   0,
      message: 'No hay historial de compras recibidas para este producto.',
    }
  }

  // 4. Calcular stats y ordenar por precio promedio ascendente
  const comparison = Array.from(bySupplier.values())
    .map((entry) => {
      const { costs, ...rest } = entry
      const minPrice  = Math.min(...costs)
      const maxPrice  = Math.max(...costs)
      const avgPrice  = parseFloat(
        (costs.reduce((acc, c) => acc + c, 0) / costs.length).toFixed(2),
      )
      return {
        ...rest,
        minPrice,
        maxPrice,
        avgPrice,
        timesSupplied: costs.length,
        isBestPrice:   false,  // se calculará abajo
        isBestScore:   false,
      }
    })
    .sort((a, b) => a.avgPrice - b.avgPrice)

  // 5. Marcar el proveedor con mejor precio y mejor score
  if (comparison.length > 0) {
    comparison[0]!.isBestPrice = true

    const bestScoreIdx = comparison.reduce(
      (best, item, idx) => {
        if (item.overallScore == null) return best
        if (best === -1) return idx
        const bestScore = comparison[best]!.overallScore ?? -Infinity
        return item.overallScore > bestScore ? idx : best
      },
      -1,
    )
    if (bestScoreIdx !== -1) {
      comparison[bestScoreIdx]!.isBestScore = true
    }
  }

  return { product, data: comparison, total: comparison.length }
}
