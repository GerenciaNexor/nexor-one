import { prisma } from '../../../lib/prisma'
import type { Prisma } from '@prisma/client'
import { ensureGenericClient } from '../../ari/clients/service'
import type { CreateRentalInput, ReturnRentalInput, MarkNotReturnedInput, RentalQuery } from './schema'

function num(v: unknown): number {
  const n = parseFloat(String(v))
  return isNaN(n) ? 0 : n
}
function numN(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
}
function safe(v: unknown): number {
  return Math.max(0, num(v))
}

const RENTAL_SELECT = {
  id: true, tenantId: true, productId: true, branchId: true, clientId: true, userId: true,
  quantity: true, status: true, chargeType: true, fixedAmount: true, dailyRate: true, deposit: true,
  rentedAt: true, dueAt: true, returnedAt: true, returnedBy: true, productCondition: true,
  depositRetained: true, depositReason: true, chargeTotal: true, rentalDays: true,
  notes: true, createdAt: true, updatedAt: true,
  product: { select: { sku: true, name: true, unit: true, salePrice: true } },
  branch:  { select: { name: true } },
  client:  { select: { name: true } },
  user:    { select: { name: true } },
  returnedByUser: { select: { name: true } },
} as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toApi(r: any) {
  return {
    ...r,
    quantity:        num(r.quantity),
    fixedAmount:     numN(r.fixedAmount),
    dailyRate:       numN(r.dailyRate),
    deposit:         num(r.deposit),
    depositRetained: num(r.depositRetained),
    chargeTotal:     numN(r.chargeTotal),
    product:         r.product ? { ...r.product, salePrice: numN(r.product.salePrice) } : r.product,
  }
}

const DAY_MS = 86_400_000

/**
 * HU-160 — Cálculo del cobro del alquiler al cerrar:
 *  - `fixed`: el monto fijo pactado.
 *  - `daily`: tarifa diaria × días transcurridos (mínimo 1 día).
 * `days` se calcula desde `rentedAt` hasta `at` (redondeo hacia arriba).
 */
export function computeRentalCharge(
  r: { chargeType: string; fixedAmount: unknown; dailyRate: unknown; rentedAt: Date },
  at: Date,
): { days: number; chargeTotal: number } {
  const days = Math.max(1, Math.ceil((at.getTime() - new Date(r.rentedAt).getTime()) / DAY_MS))
  const chargeTotal = r.chargeType === 'daily' ? num(r.dailyRate) * days : num(r.fixedAmount)
  return { days, chargeTotal }
}

/** Detalle de un alquiler + preview de cierre (para la pantalla de devolución de HU-160). */
export async function getRental(tenantId: string, rentalId: string) {
  const rental = await prisma.rental.findFirst({ where: { id: rentalId, tenantId }, select: RENTAL_SELECT })
  if (!rental) throw { statusCode: 404, message: 'Alquiler no encontrado', code: 'NOT_FOUND' }
  const now = new Date()
  const preview = rental.status === 'active'
    ? (() => {
        const { days, chargeTotal } = computeRentalCharge(rental, now)
        const sp = numN(rental.product.salePrice)
        return {
          daysElapsed: days,
          chargeTotal,
          depositLeft: num(rental.deposit),
          // HU-161 — sugerencia de cobro si el producto no se devuelve (venta): precio × cantidad.
          saleSuggestion: sp != null ? sp * num(rental.quantity) : null,
        }
      })()
    : null
  return { ...toApi(rental), preview }
}

/**
 * HU-162 — Categoría de ingreso "Alquileres" (idempotente). Así los ingresos por alquiler
 * (precio y depósito retenido) se agrupan en los reportes de VERA por su categoría real,
 * separados del resto. Único por (tenant, name); ante carrera (P2002) se relee.
 */
async function ensureRentalCategory(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
  const existing = await tx.transactionCategory.findFirst({ where: { tenantId, name: 'Alquileres' }, select: { id: true } })
  if (existing) return existing.id
  try {
    return (await tx.transactionCategory.create({ data: { tenantId, name: 'Alquileres', type: 'income' }, select: { id: true } })).id
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      const again = await tx.transactionCategory.findFirst({ where: { tenantId, name: 'Alquileres' }, select: { id: true } })
      if (again) return again.id
    }
    throw err
  }
}

