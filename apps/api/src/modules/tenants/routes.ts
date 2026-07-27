import type { FastifyInstance } from 'fastify'
import { UpdateTenantSchema, UpdateFeatureFlagSchema } from './schema'
import { getTenant, updateTenant, getFeatureFlags, updateFeatureFlag } from './service'
import { requireTenantAdmin } from '../../lib/guards'
import { z2j, objRes, stdErrors, bearerAuth } from '../../lib/openapi'
import { getDemoUsage } from '../../lib/demo-limits'

export async function tenantsRoutes(app: FastifyInstance): Promise<void> {
  /** GET /v1/tenants/me */
  app.get('/me', {
    schema: {
      tags:     ['Tenants'],
      summary:  'Datos del tenant actual',
      security: bearerAuth,
      response: { 200: objRes, ...stdErrors },
    },
  }, async (request, reply) => {
    try {
      const tenant = await getTenant(request.user.tenantId)
      return reply.code(200).send(tenant)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /** PUT /v1/tenants/me */
  app.put('/me', {
    schema: {
      tags:        ['Tenants'],
      summary:     'Actualizar tenant',
      description: 'Actualiza nombre, logo, zona horaria o moneda del tenant. Solo TENANT_ADMIN.',
      security:    bearerAuth,
      body:        z2j(UpdateTenantSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
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

  /**
   * GET /v1/tenants/demo-usage  (HU-143)
   * Uso actual vs. límites del plan demo (para reflejar "12 de 40 productos" en el frontend).
   * Para tenants normales devuelve { isDemo: false }.
   */
  app.get('/demo-usage', {
    schema: {
      tags:     ['Tenants'],
      summary:  'Uso vs. límites del plan demo',
      description: 'Devuelve el uso actual y los topes del plan demo (productos, clientes, etc.) del tenant. Los límites se validan en el backend (HU-143).',
      security: bearerAuth,
      response: { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
  }, async (request, reply) => {
    const usage = await getDemoUsage(request.user.tenantId)
    return reply.code(200).send(usage)
  })

  /** GET /v1/tenants/feature-flags */
  app.get('/feature-flags', {
    schema: {
      tags:     ['Tenants'],
      summary:  'Feature flags del tenant',
      description: 'Devuelve los módulos activos (KIRA, NIRA, ARI, AGENDA, VERA) del tenant.',
      security: bearerAuth,
      response: { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
  }, async (request, reply) => {
    const flags = await getFeatureFlags(request.user.tenantId)
    return reply.code(200).send(flags)
  })

  /** PUT /v1/tenants/feature-flags */
  app.put('/feature-flags', {
    schema: {
      tags:        ['Tenants'],
      summary:     'Actualizar feature flag',
      description: 'Activa o desactiva un módulo del tenant. Solo TENANT_ADMIN.',
      security:    bearerAuth,
      body:        z2j(UpdateFeatureFlagSchema),
      response:    { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: [requireTenantAdmin()],
  }, async (request, reply) => {
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
