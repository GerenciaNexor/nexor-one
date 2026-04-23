import { prisma, directPrisma, withTenantContext } from '../../lib/prisma'

// ─── Listado de tenants ───────────────────────────────────────────────────────

export async function listAllTenants(page: number, limit: number) {
  const skip = (page - 1) * limit

  const [data, total] = await prisma.$transaction([
    prisma.tenant.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.tenant.count(),
  ])

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

// ─── Detalle de un tenant ─────────────────────────────────────────────────────

export async function getTenantDetail(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
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
    },
  })

  if (!tenant) {
    throw { statusCode: 404, message: 'Empresa no encontrada', code: 'NOT_FOUND' }
  }

  // Las tablas branches, users y feature_flags tienen RLS.
  // Usamos withTenantContext para inyectar el tenant_id correcto en la sesion
  // antes de ejecutar las queries, garantizando que RLS permita el acceso.
  const [branches, users, featureFlags] = await Promise.all([
    withTenantContext(tenantId, (tx) =>
      tx.branch.findMany({
        where: { tenantId },
        select: { id: true, name: true, city: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
    ),
    withTenantContext(tenantId, (tx) =>
      tx.user.findMany({
        where: { tenantId },
        select: { id: true, name: true, email: true, role: true, module: true, isActive: true, lastLoginAt: true },
        orderBy: { name: 'asc' },
      }),
    ),
    withTenantContext(tenantId, (tx) =>
      tx.featureFlag.findMany({
        where: { tenantId },
        select: { module: true, enabled: true },
      }),
    ),
  ])

  return {
    ...tenant,
    branches,
    users,
    featureFlags: Object.fromEntries(featureFlags.map((f) => [f.module, f.enabled])),
  }
}

// ─── Toggle feature flag de un módulo ────────────────────────────────────────

/**
 * Activa o desactiva un módulo para un tenant.
 * Solo puede llamarlo SUPER_ADMIN desde el panel de administración.
 */
export async function toggleFeatureFlag(tenantId: string, module: string, enabled: boolean) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
  if (!existing) {
    throw { statusCode: 404, message: 'Empresa no encontrada', code: 'NOT_FOUND' }
  }

  try {
    return await withTenantContext(tenantId, (tx) =>
      tx.featureFlag.update({
        where:  { tenantId_module: { tenantId, module: module as never } },
        data:   { enabled },
        select: { module: true, enabled: true, tenantId: true },
      }),
    )
  } catch (err: unknown) {
    const prismaErr = err as { code?: string }
    if (prismaErr.code === 'P2025') {
      throw { statusCode: 404, message: `Feature flag para módulo ${module} no encontrado`, code: 'NOT_FOUND' }
    }
    throw err
  }
}

// ─── Listado de impersonaciones ────────────────────────────────────────────────

/**
 * Lista todas las impersonaciones registradas en agent_logs.
 * directPrisma para bypassear RLS — el SUPER_ADMIN consulta cross-tenant.
 */
export async function listImpersonations(page: number, limit: number, tenantId?: string) {
  const skip = (page - 1) * limit

  const where = {
    channel:   'admin',
    toolsUsed: { has: 'impersonate' },
    ...(tenantId ? { tenantId } : {}),
  }

  const [data, total] = await Promise.all([
    directPrisma.agentLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take:    limit,
      select: {
        id:          true,
        tenantId:    true,
        toolDetails: true,
        createdAt:   true,
      },
    }),
    directPrisma.agentLog.count({ where }),
  ])

  return {
    data:       data.map((r) => ({
      id:              r.id,
      tenantId:        r.tenantId,
      toolDetails:     r.toolDetails,
      createdAt:       r.createdAt,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

// ─── Toggle isActive de un tenant ────────────────────────────────────────────

export async function toggleTenant(tenantId: string, isActive: boolean) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } })
  if (!existing) {
    throw { statusCode: 404, message: 'Empresa no encontrada', code: 'NOT_FOUND' }
  }
  return prisma.tenant.update({
    where: { id: tenantId },
    data: { isActive },
    select: { id: true, name: true, slug: true, isActive: true, updatedAt: true },
  })
}

// ─── Audit log de impersonacion ───────────────────────────────────────────────

/**
 * Registra el evento de impersonacion en agent_logs del tenant objetivo.
 * APPEND-ONLY: no se actualiza ni elimina este registro. Inmutable por diseno.
 * Requiere withTenantContext para pasar el RLS de agent_logs.
 */
export async function logImpersonation(
  targetTenantId: string,
  superAdminUserId: string,
  requestIp: string,
) {
  await withTenantContext(targetTenantId, (tx) =>
    tx.agentLog.create({
      data: {
        tenantId: targetTenantId,
        // Convencion V1: los audit logs de admin usan modulo ARI como marcador.
        // No existe un modulo ADMIN en el enum — se distingue por channel='admin'.
        module: 'ARI',
        channel: 'admin',
        inputMessage: JSON.stringify({
          event: 'impersonation',
          superAdminUserId,
          targetTenantId,
        }),
        toolsUsed: ['impersonate'],
        toolDetails: {
          event:            'impersonation',
          superAdminUserId,
          targetTenantId,
          ip:               requestIp,
          timestamp:        new Date().toISOString(),
          expiresAt:        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        turnCount: 1,
      },
    }),
  )
}
