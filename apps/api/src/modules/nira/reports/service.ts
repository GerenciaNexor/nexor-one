/**
 * Servicio de reportes NIRA — HU-045
 *
 * getCostsReport: total gastado en OC (approved/sent/partial/received),
 * desglosado por proveedor y por categoría de producto.
 * Filtros opcionales: fechas, sucursal.
 * Calculado en tiempo real — sin cache en V1.
 */

import { prisma } from '../../../lib/prisma'

export interface CostsReportFilter {
  from?:     string   // ISO date YYYY-MM-DD
  to?:       string
  branchId?: string
}

const REPORTABLE_STATUSES = ['approved', 'sent', 'partial', 'received'] as const

export async function getCostsReport(tenantId: string, filter: CostsReportFilter) {
  const fromDate = filter.from ? new Date(filter.from) : undefined
  // Para "to" se usa el final del día (23:59:59.999)
  const toDate = filter.to
    ? new Date(new Date(filter.to).setHours(23, 59, 59, 999))
    : undefined

  // ── Cargar OC con sus líneas y datos de producto ──────────────────────────
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      status:   { in: [...REPORTABLE_STATUSES] },
      ...(filter.branchId ? { branchId: filter.branchId } : {}),
      ...(fromDate || toDate ? {
        createdAt: {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate  ? { lte: toDate   } : {}),
        },
      } : {}),
    },
    select: {
      id:       true,
      total:    true,
      supplier: { select: { id: true, name: true } },
      items: {
        select: {
          total:   true,
          product: { select: { category: true } },
        },
      },
    },
  })

  // ── Total general ─────────────────────────────────────────────────────────
  const grandTotal = orders.reduce(
    (acc, o) => acc + parseFloat(String(o.total)), 0,
  )

  // ── Desglose por proveedor ────────────────────────────────────────────────
  const supplierMap = new Map<string, { id: string; name: string; total: number; orderCount: number }>()
  for (const o of orders) {
    const supplierId = o.supplier?.id   ?? '__sin_proveedor__'
    const supplierName = o.supplier?.name ?? 'Sin proveedor'
    const amount = parseFloat(String(o.total))
    const prev = supplierMap.get(supplierId)
    if (prev) {
      prev.total      += amount
      prev.orderCount += 1
    } else {
      supplierMap.set(supplierId, { id: supplierId, name: supplierName, total: amount, orderCount: 1 })
    }
  }

  const bySupplier = Array.from(supplierMap.values())
    .map((s) => ({
      ...s,
      total:      parseFloat(s.total.toFixed(2)),
      percentage: grandTotal > 0 ? parseFloat(((s.total / grandTotal) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // ── Desglose por categoría de producto ────────────────────────────────────
  const categoryMap = new Map<string, { total: number; orderCount: number }>()
  for (const o of orders) {
    for (const item of o.items) {
      const cat    = item.product.category ?? 'Sin categoría'
      const amount = parseFloat(String(item.total))
      const prev   = categoryMap.get(cat)
      if (prev) {
        prev.total += amount
      } else {
        categoryMap.set(cat, { total: amount, orderCount: 1 })
      }
    }
  }

  const byCategory = Array.from(categoryMap.entries())
    .map(([category, { total }]) => ({
      category,
      total:      parseFloat(total.toFixed(2)),
      percentage: grandTotal > 0 ? parseFloat(((total / grandTotal) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  return {
    grandTotal:  parseFloat(grandTotal.toFixed(2)),
    orderCount:  orders.length,
    bySupplier,
    byCategory,
    filter: {
      from:     filter.from     ?? null,
      to:       filter.to       ?? null,
      branchId: filter.branchId ?? null,
    },
  }
}
