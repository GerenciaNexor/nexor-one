/**
 * Servicio de consulta de AgentLogs — HU-053
 *
 * Lógica de negocio separada de las rutas.
 * Los logs son append-only — ninguna función aquí modifica ni elimina registros.
 */

import { prisma } from '../../lib/prisma'

export interface AgentLogFilter {
  module?:  string    // 'KIRA' | 'NIRA' | 'ARI' | 'AGENDA'
  channel?: string    // 'whatsapp' | 'gmail'
  from?:    string    // ISO date YYYY-MM-DD
  to?:      string    // ISO date YYYY-MM-DD
  page?:    number
  limit?:   number
}

function buildDateFilter(from?: string, to?: string) {
  const fromDate = from ? new Date(from) : undefined
  const toDate   = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : undefined
  if (!fromDate && !toDate) return undefined
  return {
    ...(fromDate ? { gte: fromDate } : {}),
    ...(toDate   ? { lte: toDate   } : {}),
  }
}

/**
 * Logs del propio tenant — para TENANT_ADMIN y AREA_MANAGER.
 */
export async function getAgentLogs(tenantId: string, filter: AgentLogFilter) {
  const page  = Math.max(1, filter.page  ?? 1)
  const limit = Math.min(100, Math.max(1, filter.limit ?? 20))
  const skip  = (page - 1) * limit

  const where = {
    tenantId,
    ...(filter.module  ? { module:  filter.module  as never } : {}),
    ...(filter.channel ? { channel: filter.channel            } : {}),
    ...((filter.from || filter.to) ? { createdAt: buildDateFilter(filter.from, filter.to) } : {}),
  }

  const [logs, total] = await Promise.all([
    prisma.agentLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id:           true,
        module:       true,
        channel:      true,
        inputMessage: true,
        reply:        true,
        toolsUsed:    true,
        toolDetails:  true,
        turnCount:    true,
        durationMs:   true,
        createdAt:    true,
      },
    }),
    prisma.agentLog.count({ where }),
  ])

  return {
    data:       logs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }
}

/**
 * Logs de cualquier tenant — solo para SUPER_ADMIN.
 */
export async function getAgentLogsAdmin(filter: AgentLogFilter & { tenantId?: string }) {
  const page  = Math.max(1, filter.page  ?? 1)
  const limit = Math.min(100, Math.max(1, filter.limit ?? 20))
  const skip  = (page - 1) * limit

  const where = {
    ...(filter.tenantId ? { tenantId: filter.tenantId              } : {}),
    ...(filter.module   ? { module:   filter.module as never        } : {}),
    ...(filter.channel  ? { channel:  filter.channel                } : {}),
    ...((filter.from || filter.to) ? { createdAt: buildDateFilter(filter.from, filter.to) } : {}),
  }

  const [logs, total] = await Promise.all([
    prisma.agentLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id:           true,
        tenantId:     true,
        module:       true,
        channel:      true,
        inputMessage: true,
        reply:        true,
        toolsUsed:    true,
        toolDetails:  true,
        turnCount:    true,
        durationMs:   true,
        createdAt:    true,
      },
    }),
    prisma.agentLog.count({ where }),
  ])

  return {
    data:       logs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }
}
