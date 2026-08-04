import { prisma } from '../../../lib/prisma'
import type { Prisma } from '@prisma/client'
import { businessToday } from '../../../lib/dates'
import type { CreateIncomingRentalInput, IncomingRentalQuery } from './schema'

const num = (v: unknown): number => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n }

/** Categoría de EGRESO 'Alquileres pagados' (idempotente, maneja carrera P2002). */
async function ensureIncomingRentalCategory(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
  const name = 'Alquileres pagados'
  const existing = await tx.transactionCategory.findFirst({ where: { tenantId, name }, select: { id: true } })
  if (existing) return existing.id
  try {
    return (await tx.transactionCategory.create({ data: { tenantId, name, type: 'expense' }, select: { id: true } })).id
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      const again = await tx.transactionCategory.findFirst({ where: { tenantId, name }, select: { id: true } })
      if (again) return again.id
    }
    throw err
  }
}

interface RentalRow {
  id: string; status: string; description: string; quantity: Prisma.Decimal | number; project: string
  returnDate: Date; rentalCost: Prisma.Decimal | number; deposit: Prisma.Decimal | number
  supplierId: string | null; thirdPartyName: string | null; thirdPartyContact: string | null
  branchId: string | null; notes: string | null; returnedAt: Date | null; createdAt: Date
  supplier?: { name: string } | null; branch?: { name: string } | null
}

/** Forma pública de un alquiler entrante: decimales a número y etiqueta del tercero. */
function shape(r: RentalRow) {
  return {
    id:                 r.id,
    status:             r.status,
    description:        r.description,
    quantity:           num(r.quantity),
    project:            r.project,
    returnDate:         r.returnDate,
    rentalCost:         num(r.rentalCost),
    deposit:            num(r.deposit),
    supplierId:         r.supplierId ?? null,
    thirdParty:         r.supplier?.name ?? r.thirdPartyName ?? null, // proveedor o entidad suelta
    thirdPartyContact:  r.thirdPartyContact ?? null,
    isExistingSupplier: !!r.supplierId,
    branchId:           r.branchId ?? null,
    branchName:         r.branch?.name ?? null,
    notes:              r.notes ?? null,
    returnedAt:         r.returnedAt ?? null,
    createdAt:          r.createdAt,
  }
}

/**
 * HU-175 — Registrar un alquiler entrante. El producto NO entra a KIRA (ni stock, ni vendible,
 * ni alquilable): es un registro de "lo prestado". El costo se asienta como egreso en VERA
 * (referenceType 'incoming_rental'); el depósito NO es transacción: queda como retención por
 * cobrar (dinero propio afuera) derivable del registro (vista de VERA en HU-177).
 */
export async function createIncomingRental(tenantId: string, userId: string, input: CreateIncomingRentalInput) {
  return prisma.$transaction(async (tx) => {
    // Tercero: proveedor existente o entidad nueva suelta.
    let supplierId: string | null = null
    let supplierName: string | null = null
    if (input.supplierId) {
      const s = await tx.supplier.findFirst({ where: { id: input.supplierId, tenantId, isActive: true }, select: { id: true, name: true } })
      if (!s) throw { statusCode: 404, message: 'Proveedor no encontrado en tu empresa', code: 'SUPPLIER_NOT_FOUND' }
      supplierId = s.id; supplierName = s.name
    }

    // Sucursal (opcional).
    let branchId: string | null = null
    if (input.branchId) {
      const b = await tx.branch.findFirst({ where: { id: input.branchId, tenantId, isActive: true }, select: { id: true } })
      if (!b) throw { statusCode: 400, message: 'Sucursal no encontrada en tu empresa', code: 'BRANCH_NOT_FOUND' }
      branchId = b.id
    }

    const thirdPartyLabel = supplierName ?? input.thirdPartyName!.trim()

    const rental = await tx.incomingRental.create({
      data: {
        tenantId, branchId, userId,
        supplierId,
        thirdPartyName:    supplierId ? null : input.thirdPartyName!.trim(),
        thirdPartyContact: supplierId ? null : (input.thirdPartyContact ?? null),
        description: input.description.trim(),
        quantity:    input.quantity,
        project:     input.project.trim(),
        returnDate:  new Date(`${input.returnDate}T00:00:00.000Z`),
        rentalCost:  input.rentalCost,
        deposit:     input.deposit ?? 0,
        status:      'active',
        notes:       input.notes ?? null,
      },
    })

    // Costo del alquiler → EGRESO en VERA. (El producto no es de la empresa: no toca KIRA.)
    if (input.rentalCost > 0) {
      const categoryId = await ensureIncomingRentalCategory(tx, tenantId)
      await tx.transaction.create({
        data: {
          tenantId, branchId, categoryId, type: 'expense', amount: input.rentalCost, currency: 'COP',
          description:   `Alquiler entrante — ${input.description.trim()} (${thirdPartyLabel})`,
          category:      'Alquileres pagados',
          referenceType: 'incoming_rental', referenceId: rental.id,
          date: businessToday(), isManual: true,
        },
      })
    }
    // El depósito NO se asienta como transacción: es retención por cobrar derivada del registro.

    return shape({ ...rental, supplier: supplierName ? { name: supplierName } : null, branch: null })
  })
}

/** HU-175 — Historial consultable de alquileres entrantes (para la devolución, HU-176). */
export async function listIncomingRentals(tenantId: string, q: IncomingRentalQuery) {
  const where: Prisma.IncomingRentalWhereInput = {
    tenantId,
    ...(q.status ? { status: q.status } : {}),
    ...(q.supplierId ? { supplierId: q.supplierId } : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.incomingRental.findMany({
      where,
      include: { supplier: { select: { name: true } }, branch: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit, take: q.limit,
    }),
    prisma.incomingRental.count({ where }),
  ])
  return { data: rows.map(shape), total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) }
}

/** HU-175 — Detalle de un alquiler entrante (todos sus datos para la devolución). */
export async function getIncomingRental(tenantId: string, id: string) {
  const r = await prisma.incomingRental.findFirst({
    where: { id, tenantId },
    include: { supplier: { select: { name: true } }, branch: { select: { name: true } } },
  })
  if (!r) throw { statusCode: 404, message: 'Alquiler entrante no encontrado', code: 'INCOMING_RENTAL_NOT_FOUND' }
  return shape(r)
}
