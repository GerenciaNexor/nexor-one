import type { FastifyInstance } from 'fastify'
import { UpdateTenantSchema, UpdateFeatureFlagSchema } from './schema'
import { getTenant, updateTenant, getFeatureFlags, updateFeatureFlag } from './service'
import { requireTenantAdmin } from '../../lib/guards'

export async function tenantsRoutes(app: FastifyInstance): Promise<void> {
  /** GET /v1/tenants/me — datos de la empresa del usuario autenticado */
  app.get('/me', async (request, reply) => {
    try {
      const tenant = await getTenant(request.user.tenantId)
      return reply.code(200).send(tenant)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /** PUT /v1/tenants/me — actualizar nombre, logo, zona horaria, moneda */
  app.put('/me', { preHandler: [requireTenantAdmin()] }, async (request, reply) => {
    const parsed = UpdateTenantSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada invalidos',
        code: 'VALIDATION_ERROR',
      })
    }
    try {
      const tenant = await updateTenant(request.user.tenantId, parsed.data)
      return reply.code(200).send(tenant)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /** GET /v1/tenants/feature-flags — modulos activos del tenant */
  app.get('/feature-flags', async (request, reply) => {
    const flags = await getFeatureFlags(request.user.tenantId)
    return reply.code(200).send(flags)
  })

  /** PUT /v1/tenants/feature-flags — activar o desactivar un modulo */
  app.put('/feature-flags', { preHandler: [requireTenantAdmin()] }, async (request, reply) => {
    const parsed = UpdateFeatureFlagSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada invalidos',
        code: 'VALIDATION_ERROR',
      })
    }
    try {
      const result = await updateFeatureFlag(
        request.user.tenantId,
        parsed.data.module,
        parsed.data.enabled,
      )
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
