import { prisma } from '../../../lib/prisma'

const num = (v: unknown): number => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n }

interface GroupRow { id: string | null; name: string; total: number; count: number }

/**
 * HU-177 — VERA para el alquiler ENTRANTE (espejo de HU-162, del lado del dinero PROPIO):
 *
 *  - **Retención por cobrar** (ACTIVO recuperable): depósito propio dejado en garantía que está
 *    AFUERA y se espera recuperar. NO es gasto todavía. Es una vista DERIVADA de los alquileres
 *    entrantes ACTIVOS con `deposit > 0` — NO es una transacción. Al devolver (HU-176) sale de la
 *    retención: si se recupera, sin gasto; si el tercero lo retiene, se vuelve gasto real.
 *  - **Gasto real** (EGRESO): el costo del alquiler (`referenceType 'incoming_rental'`) y el depósito
 *    perdido (`referenceType 'incoming_rental_deposit'`). Viven en `transactions` (categoría
 *    "Alquileres pagados"). Se muestran SEPARADOS de la retención — nunca se suman como lo mismo.
 *
 * Todo por tenant (RLS). Cada retención es rastreable al alquiler entrante que la originó.
 * Filtros: general, por proyecto (`project`, contiene) o por tercero (`supplierId`).
 */
export async function getIncomingRentalDeposits(
  tenantId: string,
  filters: { project?: string; supplierId?: string } = {},
) {
  const rows = await prisma.incomingRental.findMany({
    where: {
      tenantId,
      status:  'active',
      deposit: { gt: 0 },
      ...(filters.project    ? { project: { contains: filters.project, mode: 'insensitive' } } : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    },
    select: {
      id: true, deposit: true, quantity: true, project: true, description: true,
      returnDate: true, createdAt: true, supplierId: true, thirdPartyName: true,
      supplier: { select: { name: true } },
      branch:   { select: { name: true } },
    },
    orderBy: { returnDate: 'asc' },
  })

  const items = rows.map((r) => ({
    incomingRentalId: r.id,
    deposit:          num(r.deposit),
    quantity:         num(r.quantity),
    project:          r.project,
    description:      r.description,
    returnDate:       r.returnDate,
    createdAt:        r.createdAt,
    thirdPartyId:     r.supplierId ?? null,
    thirdParty:       r.supplier?.name ?? r.thirdPartyName ?? 'Tercero',
    branchName:       r.branch?.name ?? null,
  }))

  const totalOutstanding = items.reduce((s, r) => s + r.deposit, 0)

  // Agrupaciones de la retención (dinero propio afuera) por proyecto y por tercero.
  const groupBy = (keyId: (i: typeof items[number]) => string | null, keyName: (i: typeof items[number]) => string): GroupRow[] => {
    const map = new Map<string, GroupRow>()
    for (const r of items) {
      const id = keyId(r)
      const mapKey = id ?? `name:${keyName(r)}`
      const cur = map.get(mapKey) ?? { id, name: keyName(r), total: 0, count: 0 }
      cur.total += r.deposit; cur.count += 1
      map.set(mapKey, cur)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }

  // Gasto REAL (egreso), separado de la retención — por tipo de referencia.
  const [costAgg, lostAgg] = await Promise.all([
    prisma.transaction.aggregate({ where: { tenantId, type: 'expense', referenceType: 'incoming_rental' },         _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { tenantId, type: 'expense', referenceType: 'incoming_rental_deposit' }, _sum: { amount: true } }),
  ])

  return {
    totalOutstanding,                     // retención por cobrar (recuperable) — NO es gasto
    count:             items.length,
    byProject:         groupBy((i) => i.project,      (i) => i.project),
    byThirdParty:      groupBy((i) => i.thirdPartyId, (i) => i.thirdParty),
    items,
    rentalCostExpense:  num(costAgg._sum.amount),   // egreso: costo de los alquileres pagados
    depositLostExpense: num(lostAgg._sum.amount),   // egreso: depósitos perdidos (retención vuelta gasto)
  }
}
