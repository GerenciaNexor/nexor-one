import { prisma } from '../../../lib/prisma'

/**
 * Genera el reporte ABC para el tenant:
 *   - Productos y valor de inventario por clase (A, B, C, Sin clasificar)
 *   - % de valor y % de productos por clase
 *
 * @param branchId - Si se indica, calcula el valor de inventario solo para esa sucursal
 */
export async function getAbcReport(tenantId: string, branchId?: string) {
  const products = await prisma.product.findMany({
    where: { tenantId, isActive: true },
    select: {
      id:        true,
      abcClass:  true,
      costPrice: true,
      stocks: {
        where:  branchId ? { branchId } : undefined,
        select: { quantity: true },
      },
    },
  })

  // Valor de inventario por producto
  const withValue = products.map((p) => {
    const totalQty = p.stocks.reduce((sum, s) => sum + parseFloat(String(s.quantity)), 0)
    const cost     = p.costPrice ? parseFloat(String(p.costPrice)) : 0
    return { abcClass: p.abcClass, inventoryValue: totalQty * cost }
  })

  const totalValue    = withValue.reduce((sum, p) => sum + p.inventoryValue, 0)
  const totalProducts = products.length

  // Agrupar por clase
  const classes = ['A', 'B', 'C', null] as (string | null)[]
  const summary = classes
    .map((cls) => {
      const group = withValue.filter((p) => p.abcClass === cls)
      const value = group.reduce((sum, p) => sum + p.inventoryValue, 0)
      return {
        class:             cls ?? 'Sin clasificar',
        count:             group.length,
        inventoryValue:    Math.round(value * 100) / 100,
        percentageOfValue: totalValue > 0    ? Math.round((value / totalValue) * 10000) / 100    : 0,
        percentageOfItems: totalProducts > 0 ? Math.round((group.length / totalProducts) * 10000) / 100 : 0,
      }
    })
    .filter((s) => s.count > 0)

  return {
    summary,
    totalProducts,
    totalInventoryValue: Math.round(totalValue * 100) / 100,
  }
}

/**
 * Genera el reporte de rotacion de inventario para el periodo seleccionado:
 *   - Movimientos por producto (entradas, salidas)
 *   - Velocidad de movimiento (unidades/dia)
 *   - Deadstock: productos sin movimiento en los ultimos 30/60/90 dias
 */
export async function getRotationReport(
  tenantId: string,
  query: { from?: string; to?: string; branchId?: string },
) {
  const now        = new Date()
  const fromDate   = query.from ? new Date(query.from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const toDate     = query.to   ? new Date(query.to)   : now
  const branchFilter = query.branchId ? { branchId: query.branchId } : {}
  const periodDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)))

  // 1. Movimientos del periodo agrupados por producto y tipo
  const periodMovements = await prisma.stockMovement.groupBy({
    by:    ['productId', 'type'],
    where: { tenantId, ...branchFilter, createdAt: { gte: fromDate, lte: toDate } },
    _sum:  { quantity: true },
  })

  // 2. Ultima fecha de movimiento por producto (sin limite — para deadstock)
  const lastMovements = await prisma.stockMovement.groupBy({
    by:    ['productId'],
    where: { tenantId, ...branchFilter },
    _max:  { createdAt: true },
  })

  // 3. Todos los productos activos del tenant
  const products = await prisma.product.findMany({
    where:   { tenantId, isActive: true },
    select:  { id: true, name: true, sku: true, unit: true, category: true, abcClass: true },
    orderBy: { name: 'asc' },
  })

  // Mapa de movimientos del periodo por producto
  const movementMap = new Map<string, { entrada: number; salida: number }>()
  for (const m of periodMovements) {
    if (!movementMap.has(m.productId)) {
      movementMap.set(m.productId, { entrada: 0, salida: 0 })
    }
    const entry = movementMap.get(m.productId)!
    const qty   = parseFloat(String(m._sum.quantity ?? 0))
    if      (m.type === 'entrada') entry.entrada += qty
    else if (m.type === 'salida')  entry.salida  += qty
  }

  // Mapa de ultima fecha de movimiento por producto
  const lastDateMap = new Map<string, Date>()
  for (const lm of lastMovements) {
    if (lm._max.createdAt) lastDateMap.set(lm.productId, lm._max.createdAt)
  }

  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const d60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
  const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  const rotation = products.map((p) => {
    const mvmt       = movementMap.get(p.id) ?? { entrada: 0, salida: 0 }
    const totalMoved = mvmt.entrada + mvmt.salida
    const lastDate   = lastDateMap.get(p.id) ?? null

    return {
      productId:        p.id,
      productName:      p.name,
      sku:              p.sku,
      unit:             p.unit,
      category:         p.category,
      abcClass:         p.abcClass,
      totalEntered:     Math.round(mvmt.entrada * 100) / 100,
      totalExited:      Math.round(mvmt.salida  * 100) / 100,
      totalMoved:       Math.round(totalMoved   * 100) / 100,
      velocity:         Math.round((totalMoved / periodDays) * 100) / 100, // unidades/dia
      lastMovementDate: lastDate?.toISOString() ?? null,
      noMovement30d:    !lastDate || lastDate < d30,
      noMovement60d:    !lastDate || lastDate < d60,
      noMovement90d:    !lastDate || lastDate < d90,
    }
  })

  // Mayor movimiento primero
  rotation.sort((a, b) => b.totalMoved - a.totalMoved)

  return {
    period:           { from: fromDate.toISOString(), to: toDate.toISOString(), days: periodDays },
    products:         rotation,
    totalProducts:    products.length,
    activeCount:      rotation.filter((r) => !r.noMovement30d).length,
    deadstock90Count: rotation.filter((r) => r.noMovement90d).length,
  }
}
