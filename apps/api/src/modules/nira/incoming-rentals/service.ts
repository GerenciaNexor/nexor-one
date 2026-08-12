import { prisma } from '../../../lib/prisma'
import type { Prisma } from '@prisma/client'
import { businessToday } from '../../../lib/dates'
import type { CreateIncomingRentalInput, IncomingRentalQuery, ReturnIncomingRentalInput } from './schema'

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
  id: string; status: string; description: string; quantity: Prisma.Decimal | number
  project: string | null; projectId: string | null; proyecto?: { name: string } | null
  returnDate: Date; rentalCost: Prisma.Decimal | number; deposit: Prisma.Decimal | number
  supplierId: string | null; thirdPartyName: string | null; thirdPartyContact: string | null
  branchId: string | null; notes: string | null; returnedAt: Date | null
  depositLost: Prisma.Decimal | number; depositReason: string | null; createdAt: Date
  supplier?: { name: string } | null; branch?: { name: string } | null; returnedByUser?: { name: string } | null
}

/** Forma pública de un alquiler entrante: decimales a número y etiqueta del tercero. */
function shape(r: RentalRow) {
  const deposit = num(r.deposit)
  const depositLost = num(r.depositLost)
  return {
    id:                 r.id,
    status:             r.status,
    description:        r.description,
    quantity:           num(r.quantity),
    project:            r.proyecto?.name ?? r.project ?? null, // etiqueta: proyecto vinculado o texto legacy
    projectId:          r.projectId ?? null,
    returnDate:         r.returnDate,
    rentalCost:         num(r.rentalCost),
    deposit,
    supplierId:         r.supplierId ?? null,
    thirdParty:         r.supplier?.name ?? r.thirdPartyName ?? null, // proveedor o entidad suelta
    thirdPartyContact:  r.thirdPartyContact ?? null,
    isExistingSupplier: !!r.supplierId,
    branchId:           r.branchId ?? null,
    branchName:         r.branch?.name ?? null,
    notes:              r.notes ?? null,
    // Devolución (HU-176)
    returnedAt:         r.returnedAt ?? null,
    returnedByName:     r.returnedByUser?.name ?? null,
    depositLost,
    depositRecovered:   Math.max(0, deposit - depositLost),
    depositReason:      r.depositReason ?? null,
    createdAt:          r.createdAt,
  }
}

const LIST_INCLUDE = {
  supplier:       { select: { name: true } },
  branch:         { select: { name: true } },
  returnedByUser: { select: { name: true } },
  proyecto:       { select: { name: true } }, // HU-199 — nombre del proyecto vinculado
} as const

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
    const returnDateObj = new Date(`${input.returnDate}T00:00:00.000Z`)
    const description = input.description.trim()

    // HU-199 — vínculo real (opcional) a un proyecto del mismo tenant. Se denormaliza el nombre en la
    // columna `project` (texto) para la vista/legacy; el vínculo canónico es `projectId`.
    let projectId: string | null = null
    let projectLabel: string | null = input.project?.trim() || null
    if (input.projectId) {
      const proj = await tx.proyecto.findFirst({ where: { id: input.projectId, tenantId }, select: { id: true, name: true } })
      if (!proj) throw { statusCode: 400, message: 'El proyecto no existe en tu empresa', code: 'PROJECT_NOT_FOUND' }
      projectId = proj.id; projectLabel = proj.name
    }

    const rental = await tx.incomingRental.create({
      data: {
        tenantId, branchId, userId,
        supplierId,
        thirdPartyName:    supplierId ? null : input.thirdPartyName!.trim(),
        thirdPartyContact: supplierId ? null : (input.thirdPartyContact ?? null),
        description,
        quantity:    input.quantity,
        project:     projectLabel,
        projectId,
        returnDate:  returnDateObj,
        rentalCost:  input.rentalCost,
        deposit:     input.deposit ?? 0,
        status:      'active',
        notes:       input.notes ?? null,
      },
    })

    // HU-178 — recordatorio AUTOMÁTICO de devolución (reutiliza el motor HU-156/157), espejo de
    // HU-163 pero en el otro sentido: aquí la empresa es quien DEBE devolver al tercero. Se asocia
    // al alquiler vía relatedType/relatedId; aparece en Inicio, Notificaciones y se gestiona en Agenda.
    await tx.reminder.create({
      data: {
        tenantId, userId,
        title:       `Devolver alquiler entrante: ${description}`,
        description: `${input.quantity} und — devolver a ${thirdPartyLabel}${projectLabel ? ` (proyecto: ${projectLabel})` : ''}`,
        remindAt:    returnDateObj,
        alertLevel:  'urgent',
        recurrence:  'none',
        relatedType: 'incoming_rental',
        relatedId:   rental.id,
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
          projectId, // HU-199 — el egreso cuenta en el consumo del proyecto asignado
          date: businessToday(), isManual: true,
        },
      })
    }
    // El depósito NO se asienta como transacción: es retención por cobrar derivada del registro.

    return shape({ ...rental, supplier: supplierName ? { name: supplierName } : null, branch: null })
  })
}

