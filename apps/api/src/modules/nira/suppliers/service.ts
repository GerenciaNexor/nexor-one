import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '../../../lib/prisma'
import { assertDemoLimit } from '../../../lib/demo-limits'
import type { CreateSupplierInput, UpdateSupplierInput, SupplierQuery } from './schema'

// ─── HU-154 — Proveedor genérico "Proveedor ocasional" (único por tenant) ───────
/** Nombre visible del proveedor genérico ocasional. */
export const GENERIC_SUPPLIER_NAME = 'Proveedor ocasional'
type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Garantiza que exista el "Proveedor ocasional" del tenant (idempotente). Proveedor REAL con
 * tenant_id → sujeto al RLS de `suppliers`, jamás global. Índice único parcial evita duplicados;
 * ante carrera (P2002) se relee. `db` = proxy por-request (RLS) o directPrisma (creación de tenant).
 */
export async function ensureGenericSupplier(db: DbClient, tenantId: string): Promise<string> {
  const existing = await db.supplier.findFirst({ where: { tenantId, isGeneric: true }, select: { id: true } })
  if (existing) return existing.id
  try {
    const created = await db.supplier.create({
      data:   { tenantId, name: GENERIC_SUPPLIER_NAME, isGeneric: true },
      select: { id: true },
    })
    return created.id
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') {
      const again = await db.supplier.findFirst({ where: { tenantId, isGeneric: true }, select: { id: true } })
      if (again) return again.id
    }
    throw err
  }
}

// ─── Select ────────────────────────────────────────────────────────────────────

const SUPPLIER_SELECT = {
  id:           true,
  tenantId:     true,
  name:         true,
  contactName:  true,
  email:        true,
  phone:        true,
  taxId:        true,
  address:      true,
  city:         true,
  paymentTerms: true,
  notes:        true,
  isActive:     true,
  isGeneric:    true, // HU-154
  createdAt:    true,
  updatedAt:    true,
  score: {
    select: {
      overallScore: true,
    },
  },
} as const

/** Select ampliado para el detalle — incluye el score calculado si existe. */
const SUPPLIER_DETAIL_SELECT = {
  ...SUPPLIER_SELECT,
  score: {
    select: {
      priceScore:       true,
      deliveryScore:    true,
      qualityScore:     true,
      overallScore:     true,
      totalOrders:      true,
      onTimeDeliveries: true,
      calculatedAt:     true,
    },
  },
} as const

// Decimal → number para JSON
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toApiSupplier(s: any) {
  if (!s.score) return s
  return {
    ...s,
    score: {
      ...s.score,
      priceScore:    parseFloat(String(s.score.priceScore)),
      deliveryScore: parseFloat(String(s.score.deliveryScore)),
      qualityScore:  parseFloat(String(s.score.qualityScore)),
      overallScore:  parseFloat(String(s.score.overallScore)),
    },
  }
}

// ─── Unicidad de NIT por tenant ───────────────────────────────────────────────

async function assertTaxIdUnique(
  tenantId:   string,
  taxId:      string,
  excludeId?: string,
): Promise<void> {
  const conflict = await prisma.supplier.findFirst({
    where: {
      tenantId,
      taxId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true },
  })
  if (conflict) {
    throw {
      statusCode: 409,
      message:    `El NIT '${taxId}' ya está registrado en otro proveedor (${conflict.name})`,
      code:       'DUPLICATE_TAX_ID',
    }
  }
}

// ─── Operaciones CRUD ─────────────────────────────────────────────────────────

