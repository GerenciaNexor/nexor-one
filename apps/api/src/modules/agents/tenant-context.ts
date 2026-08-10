/**
 * Carga del contexto de negocio (tenant + sucursales) para el AgentRunner.
 *
 * BUG-004 (HU-115): el AgentRunner se ejecuta desde el worker, SIN tenantHook,
 * por lo que `app.current_tenant_id` no está seteado. Si se consultan tablas con
 * RLS (p. ej. `branches`) usando el cliente `prisma` normal, la política RLS
 * descarta todas las filas y el agente queda sin sucursales.
 *
 * Decisión (HU-115): se usa `withTenantContext(tenantId, ...)` —preferido por
 * coherencia con HU-114 y BUG-006— que hace `SET LOCAL app.current_tenant_id`
 * dentro de una transacción, de modo que RLS filtra correctamente. Se mantiene
 * además el filtro explícito `where: { tenantId }` (RLS es una capa ADICIONAL,
 * no reemplaza el filtrado por tenant_id en la aplicación).
 *
 * El agente solo accede a datos del tenant del mensaje (resuelto antes vía la
 * tabla `integrations`); este helper nunca devuelve sucursales de otro tenant.
 */

import { withTenantContext } from '../../lib/prisma'
import type { TenantContext } from './prompts'

export async function getAgentTenantContext(tenantId: string): Promise<TenantContext> {
  return withTenantContext(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({
      where:  { id: tenantId },
      select: { name: true, currency: true, timezone: true },
    })

    const branches = await tx.branch.findMany({
      where:  { tenantId },
      select: { name: true },
    })

    return {
      tenantName: tenant.name,
      branches:   branches.map((b) => b.name),
      currency:   tenant.currency,
      timezone:   tenant.timezone || 'America/Bogota',
    }
  })
}
