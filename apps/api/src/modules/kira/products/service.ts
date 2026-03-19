import { prisma } from '../../../lib/prisma'
import type { CreateProductInput, UpdateProductInput, ProductQuery } from './schema'

const PRODUCT_SELECT = {
  id:          true,
  tenantId:    true,
  sku:         true,
  name:        true,
  description: true,
  category:    true,
  unit:        true,
  salePrice:   true,
  costPrice:   true,
  minStock:    true,
  maxStock:    true,
  abcClass:    true,
  isActive:    true,
  createdAt:   true,
  updatedAt:   true,
} as const

// Convierte los campos Decimal de Prisma a number para la respuesta JSON.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toApiProduct(p: any) {
  return {
    ...p,
    salePrice: p.salePrice !== null ? parseFloat(String(p.salePrice)) : null,
    costPrice: p.costPrice !== null ? parseFloat(String(p.costPrice)) : null,
  }
}

export async function listProducts(tenantId: string, query: ProductQuery) {
  // Por defecto solo se muestran productos activos.
  // ?active=false muestra solo los inactivos.
  const isActive = query.active === 'false' ? false : true

  const data = await prisma.product.findMany({
    where: {
      tenantId,
      isActive,
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku:  { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: PRODUCT_SELECT,
    orderBy: { name: 'asc' },
  })

  return { data: data.map(toApiProduct), total: data.length }
}

export async function getProduct(tenantId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    select: PRODUCT_SELECT,
  })
  if (!product) throw { statusCode: 404, message: 'Producto no encontrado', code: 'NOT_FOUND' }
  return toApiProduct(product)
}

export async function createProduct(tenantId: string, input: CreateProductInput) {
  try {
    const product = await prisma.product.create({
      data: {
        tenantId,
        sku:         input.sku,
        name:        input.name,
        description: input.description,
        category:    input.category,
        unit:        input.unit,
        salePrice:   input.salePrice,
        costPrice:   input.costPrice,
        minStock:    input.minStock,
        maxStock:    input.maxStock,
      },
      select: PRODUCT_SELECT,
    })
    return toApiProduct(product)
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === 'P2002') {
      throw { statusCode: 409, message: `El SKU '${input.sku}' ya existe en esta empresa`, code: 'DUPLICATE_SKU' }
    }
    throw err
  }
}

export async function updateProduct(
  tenantId: string,
  productId: string,
  input: UpdateProductInput,
) {
  const existing = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    select: { minStock: true, maxStock: true },
  })
  if (!existing) throw { statusCode: 404, message: 'Producto no encontrado', code: 'NOT_FOUND' }

  // Validación cruzada combinando valores nuevos con los actuales de la DB
  const effectiveMinStock = input.minStock ?? existing.minStock
  const effectiveMaxStock = input.maxStock !== undefined ? input.maxStock : existing.maxStock
  if (effectiveMaxStock !== null && effectiveMaxStock <= effectiveMinStock) {
    throw { statusCode: 400, message: 'El stock máximo debe ser mayor al stock mínimo', code: 'VALIDATION_ERROR' }
  }

  const product = await prisma.product.update({
    where: { id: productId },
    data: {
      ...(input.name        !== undefined && { name:        input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.category    !== undefined && { category:    input.category }),
      ...(input.unit        !== undefined && { unit:        input.unit }),
      ...(input.salePrice   !== undefined && { salePrice:   input.salePrice }),
      ...(input.costPrice   !== undefined && { costPrice:   input.costPrice }),
      ...(input.minStock    !== undefined && { minStock:    input.minStock }),
      ...(input.maxStock    !== undefined && { maxStock:    input.maxStock }),
    },
    select: PRODUCT_SELECT,
  })
  return toApiProduct(product)
}

export async function deactivateProduct(tenantId: string, productId: string) {
  const existing = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    select: { isActive: true },
  })
  if (!existing) throw { statusCode: 404, message: 'Producto no encontrado', code: 'NOT_FOUND' }
  if (!existing.isActive) throw { statusCode: 409, message: 'El producto ya está desactivado', code: 'ALREADY_INACTIVE' }

  const product = await prisma.product.update({
    where: { id: productId },
    data: { isActive: false },
    select: PRODUCT_SELECT,
  })
  return toApiProduct(product)
}
