import { prisma } from '../../../lib/prisma'
import type { LotQuery } from './schema'

const DAYS_EXPIRING_SOON = 30

/**
 * Agrega lotes desde los movimientos de entrada con lot_number registrado.
 *
 * Como las salidas no apuntan a un lote específico, la cantidad mostrada
 * es el total ingresado por lote (referencia histórica, no stock neto).
 * El principio FIFO se aplica ordenando por expiryDate ASC (nulos al final).
 *
 * @param tenantId   - Tenant del usuario autenticado
 * @param productId  - Si se indica, filtra solo ese producto
 * @param query      - Filtros: branchId, expiringSoon, expired
 * @param forcedBranchId - Forzado para OPERATIVE (solo su sucursal)
 */
export async function listLots(
  tenantId: string,
  query: LotQuery,
  productId?: string,
  forcedBranchId?: string,
) {
  const branchId = forcedBranchId ?? query.branchId

  const movements = await prisma.stockMovement.findMany({
    where: {
      tenantId,
      type:      'entrada',
      lotNumber: { not: null },
      ...(productId ? { productId }     : {}),
      ...(branchId  ? { branchId }      : {}),
    },
    select: {
      lotNumber:  true,
      expiryDate: true,
      quantity:   true,
      productId:  true,
      branchId:   true,
      createdAt:  true,
      product: { select: { sku: true, name: true, unit: true } },
      branch:  { select: { name: true, city: true } },
    },
  })

  // Agrupar por producto + sucursal + lote + fecha de caducidad
  const map = new Map<
    string,
    {
      lotNumber:     string
      expiryDate:    Date | null
      totalQuantity: number
      productId:     string
      branchId:      string
      firstEntryAt:  Date
      product:       { sku: string; name: string; unit: string }
      branch:        { name: string; city: string | null }
    }
  >()

  for (const m of movements) {
    const key = `${m.productId}|${m.branchId}|${m.lotNumber}|${m.expiryDate?.toISOString() ?? ''}`
    const existing = map.get(key)
    if (existing) {
      existing.totalQuantity += parseFloat(String(m.quantity))
      if (m.createdAt < existing.firstEntryAt) existing.firstEntryAt = m.createdAt
    } else {
      map.set(key, {
        lotNumber:     m.lotNumber!,
        expiryDate:    m.expiryDate,
        totalQuantity: parseFloat(String(m.quantity)),
        productId:     m.productId,
        branchId:      m.branchId,
        firstEntryAt:  m.createdAt,
        product:       m.product,
        branch:        m.branch,
      })
    }
  }

  const now            = new Date()
  const soonThreshold  = new Date(now.getTime() + DAYS_EXPIRING_SOON * 24 * 60 * 60 * 1000)

  let lots = Array.from(map.values()).map((lot) => {
    const isExpired      = lot.expiryDate !== null && lot.expiryDate < now
    const isExpiringSoon = lot.expiryDate !== null && !isExpired && lot.expiryDate <= soonThreshold
    return { ...lot, isExpired, isExpiringSoon }
  })

  // Aplicar filtros de estado
  if (query.expiringSoon === 'true') {
    lots = lots.filter((l) => l.isExpiringSoon)
  }
  if (query.expired === 'true') {
    lots = lots.filter((l) => l.isExpired)
  }

  // Ordenar FIFO: vencidos primero, luego por expiryDate ASC, sin fecha al final
  lots.sort((a, b) => {
    if (a.expiryDate === null && b.expiryDate === null) return 0
    if (a.expiryDate === null) return 1
    if (b.expiryDate === null) return -1
    return a.expiryDate.getTime() - b.expiryDate.getTime()
  })

  return { data: lots, total: lots.length }
}