/** HU-159 — Clientes para el selector de alquiler (accesible desde KIRA, sin depender de ARI).
 *  Garantiza el "Consumidor final" (HU-154) y lo lista primero. */
export async function listRentalClients(tenantId: string) {
  await ensureGenericClient(prisma, tenantId)
  const data = await prisma.client.findMany({
    where:   { tenantId, isActive: true },
    select:  { id: true, name: true, isGeneric: true },
    orderBy: [{ isGeneric: 'desc' }, { name: 'asc' }],
  })
  return { data, total: data.length }
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

    const due = new Date(input.dueAt)
    if (isNaN(due.getTime())) throw { statusCode: 400, message: 'Fecha de retorno inválida', code: 'VALIDATION_ERROR' }

    const rental = await tx.rental.create({
      data: {
        tenantId,
        productId:   input.productId,
        branchId:    input.branchId,
        clientId:    input.clientId ?? null,
        userId,
        quantity:    input.quantity,
        status:      'active',
        chargeType:  input.chargeType,
        // Solo se guarda el precio del tipo de cobro elegido; el otro queda null.
        fixedAmount: input.chargeType === 'fixed' ? input.fixedAmount : null,
        dailyRate:   input.chargeType === 'daily' ? input.dailyRate   : null,
        deposit:     input.deposit,
        dueAt:       due,
        notes:       input.notes ?? null,
      },
      select: RENTAL_SELECT,
    })

    // El total NO cambia; sube lo alquilado → baja el disponible. (CHECK rented ≤ total garantizado.)
    await tx.stock.update({
      where: { productId_branchId: { productId: input.productId, branchId: input.branchId } },
      data:  { rentedQuantity: rented + input.quantity },
    })

    // HU-163 — recordatorio AUTOMÁTICO de devolución (reutiliza el motor HU-156/157). Se asocia
    // al alquiler vía relatedType/relatedId → enlaza a /kira/rentals; aparece en Inicio, Notificaciones
    // y se gestiona desde Agenda como cualquier recordatorio. Nivel por defecto: urgente.
    await tx.reminder.create({
      data: {
        tenantId,
        userId,
        title:       `Devolver alquiler: ${rental.product.name}`,
        description: `${input.quantity} ${rental.product.unit}${rental.client?.name ? ` — ${rental.client.name}` : ''}`,
        remindAt:    due,
        alertLevel:  'urgent',
        recurrence:  'none',
        relatedType: 'rental',
        relatedId:   rental.id,
      },
    })

    return toApi(rental)
  })
}

/** HU-163 — Cierra el recordatorio de devolución de un alquiler (al devolver o marcar no devuelto). */
async function closeRentalReminder(tx: Prisma.TransactionClient, tenantId: string, rentalId: string): Promise<void> {
  await tx.reminder.updateMany({
    where: { tenantId, relatedType: 'rental', relatedId: rentalId, isActive: true },
    data:  { status: 'done', isActive: false, completedAt: new Date() },
  })
}

/**
 * HU-158/160 — DEVOLUCIÓN de un alquiler: cierra el alquiler, libera el disponible y resuelve el depósito.
 *  - Sube el disponible (baja `rentedQuantity`); el TOTAL nunca cambia (HU-158).
 *  - Calcula el cobro (fijo, o tarifa×días) y lo guarda como snapshot (`chargeTotal`/`rentalDays`).
 *  - Resuelve el depósito: `retained` (con motivo) → **ingreso en VERA**; lo devuelto no genera ingreso.
 *  - Trazabilidad: `returnedBy`, `returnedAt`, `productCondition`, `depositRetained`, `depositReason`.
 */
