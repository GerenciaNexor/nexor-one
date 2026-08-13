import type { FastifyInstance } from 'fastify'
import { SaveAgentSettingsSchema } from './schema'
import { listAgentSettings, saveAgentSettings } from './service'
import { requireTenantAdmin } from '../../lib/guards'
import { z2j, objRes, stdErrors, bearerAuth } from '../../lib/openapi'

/**
 * HU-196 — Configuración de IA (comportamiento del agente por sucursal). SOLO administradores del
 * tenant (requireTenantAdmin) + tenant/RLS.
 */
export default async function agentSettingsModule(app: FastifyInstance): Promise<void> {
  /** GET /v1/agent-settings — default del tenant + config (propia/heredada) por sucursal. */
  app.get('/', {
    schema: { tags: ['AgentSettings'], summary: 'Configuración del agente (por sucursal)', security: bearerAuth, response: { 200: objRes, ...stdErrors } },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
    return reply.code(200).send(await listAgentSettings(request.user.tenantId))
  })

  /** PUT /v1/agent-settings — guarda la config para una/varias/todas las sucursales (o el default). */
  app.put('/', {
    schema: { tags: ['AgentSettings'], summary: 'Guardar configuración del agente', security: bearerAuth, body: z2j(SaveAgentSettingsSchema), response: { 200: objRes, ...stdErrors } },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
    const parsed = SaveAgentSettingsSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    try {
      const result = await saveAgentSettings(request.user.tenantId, parsed.data.branchIds, parsed.data.settings)
      return reply.code(200).send({ success: true, ...result })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
