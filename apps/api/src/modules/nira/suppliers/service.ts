import { prisma } from '../../../lib/prisma'
import type { CreateSupplierInput, UpdateSupplierInput, SupplierQuery } from './schema'

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
    orderBy: { name: 'asc' },
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
          calculatedAt:     true,
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  const ranked = suppliers
    .map((s) => ({
      id:    s.id,
      name:  s.name,
      city:  s.city,
      score: s.score
        ? {
            priceScore:       parseFloat(String(s.score.priceScore)),
            deliveryScore:    parseFloat(String(s.score.deliveryScore)),
            qualityScore:     parseFloat(String(s.score.qualityScore)),
            overallScore:     parseFloat(String(s.score.overallScore)),
            totalOrders:      s.score.totalOrders,
            onTimeDeliveries: s.score.onTimeDeliveries,
            calculatedAt:     s.score.calculatedAt,
          }
        : null,
    }))
    .sort((a, b) => {
      const aScore = a.score?.overallScore ?? -1
      const bScore = b.score?.overallScore ?? -1
      return bScore - aScore
    })

  return { data: ranked, total: ranked.length }
}

export async function deactivateSupplier(tenantId: string, supplierId: string) {
  const existing = await prisma.supplier.findFirst({
    where:  { id: supplierId, tenantId },
    select: { isActive: true },
  })
  if (!existing) {
    throw { statusCode: 404, message: 'Proveedor no encontrado', code: 'NOT_FOUND' }
  }
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
