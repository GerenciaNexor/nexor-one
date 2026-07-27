/**
 * HU-136 — Auditoría INMUTABLE de acciones de la plataforma (append-only).
 * Solo INSERT + lectura. directPrisma (superuser) porque la tabla tiene RLS deny-all
 * para nexor_app. Ningún usuario de tenant accede a este historial.
 */
import type { Prisma } from '@prisma/client'
import { directPrisma } from '../../lib/prisma'

/**
 * Actor "sistema" para acciones automáticas (sin admin humano detrás), p. ej. la suspensión
 * de una demo vencida por el scheduler. `platform_admin_id` no tiene FK (por diseño), así que
 * este centinela es válido; la lectura lo etiqueta como "Sistema (automático)".
 */
export const SYSTEM_ACTOR = 'system'

/** Acciones canónicas auditables de la plataforma. */
export type PlatformAction =
  | 'tenant.create'
  | 'tenant.activate'
  | 'tenant.deactivate'
  | 'tenant.demo_extend'   // HU-142 — ajuste manual de la duración de la demo
  | 'tenant.demo_expire'   // HU-142 — suspensión automática de la demo al vencer
  | 'subscription.update'
  | 'module.enable'
  | 'module.disable'
  | 'tenant.impersonate'
  | 'channel.connect'
  | 'channel.disconnect'

export interface PlatformAuditInput {
  platformAdminId: string
  tenantId?: string | null
  action: PlatformAction
  reason?: string | null
  metadata?: Record<string, unknown>
  ip?: string | null
}

/**
 * Escribe UNA entrada de auditoría. Append-only: nunca se actualiza ni se borra.
 * No lanza si falla (la auditoría no debe tumbar la acción de negocio), pero deja
 * rastro en el log del proceso — un fallo aquí es una alarma operativa.
 */
export async function logPlatformAction(input: PlatformAuditInput): Promise<void> {
  try {
    await directPrisma.platformAuditLog.create({
      data: {
        platformAdminId: input.platformAdminId,
        tenantId:        input.tenantId ?? null,
        action:          input.action,
        reason:          input.reason ?? null,
        metadata:        (input.metadata ?? {}) as Prisma.InputJsonValue,
        ip:              input.ip ?? null,
      },
    })
  } catch (err) {
    console.error('[platform-audit] no se pudo registrar la acción', input.action, err)
  }
}

export interface AuditListFilters {
  tenantId?: string
  action?: string
  platformAdminId?: string
}

/** Lista el historial (más reciente primero), enriquecido con actor y empresa. Solo plataforma. */
export async function listPlatformAuditLogs(filters: AuditListFilters, page: number, limit: number) {
  const where: Prisma.PlatformAuditLogWhereInput = {
    ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.platformAdminId ? { platformAdminId: filters.platformAdminId } : {}),
  }

  const [rows, total] = await Promise.all([
    directPrisma.platformAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    directPrisma.platformAuditLog.count({ where }),
  ])

  // Enriquecer con email del actor y nombre de la empresa (lecturas por id, sin exponer secretos).
  const adminIds  = [...new Set(rows.map((r) => r.platformAdminId))]
  const tenantIds = [...new Set(rows.map((r) => r.tenantId).filter((x): x is string => !!x))]
  const [admins, tenants] = await Promise.all([
    directPrisma.platformAdmin.findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true, name: true } }),
    directPrisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }),
  ])
  const adminMap  = new Map(admins.map((a) => [a.id, a]))
  const tenantMap = new Map(tenants.map((t) => [t.id, t]))

  // HU-142 — las acciones automáticas usan el actor centinela "system": se etiqueta legible.
  const labelActor = (id: string) =>
    adminMap.get(id) ??
    (id === SYSTEM_ACTOR ? { id, email: null, name: 'Sistema (automático)' } : { id, email: null, name: null })

  return {
    data: rows.map((r) => ({
      id:         r.id,
      action:     r.action,
      reason:     r.reason,
      metadata:   r.metadata,
      ip:         r.ip,
      createdAt:  r.createdAt,
      platformAdmin: labelActor(r.platformAdminId),
      tenant:     r.tenantId ? (tenantMap.get(r.tenantId) ?? { id: r.tenantId, name: null }) : null,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}