export async function returnRental(tenantId: string, userId: string, rentalId: string, input: ReturnRentalInput) {
  return prisma.$transaction(async (tx) => {
    const rental = await tx.rental.findFirst({
      where:  { id: rentalId, tenantId },
      select: {
        id: true, status: true, productId: true, branchId: true, quantity: true,
        chargeType: true, fixedAmount: true, dailyRate: true, deposit: true, rentedAt: true,
        product: { select: { name: true } },
      },
    })
    if (!rental) throw { statusCode: 404, message: 'Alquiler no encontrado', code: 'NOT_FOUND' }
    if (rental.status !== 'active') {
      throw { statusCode: 409, message: 'Este alquiler ya fue devuelto', code: 'ALREADY_RETURNED' }
    }

    const now = new Date()
    const deposit = num(rental.deposit)
    const { days, chargeTotal } = computeRentalCharge(rental, now)

    // Resolución del depósito: retenido (≤ depósito) o devuelto (0).
    const retained = input.depositResolution === 'retained' ? (input.retainedAmount ?? 0) : 0
    if (retained > deposit) {
      throw { statusCode: 400, message: `No puedes retener más que el depósito ($${deposit}).`, code: 'RETAINED_EXCEEDS_DEPOSIT' }
    }

    const updated = await tx.rental.update({
      where: { id: rentalId },
      data:  {
        status:           'returned',
        returnedAt:       now,
        returnedBy:       userId,
        productCondition: input.productCondition ?? 'good',
        depositRetained:  retained,
        depositReason:    retained > 0 ? (input.reason ?? null) : null,
        chargeTotal,
        rentalDays:       rental.chargeType === 'daily' ? days : null,
        ...(input.notes !== undefined && input.notes !== null ? { notes: input.notes } : {}),
      },
      select: RENTAL_SELECT,
    })

    // Sube el disponible; el total no cambia.
    const stock = await tx.stock.findUnique({
      where:  { productId_branchId: { productId: rental.productId, branchId: rental.branchId } },
      select: { rentedQuantity: true },
    })
    const rented = stock ? safe(stock.rentedQuantity) : 0
    await tx.stock.update({
      where: { productId_branchId: { productId: rental.productId, branchId: rental.branchId } },
      data:  { rentedQuantity: Math.max(0, rented - num(rental.quantity)) },
    })

    // HU-163 — el alquiler se cerró: su recordatorio de devolución se marca hecho.
    await closeRentalReminder(tx, tenantId, rentalId)

    // VERA (HU-162):
    //  - el PRECIO del alquiler es INGRESO de la empresa (categoría "Alquileres").
    //  - lo RETENIDO del depósito pasa a INGRESO (con motivo); lo devuelto NO es ingreso.
    // El depósito NO se registra como ingreso: mientras está activo es RETENCIÓN (derivada de rentals).
    const catId = await ensureRentalCategory(tx, tenantId)
    if (chargeTotal > 0) {
      await tx.transaction.create({
        data: {
          tenantId, branchId: rental.branchId, categoryId: catId, type: 'income',
          amount: chargeTotal, currency: 'COP',
          description: `Alquiler — ${rental.product.name}`,
          category: 'Alquileres', referenceType: 'rental', referenceId: rentalId, date: now,
        },
      })
    }
    if (retained > 0) {
      await tx.transaction.create({
        data: {
          tenantId, branchId: rental.branchId, categoryId: catId, type: 'income',
          amount: retained, currency: 'COP',
          description: `Depósito retenido — ${rental.product.name}${input.reason ? `: ${input.reason}` : ''}`,
          category: 'Alquileres', referenceType: 'rental', referenceId: rentalId, date: now,
        },
      })
    }

    return { ...toApi(updated), depositReturned: deposit - retained, chargeTotal, daysElapsed: days }
  })
}

/**
 * HU-161 — Producto NO devuelto → se convierte en VENTA (distinto de la devolución de HU-160):
 *  - El stock TOTAL baja de verdad (la unidad ya no volverá); el alquilado también baja el mismo qty,
 *    así el disponible no cambia (esa unidad nunca estuvo disponible). Se registra la salida definitiva
 *    en `stock_movements` (motivo `venta`, append-only) — trazabilidad HU-128.
 *  - Se cobra el producto completo (precio de venta × cantidad, o un monto indicado); el DEPÓSITO
 *    se aplica como parte del pago (no vuelve al cliente).
 *  - VERA: ingreso por la venta (categoría "Ventas"); el depósito aplicado queda reflejado en la nota.
 *  - El alquiler queda `not_returned` con su trazabilidad.
 */