/**
 * HU-175/176 — Vista global de "lo prestado": historial consultable de alquileres entrantes.
 * Por defecto (sin `status`) trae todo; filtros opcionales por proyecto, tercero (búsqueda),
 * proveedor y "próximos a vencer" (`dueBefore`). Ordena por fecha de devolución más próxima.
 */
export async function listIncomingRentals(tenantId: string, q: IncomingRentalQuery) {
  const where: Prisma.IncomingRentalWhereInput = {
    tenantId,
    ...(q.status ? { status: q.status } : {}),
    ...(q.supplierId ? { supplierId: q.supplierId } : {}),
    ...(q.project ? { project: { contains: q.project, mode: 'insensitive' } } : {}),
    ...(q.dueBefore ? { returnDate: { lte: new Date(`${q.dueBefore}T00:00:00.000Z`) } } : {}),
    ...(q.search
      ? { OR: [
          { description:    { contains: q.search, mode: 'insensitive' } },
          { thirdPartyName: { contains: q.search, mode: 'insensitive' } },
          { supplier: { name: { contains: q.search, mode: 'insensitive' } } },
        ] }
      : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.incomingRental.findMany({
      where,
      include: LIST_INCLUDE,
      // "Lo prestado" prioriza lo que vence antes; dentro de eso, lo más reciente.
      orderBy: [{ returnDate: 'asc' }, { createdAt: 'desc' }],
      skip: (q.page - 1) * q.limit, take: q.limit,
    }),
    prisma.incomingRental.count({ where }),
  ])
  return { data: rows.map(shape), total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) }
}

/** HU-175/176 — Detalle de un alquiler entrante (todos sus datos, incl. devolución). */
export async function getIncomingRental(tenantId: string, id: string) {
  const r = await prisma.incomingRental.findFirst({ where: { id, tenantId }, include: LIST_INCLUDE })
  if (!r) throw { statusCode: 404, message: 'Alquiler entrante no encontrado', code: 'INCOMING_RENTAL_NOT_FOUND' }
  return shape(r)
}

/**
 * HU-176 — Registrar la DEVOLUCIÓN de un alquiler entrante. Cierra el alquiler (status 'returned',
 * fecha + quién) y resuelve el depósito PROPIO:
 *  - `recovered`: el tercero nos devuelve todo → sin egreso (nuestro dinero vuelve).
 *  - `lost`: el tercero retiene `lostAmount` (≤ depósito), con motivo → egreso (pérdida) en VERA.
 * NO toca inventario propio (el producto nunca fue de la empresa).
 */
export async function returnIncomingRental(tenantId: string, userId: string, id: string, input: ReturnIncomingRentalInput) {
  return prisma.$transaction(async (tx) => {
    const rental = await tx.incomingRental.findFirst({
      where: { id, tenantId },
      include: { supplier: { select: { name: true } } },
    })
    if (!rental) throw { statusCode: 404, message: 'Alquiler entrante no encontrado', code: 'INCOMING_RENTAL_NOT_FOUND' }
    if (rental.status !== 'active') throw { statusCode: 409, message: 'Este alquiler ya fue devuelto', code: 'ALREADY_RETURNED' }

    const deposit = num(rental.deposit)
    const lost = input.depositResolution === 'lost' ? (input.lostAmount ?? 0) : 0
    if (lost > deposit) throw { statusCode: 400, message: `No puedes perder más que el depósito ($${deposit})`, code: 'INVALID_LOST_AMOUNT' }

    const updated = await tx.incomingRental.update({
      where: { id: rental.id },
      data: {
        status:        'returned',
        returnedAt:    new Date(),
        returnedBy:    userId,
        depositLost:   lost,
        depositReason: lost > 0 ? (input.reason ?? null) : null,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: LIST_INCLUDE,
    })

    // HU-178 — al devolver, el recordatorio de devolución se cierra automáticamente (hecho).
    await tx.reminder.updateMany({
      where: { tenantId, relatedType: 'incoming_rental', relatedId: rental.id, isActive: true },
      data:  { status: 'done', isActive: false, completedAt: new Date() },
    })

    // Depósito perdido → EGRESO (pérdida) en VERA. Recuperado no genera transacción (dinero propio que vuelve).
    if (lost > 0) {
      const categoryId = await ensureIncomingRentalCategory(tx, tenantId)
      const thirdParty = rental.supplier?.name ?? rental.thirdPartyName ?? 'tercero'
      await tx.transaction.create({
        data: {
          tenantId, branchId: rental.branchId, categoryId, type: 'expense', amount: lost, currency: 'COP',
          description:   `Depósito perdido — ${rental.description} (${thirdParty})${input.reason ? `: ${input.reason}` : ''}`,
          category:      'Alquileres pagados',
          referenceType: 'incoming_rental_deposit', referenceId: rental.id,
          date: businessToday(), isManual: true,
        },
      })
    }

    return shape(updated)
  })
}
