import { prisma } from '../../lib/prisma'
import type { Prisma } from '@prisma/client'
import type { UpdateTenantInput } from './schema'
import { createDefaultPipelineStages } from '../ari/pipeline/service'

const ALL_MODULES = ['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'] as const

const TENANT_SELECT = {
  id: true,
  name: true,
  slug: true,
  legalName: true,
  taxId: true,
  isActive: true,
  timezone: true,
  currency: true,
  logoUrl: true,
  createdAt: true,
  updatedAt: true,
} as const

export async function getTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: TENANT_SELECT,
  })
  if (!tenant) {
    throw { statusCode: 404, message: 'Empresa no encontrada', code: 'NOT_FOUND' }
  }
  return tenant
}

export async function updateTenant(tenantId: string, data: UpdateTenantInput) {
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.legalName !== undefined && { legalName: data.legalName }),
      ...(data.taxId !== undefined && { taxId: data.taxId }),
      ...(data.timezone !== undefined && { timezone: data.timezone }),
      ...(data.currency !== undefined && { currency: data.currency }),
      ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
    },
    select: TENANT_SELECT,
  })
  return tenant
}

export async function getFeatureFlags(tenantId: string) {
  const flags = await prisma.featureFlag.findMany({
    where: { tenantId },
    select: { module: true, enabled: true },
  })
  return Object.fromEntries(flags.map((f) => [f.module, f.enabled])) as Record<string, boolean>
}

export async function updateFeatureFlag(
  tenantId: string,
  module: string,
  enabled: boolean,
) {
  // Regla de negocio: una empresa debe tener siempre al menos un modulo activo.
  // Si se intenta desactivar, verificar que queden otros activos despues del cambio.
  if (!enabled) {
    const activeCount = await prisma.featureFlag.count({
      where: { tenantId, enabled: true },
    })
    if (activeCount <= 1) {
      throw {
        statusCode: 422,
        message:
          'No es posible desactivar el unico modulo activo. Activa al menos otro modulo antes de desactivar este.',
        code: 'LAST_MODULE_ACTIVE',
      }
    }
  }

  const result = await prisma.featureFlag.updateMany({
    where: { tenantId, module: module as never },
    data: { enabled },
  })
  if (result.count === 0) {
    throw { statusCode: 404, message: 'Feature flag no encontrado', code: 'NOT_FOUND' }
  }

  // Al activar ARI por primera vez → crear las 6 etapas por defecto si no existen
  if (module === 'ARI' && enabled) {
    await createDefaultPipelineStages(tenantId)
  }

  return { module, enabled }
}

/**
 * Crea los registros de feature_flags para los 5 modulos de un tenant nuevo.
 * Todos desactivados por defecto — el onboarding activa los modulos contratados.
 * skipDuplicates: true hace la funcion idempotente (segura de llamar multiples veces).
 *
 * Usar dentro de la transaccion de creacion del tenant:
 *   await prisma.$transaction(async (tx) => {
 *     const tenant = await tx.tenant.create(...)
 *     await createDefaultFeatureFlags(tenant.id, tx)
 *   })
 */
export async function createDefaultFeatureFlags(
  tenantId: string,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? prisma
  await client.featureFlag.createMany({
    data: ALL_MODULES.map((module) => ({ tenantId, module })),
    skipDuplicates: true,
  })
}