export async function markNotReturned(tenantId: string, userId: string, rentalId: string, input: MarkNotReturnedInput) {
  return prisma.$transaction(async (tx) => {
    const rental = await tx.rental.findFirst({
      where:  { id: rentalId, tenantId },
      select: {
        id: true, status: true, productId: true, branchId: true, quantity: true, deposit: true,
        product: { select: { name: true, salePrice: true, costPrice: true } },
      },
    })
    if (!rental) throw { statusCode: 404, message: 'Alquiler no encontrado', code: 'NOT_FOUND' }
    if (rental.status !== 'active') throw { statusCode: 409, message: 'Este alquiler ya está cerrado', code: 'RENTAL_CLOSED' }

    const qty       = num(rental.quantity)
    const deposit   = num(rental.deposit)
    const salePrice = numN(rental.product.salePrice)
    const saleTotal = input.saleAmount ?? (salePrice != null ? salePrice * qty : null)
    if (saleTotal == null || saleTotal <= 0) {
      throw { statusCode: 400, message: 'Indica el monto de la venta: el producto no tiene precio de venta.', code: 'SALE_AMOUNT_REQUIRED' }
    }

    const now = new Date()

    // Stock: total y alquilado bajan el mismo qty (disponible sin cambio). Un solo UPDATE
    // (el CHECK rented ≤ total se evalúa sobre la fila final: (rented−qty) ≤ (total−qty) ✔).
    const stock = await tx.stock.findUnique({
      where:  { productId_branchId: { productId: rental.productId, branchId: rental.branchId } },
      select: { quantity: true, rentedQuantity: true },
    })
    const before = stock ? safe(stock.quantity) : 0
    const after  = before - qty
    if (after < 0) throw { statusCode: 409, message: 'Inconsistencia de stock al cerrar el alquiler', code: 'INSUFFICIENT_STOCK' }
    await tx.stock.update({
      where: { productId_branchId: { productId: rental.productId, branchId: rental.branchId } },
      data:  { quantity: { decrement: qty }, rentedQuantity: { decrement: qty } },
    })

    // Salida definitiva en stock_movements (append-only) — la unidad salió por venta.
    await tx.stockMovement.create({
      data: {
        tenantId, productId: rental.productId, branchId: rental.branchId, userId,
        type: 'salida', reason: 'venta',
        quantity: qty, quantityBefore: before, quantityAfter: after,
        referenceType: 'rental', referenceId: rentalId,
        salePriceFrozen: saleTotal / qty,
        costPriceFrozen: rental.product.costPrice ?? null,
        notes: 'Alquiler no devuelto — venta',
      },
    })

    // El alquiler pasa a "nunca devuelto"; el depósito se aplica al pago (no vuelve al cliente).
    const updated = await tx.rental.update({
      where: { id: rentalId },
      data:  {
        status:          'not_returned',
        returnedAt:      now,
        returnedBy:      userId,
        depositRetained: deposit,
        depositReason:   'Producto no devuelto — aplicado a la venta',
        chargeTotal:     saleTotal,
        ...(input.notes !== undefined && input.notes !== null ? { notes: input.notes } : {}),
      },
      select: RENTAL_SELECT,
    })

    // HU-163 — el alquiler se cerró (no devuelto): su recordatorio de devolución se marca hecho.
    await closeRentalReminder(tx, tenantId, rentalId)

    // VERA — ingreso por la venta (el depósito ya aplicado queda reflejado en la nota).
    const cat = await tx.transactionCategory.findFirst({ where: { tenantId, name: 'Ventas', isActive: true }, select: { id: true } })
    await tx.transaction.create({
      data: {
        tenantId,
        branchId:      rental.branchId,
        categoryId:    cat?.id ?? null,
        type:          'income',
        amount:        saleTotal,
        currency:      'COP',
        description:   `Venta por alquiler no devuelto — ${rental.product.name}${deposit > 0 ? ` (depósito aplicado $${deposit})` : ''}`,
        category:      'Ventas',
        referenceType: 'rental',
        referenceId:   rentalId,
        date:          now,
      },
    })

    return { ...toApi(updated), saleTotal, depositApplied: deposit, netCollected: Math.max(0, saleTotal - deposit) }
  })
}

export async function listRentals(tenantId: string, query: RentalQuery) {
  const where: Prisma.RentalWhereInput = {
    tenantId,
    ...(query.status    ? { status:    query.status }    : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.branchId  ? { branchId:  query.branchId }  : {}),
    ...(query.clientId  ? { clientId:  query.clientId }  : {}),
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
