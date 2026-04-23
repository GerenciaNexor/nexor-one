/**
 * Rutas de AgentLogs para TENANT_ADMIN y AREA_MANAGER — HU-053
 *
 * GET /v1/agent-logs  →  logs del propio tenant con paginación y filtros.
 */

import type { FastifyInstance } from 'fastify'
import { requireRole } from '../../lib/guards'
import { getAgentLogs } from './service'
import { listRes, stdErrors, bearerAuth } from '../../lib/openapi'

export async function agentLogsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/agent-logs
   */
  app.get('/', {
    schema: {
      tags:        ['Agents'],
      summary:     'Listar logs de agentes IA',
      description: 'Devuelve logs del agente IA del tenant paginados y filtrados. Requiere AREA_MANAGER o superior.',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: {
          module:  { type: 'string' },
          channel: { type: 'string' },
          from:    { type: 'string' },
          to:      { type: 'string' },
          page:    { type: 'string' },
          limit:   { type: 'string' },
        },
      },
      response: { 200: listRes, ...stdErrors },
    },
    preHandler: [requireRole('AREA_MANAGER')],
  }, async (request, reply) => {
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
  })
}
