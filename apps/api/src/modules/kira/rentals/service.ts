import { prisma } from '../../../lib/prisma'
import type { Prisma } from '@prisma/client'
import type { CreateRentalInput, ReturnRentalInput, RentalQuery } from './schema'

function num(v: unknown): number {
  const n = parseFloat(String(v))
  return isNaN(n) ? 0 : n
}
function safe(v: unknown): number {
  return Math.max(0, num(v))
}

const RENTAL_SELECT = {
  id: true, tenantId: true, productId: true, branchId: true, clientId: true, userId: true,
  quantity: true, status: true, rentedAt: true, dueAt: true, returnedAt: true, notes: true,
  createdAt: true, updatedAt: true,
  product: { select: { sku: true, name: true, unit: true } },
  branch:  { select: { name: true } },
  client:  { select: { name: true } },
  user:    { select: { name: true } },
} as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toApi(r: any) {
  return { ...r, quantity: num(r.quantity) }
}

/**
 * HU-158 — Registra un ALQUILER (salida temporal). Reglas duras:
 *   - El producto debe estar marcado como alquilable.
 *   - Solo puede tomar del DISPONIBLE (= total − alquilado); jamás de unidades ya
 *     vendidas/alquiladas.
 *   - NO reduce el total; incrementa `rentedQuantity` (baja el disponible).
 * Todo en una transacción para que la validación y la reserva compartan la misma foto.
 */
export async function createRental(tenantId: string, userId: string, input: CreateRentalInput) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where:  { id: input.productId, tenantId, isActive: true },
      select: { id: true, name: true, isRentable: true },
    })
    if (!product) throw { statusCode: 404, message: 'Producto no encontrado o inactivo', code: 'PRODUCT_NOT_FOUND' }
    if (!product.isRentable) {
      throw { statusCode: 409, message: `"${product.name}" no está marcado como alquilable.`, code: 'PRODUCT_NOT_RENTABLE' }
    }

    const branch = await tx.branch.findFirst({ where: { id: input.branchId, tenantId, isActive: true }, select: { id: true } })
    if (!branch) throw { statusCode: 404, message: 'Sucursal no encontrada', code: 'BRANCH_NOT_FOUND' }

    if (input.clientId) {
      const client = await tx.client.findFirst({ where: { id: input.clientId, tenantId }, select: { id: true } })
      if (!client) throw { statusCode: 400, message: 'Cliente no encontrado en tu empresa', code: 'VALIDATION_ERROR' }
    }

    const stock = await tx.stock.findUnique({
      where:  { productId_branchId: { productId: input.productId, branchId: input.branchId } },
      select: { quantity: true, rentedQuantity: true },
    })
    const total     = stock ? safe(stock.quantity) : 0
    const rented    = stock ? safe(stock.rentedQuantity) : 0
    const available = Math.max(0, total - rented)

    if (input.quantity > available) {
      throw {
        statusCode: 409,
        message: `Disponible ${available}, solicitado ${input.quantity}. No puedes alquilar unidades ya vendidas o alquiladas.`,
        code: 'INSUFFICIENT_AVAILABLE',
      }
    }

    const rental = await tx.rental.create({
      data: {
        tenantId,
        productId: input.productId,
        branchId:  input.branchId,
        clientId:  input.clientId ?? null,
        userId,
        quantity:  input.quantity,
        status:    'active',
        dueAt:     input.dueAt ? new Date(input.dueAt) : null,
        notes:     input.notes ?? null,
      },
      select: RENTAL_SELECT,
    })

    // El total NO cambia; sube lo alquilado → baja el disponible. (CHECK rented ≤ total garantizado.)
    await tx.stock.update({
      where: { productId_branchId: { productId: input.productId, branchId: input.branchId } },
      data:  { rentedQuantity: rented + input.quantity },
    })

    return toApi(rental)
  })
}

/**
 * HU-158 — Registra la DEVOLUCIÓN de un alquiler: cierra el alquiler y libera el disponible.
 * El total nunca cambió; solo baja `rentedQuantity`.
 */
export async function returnRental(tenantId: string, rentalId: string, input: ReturnRentalInput = {}) {
  return prisma.$transaction(async (tx) => {
    const rental = await tx.rental.findFirst({
      where:  { id: rentalId, tenantId },
      select: { id: true, status: true, productId: true, branchId: true, quantity: true, notes: true },
    })
    if (!rental) throw { statusCode: 404, message: 'Alquiler no encontrado', code: 'NOT_FOUND' }
    if (rental.status !== 'active') {
      throw { statusCode: 409, message: 'Este alquiler ya fue devuelto', code: 'ALREADY_RETURNED' }
    }

    const updated = await tx.rental.update({
      where: { id: rentalId },
      data:  {
        status:     'returned',
        returnedAt: new Date(),
        ...(input.notes !== undefined && input.notes !== null ? { notes: input.notes } : {}),
      },
      select: RENTAL_SELECT,
    })

    const stock = await tx.stock.findUnique({
      where:  { productId_branchId: { productId: rental.productId, branchId: rental.branchId } },
      select: { rentedQuantity: true },
    })
    const rented = stock ? safe(stock.rentedQuantity) : 0
    await tx.stock.update({
      where: { productId_branchId: { productId: rental.productId, branchId: rental.branchId } },
      data:  { rentedQuantity: Math.max(0, rented - num(rental.quantity)) },
    })

    return toApi(updated)
  })
}

export async function listRentals(tenantId: string, query: RentalQuery) {
  const where: Prisma.RentalWhereInput = {
    tenantId,
    ...(query.status    ? { status:    query.status }    : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.branchId  ? { branchId:  query.branchId }  : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.rental.findMany({
      where, select: RENTAL_SELECT,
      orderBy: [{ status: 'asc' }, { rentedAt: 'desc' }],
      skip: (query.page - 1) * query.limit, take: query.limit,
    }),
    prisma.rental.count({ where }),
  ])
  return { data: rows.map(toApi), total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) }
}
