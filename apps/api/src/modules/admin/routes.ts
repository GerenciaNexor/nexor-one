import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { listAllTenants, getTenantDetail, toggleTenant, logImpersonation } from './service'
import { getAgentLogsAdmin } from '../agents/service'
import { z } from 'zod'
import { idParam, listRes, objRes, stdErrors, bearerAuth } from '../../lib/openapi'

/**
 * Hook onRequest para el scope /v1/admin.
 * Verifica el JWT y exige exactamente el rol SUPER_ADMIN.
 */
export async function superAdminHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'Token invalido o expirado', code: 'UNAUTHORIZED' })
  }
  if (request.user.role !== 'SUPER_ADMIN') {
    return reply.code(403).send({
      error: 'Solo el Super Admin puede acceder a este panel',
      code: 'FORBIDDEN',
    })
  }
}

const ToggleSchema = z.object({ isActive: z.boolean() })

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/admin/tenants
   */
  app.get('/tenants', {
    schema: {
      tags:        ['Admin'],
      summary:     'Listar todos los tenants',
      description: 'Listado paginado de todas las empresas de la plataforma. Solo SUPER_ADMIN.',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: {
          page:  { type: 'string' },
          limit: { type: 'string' },
        },
      },
      response: { 200: listRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string }
    const page = Math.max(1, Number(query.page ?? 1))
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)))
    const result = await listAllTenants(page, limit)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/admin/tenants/:id
   */
  app.get('/tenants/:id', {
    schema: {
      tags:        ['Admin'],
      summary:     'Detalle de tenant',
      description: 'Detalle completo: sucursales, usuarios y feature flags del tenant. Solo SUPER_ADMIN.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const tenant = await getTenantDetail(id)
      return reply.code(200).send(tenant)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/admin/tenants/:id/toggle
   */
  app.put('/tenants/:id/toggle', {
    schema: {
      tags:        ['Admin'],
      summary:     'Activar o desactivar tenant',
      description: 'Al desactivar, el tenantHook rechaza inmediatamente todos sus tokens. No se puede desactivar la propia empresa del Super Admin.',
      security:    bearerAuth,
      params:      idParam,
      body: {
        type: 'object',
        required: ['isActive'],
        properties: { isActive: { type: 'boolean' } },
      },
      response: { 200: objRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = ToggleSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada invalidos',
        code: 'VALIDATION_ERROR',
      })
    }

    if (!parsed.data.isActive && id === request.user.tenantId) {
      return reply.code(422).send({
        error: 'No puedes desactivar la empresa del Super Admin desde este panel',
        code: 'CANNOT_DEACTIVATE_OWN_TENANT',
      })
    }

    try {
      const tenant = await toggleTenant(id, parsed.data.isActive)
      return reply.code(200).send(tenant)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * POST /v1/admin/tenants/:id/impersonate
   */
  app.post('/tenants/:id/impersonate', {
    schema: {
      tags:        ['Admin'],
      summary:     'Impersonar tenant',
      description: 'Genera un JWT de 1 hora como TENANT_ADMIN del tenant objetivo. No tiene refresh token. Queda registrado en agent_logs.',
      security:    bearerAuth,
      params:      idParam,
      response: {
        200: {
          type: 'object',
          properties: {
            token:     { type: 'string' },
            expiresIn: { type: 'string' },
          },
        },
        ...stdErrors,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const { prisma } = await import('../../lib/prisma')
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    })

    if (!tenant) {
      return reply.code(404).send({ error: 'Empresa no encontrada', code: 'NOT_FOUND' })
    }
    if (!tenant.isActive) {
      return reply.code(422).send({
        error: 'No se puede impersonar una empresa desactivada',
        code: 'TENANT_INACTIVE',
      })
    }

    const token = app.jwt.sign(
      {
        userId: request.user.userId,
        tenantId: id,
        branchId: null,
        role: 'TENANT_ADMIN' as const,
      },
      { expiresIn: '1h' },
    )

    const requestIp = request.ip
    await logImpersonation(id, request.user.userId, requestIp)

    return reply.code(200).send({ token, expiresIn: '1h' })
  })

  /**
   * GET /v1/admin/agent-logs
   */
  app.get('/agent-logs', {
    schema: {
      tags:        ['Admin'],
      summary:     'Logs de agentes IA (todos los tenants)',
      description: 'Consulta los logs del agente IA de cualquier tenant. Solo SUPER_ADMIN.',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          module:   { type: 'string' },
          channel:  { type: 'string' },
          from:     { type: 'string' },
          to:       { type: 'string' },
          page:     { type: 'string' },
          limit:    { type: 'string' },
        },
      },
      response: { 200: listRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const q = request.query as {
      tenantId?: string
      module?:   string
      channel?:  string
      from?:     string
      to?:       string
      page?:     string
      limit?:    string
    }

    const result = await getAgentLogsAdmin({
      tenantId: q.tenantId,
      module:   q.module,
      channel:  q.channel,
      from:     q.from,
      to:       q.to,
      page:     q.page  ? Number(q.page)  : undefined,
      limit:    q.limit ? Number(q.limit) : undefined,
    })

    return reply.code(200).send(result)
  })
}
