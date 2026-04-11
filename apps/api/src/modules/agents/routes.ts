/**
 * Rutas de AgentLogs para TENANT_ADMIN y AREA_MANAGER — HU-053
 *
 * GET /v1/agent-logs  →  logs del propio tenant con paginación y filtros.
 */

import type { FastifyInstance } from 'fastify'
import { requireRole } from '../../lib/guards'
import { getAgentLogs } from './service'

export async function agentLogsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/agent-logs?module=KIRA&channel=whatsapp&from=2025-01-01&to=2025-12-31&page=1&limit=20
   *
   * Devuelve los logs del propio tenant paginados.
   * Requiere AREA_MANAGER o superior.
   */
  app.get(
    '/',
    { preHandler: [requireRole('AREA_MANAGER')] },
    async (request, reply) => {
      const q = request.query as {
        module?:  string
        channel?: string
        from?:    string
        to?:      string
        page?:    string
        limit?:   string
      }

      const result = await getAgentLogs(request.user.tenantId, {
        module:  q.module,
        channel: q.channel,
        from:    q.from,
        to:      q.to,
        page:    q.page  ? Number(q.page)  : undefined,
        limit:   q.limit ? Number(q.limit) : undefined,
      })

      return reply.code(200).send(result)
    },
  )
}
