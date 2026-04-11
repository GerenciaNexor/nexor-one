/**
 * Módulo Agents — AgentRunner + rutas de consulta de AgentLogs.
 * HU-049: núcleo del motor de agentes IA.
 * HU-053: endpoints GET /v1/agent-logs y GET /v1/admin/agent-logs.
 */

import type { FastifyInstance } from 'fastify'
import { agentLogsRoutes } from './routes'

export { runAgent } from './agent.runner'
export type { AgentRunnerInput, AgentRunnerResult, AgentModule, AgentChannel } from './types'

/** Plugin Fastify — montado en /v1/agent-logs bajo el tenantHook. */
export default async function agentsModule(app: FastifyInstance): Promise<void> {
  await app.register(agentLogsRoutes)
}