export async function listSuppliers(tenantId: string, query: SupplierQuery) {
  const isActive = query.active === 'false' ? false : true

  // HU-154 — asegurar el "Proveedor ocasional" del tenant antes de listar (aparece en el dropdown).
  await ensureGenericSupplier(prisma, tenantId)

  const data = await prisma.supplier.findMany({
    where: {
      tenantId,
      isActive,
      ...(query.search
        ? {
            OR: [
              { name:  { contains: query.search, mode: 'insensitive' } },
              { taxId: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select:  SUPPLIER_SELECT,
    // HU-154 — el genérico ("Proveedor ocasional") aparece primero en el listado/dropdown.
    orderBy: [{ isGeneric: 'desc' }, { name: 'asc' }],
  })

  return { data, total: data.length }
}

export async function getSupplier(tenantId: string, supplierId: string) {
  const supplier = await prisma.supplier.findFirst({
    where:  { id: supplierId, tenantId },
    select: SUPPLIER_DETAIL_SELECT,
  })
  if (!supplier) {
    throw { statusCode: 404, message: 'Proveedor no encontrado', code: 'NOT_FOUND' }
  }
  return toApiSupplier(supplier)
}

export async function createSupplier(tenantId: string, input: CreateSupplierInput) {
  await assertDemoLimit(tenantId, 'suppliers') // HU-143 — tope del plan demo
  if (input.taxId) await assertTaxIdUnique(tenantId, input.taxId)

  return prisma.supplier.create({
    data: {
      tenantId,
      name:         input.name,
      contactName:  input.contactName,
      email:        input.email,
      phone:        input.phone,
      taxId:        input.taxId,
      address:      input.address,
      city:         input.city,
      paymentTerms: input.paymentTerms,
      notes:        input.notes,
    },
    select: SUPPLIER_SELECT,
  })
}

export async function updateSupplier(
  tenantId:   string,
  supplierId: string,
  input:      UpdateSupplierInput,
) {
  const existing = await prisma.supplier.findFirst({
    where:  { id: supplierId, tenantId },
    select: { id: true },
  })
  if (!existing) {
    throw { statusCode: 404, message: 'Proveedor no encontrado', code: 'NOT_FOUND' }
  }

  if (input.taxId !== undefined) await assertTaxIdUnique(tenantId, input.taxId, supplierId)

  return prisma.supplier.update({
    where: { id: supplierId },
    data:  {
      ...(input.name         !== undefined && { name:         input.name }),
      ...(input.contactName  !== undefined && { contactName:  input.contactName }),
      ...(input.email        !== undefined && { email:        input.email }),
      ...(input.phone        !== undefined && { phone:        input.phone }),
      ...(input.taxId        !== undefined && { taxId:        input.taxId }),
      ...(input.address      !== undefined && { address:      input.address }),
      ...(input.city         !== undefined && { city:         input.city }),
      ...(input.paymentTerms !== undefined && { paymentTerms: input.paymentTerms }),
      ...(input.notes        !== undefined && { notes:        input.notes }),
    },
    select: SUPPLIER_SELECT,
  })
}

export async function getSuppliersRanking(tenantId: string) {
  const suppliers = await prisma.supplier.findMany({
    where:  { tenantId, isActive: true },
    select: {
      id:    true,
      name:  true,
      city:  true,
      score: {
        select: {
          priceScore:       true,
          deliveryScore:    true,
          qualityScore:     true,
          overallScore:     true,
          totalOrders:      true,
          onTimeDeliveries: true,
          ratingsCount:     true,
          calculatedAt:     true,
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  // HU-125 — los ejes pueden ser NULL ("sin datos"); no se convierten a 0.
  const num = (v: unknown): number | null => (v == null ? null : parseFloat(String(v)))

  const ranked = suppliers
    .map((s) => ({
      id:    s.id,
      name:  s.name,
      city:  s.city,
      score: s.score
        ? {
            priceScore:       num(s.score.priceScore),
            deliveryScore:    num(s.score.deliveryScore),
            qualityScore:     num(s.score.qualityScore),
            overallScore:     num(s.score.overallScore),
            totalOrders:      s.score.totalOrders,
            onTimeDeliveries: s.score.onTimeDeliveries,
            ratingsCount:     s.score.ratingsCount,
            calculatedAt:     s.score.calculatedAt,
          }
        : null,
    }))
    // Mejor overall primero; "sin datos" (null) al final.
    .sort((a, b) => (b.score?.overallScore ?? -1) - (a.score?.overallScore ?? -1))

  return { data: ranked, total: ranked.length }
}

export async function deactivateSupplier(tenantId: string, supplierId: string) {
  const existing = await prisma.supplier.findFirst({
    where:  { id: supplierId, tenantId },
    select: { isActive: true, isGeneric: true },
  })
  if (!existing) {
    throw { statusCode: 404, message: 'Proveedor no encontrado', code: 'NOT_FOUND' }
  }
  // HU-154 — el "Proveedor ocasional" es un registro del sistema: no se desactiva ni se borra.
  if (existing.isGeneric) throw { statusCode: 422, message: 'El "Proveedor ocasional" no se puede desactivar', code: 'GENERIC_PROTECTED' }
  if (!existing.isActive) {
    throw { statusCode: 409, message: 'El proveedor ya está desactivado', code: 'ALREADY_INACTIVE' }
  }

  // Soft delete — las órdenes de compra y el score se conservan
  return prisma.supplier.update({
    where:  { id: supplierId },
    data:   { isActive: false },
    select: SUPPLIER_SELECT,
  })
}
