import { prisma } from '../../../lib/prisma'

const num = (v: unknown): number => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n }

/**
 * HU-162 — Depósitos en RETENCIÓN (pasivo): dinero del cliente que la empresa guarda y debe devolver.
 * Es una vista DERIVADA de los alquileres ACTIVOS (mientras el producto está afuera, el depósito está
 * retenido). NO se mezcla con el ingreso real: los ingresos por alquiler viven en `transactions`
 * (categoría "Alquileres"); la retención NO es una transacción. Al cerrar el alquiler (devuelto,
 * retenido o no devuelto) el depósito sale de la retención.
 *
 * Todo por tenant (RLS). Cada retención es rastreable al alquiler que la originó.
 */
export async function getRentalDeposits(
  tenantId: string,
  filters: { clientId?: string; productId?: string } = {},
) {
  const rows = await prisma.rental.findMany({
    where: {
      tenantId,
      status:  'active',
      deposit: { gt: 0 },
      ...(filters.clientId  ? { clientId:  filters.clientId }  : {}),
      ...(filters.productId ? { productId: filters.productId } : {}),
    },
    select: {
      id: true, deposit: true, quantity: true, rentedAt: true, dueAt: true,
      clientId: true, productId: true,
      client:  { select: { name: true } },
      product: { select: { sku: true, name: true, unit: true } },
      branch:  { select: { name: true } },
    },
    orderBy: { rentedAt: 'desc' },
  })

  const items = rows.map((r) => ({
    rentalId:   r.id,
    deposit:    num(r.deposit),
    quantity:   num(r.quantity),
    rentedAt:   r.rentedAt,
    dueAt:      r.dueAt,
    clientId:   r.clientId,
    clientName: r.client?.name ?? 'Sin cliente',
    productId:  r.productId,
    productName: r.product.name,
    productSku:  r.product.sku,
    branchName:  r.branch.name,
  }))

  const totalHeld = items.reduce((s, r) => s + r.deposit, 0)

  // Agrupación por cliente y por producto (retención = total que debo devolver a cada uno).
  const group = (keyId: 'clientId' | 'productId', keyName: 'clientName' | 'productName') => {
    const map = new Map<string, { id: string | null; name: string; total: number; count: number }>()
    for (const r of items) {
      const id = (r[keyId] as string | null) ?? '—'
      const cur = map.get(id) ?? { id: r[keyId] as string | null, name: r[keyName], total: 0, count: 0 }
      cur.total += r.deposit; cur.count += 1
      map.set(id, cur)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }

  // Ingreso por alquiler acumulado (categoría "Alquileres") — para verlo SEPARADO de la retención.
  const incomeAgg = await prisma.transaction.aggregate({
    where:  { tenantId, type: 'income', category: 'Alquileres' },
    _sum:   { amount: true },
  })

  return {
    totalHeld,
    count:        items.length,
    byClient:     group('clientId', 'clientName'),
    byProduct:    group('productId', 'productName'),
    items,
    rentalIncome: num(incomeAgg._sum.amount),
  }
}
