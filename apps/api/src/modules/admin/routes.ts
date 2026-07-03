import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { listAllTenants, getTenantDetail, toggleTenant, logImpersonation, toggleFeatureFlag, listImpersonations } from './service'
import { getAgentLogsAdmin } from '../agents/service'
import { z } from 'zod'
import { idParam, listRes, objRes, stdErrors, bearerAuth } from '../../lib/openapi'
import { isPlatformAdminActive } from '../platform/service'
import { logPlatformAction, listPlatformAuditLogs } from '../platform/audit'
import { createTenantWithAdmin, getSubscription, setSubscriptionAmount } from '../platform/tenants'

/**
 * Hook onRequest para el scope /v1/admin.
 * HU-134 — exige una identidad de PLATAFORMA (platform_admins), no un usuario de tenant.
 * Solo un JWT de plataforma (con platformAdminId + rol SUPER_ADMIN) pasa; un token de
 * cliente (aunque manipulara su rol) no lleva platformAdminId → 403.
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
  const { platformAdminId, role } = request.user
  if (!platformAdminId || role !== 'SUPER_ADMIN') {
    return reply.code(403).send({
      error: 'Solo el equipo NEXOR (plataforma) puede acceder a este panel',
      code: 'FORBIDDEN',
    })
  }
  if (!(await isPlatformAdminActive(platformAdminId))) {
    return reply.code(403).send({ error: 'Cuenta de plataforma desactivada.', code: 'ACCOUNT_DISABLED' })
  }
}

const ToggleSchema = z.object({ isActive: z.boolean(), reason: z.string().max(500).optional() })

// HU-138 — alta de cliente + gestión de suscripción
const CreateTenantSchema = z.object({
  name:          z.string().min(2, 'Nombre requerido').max(255),
  slug:          z.string().max(80).optional(),
  legalName:     z.string().max(255).optional(),
  taxId:         z.string().max(50).optional(),
  currency:      z.string().length(3).optional(),
  adminName:     z.string().min(2, 'Nombre del admin requerido').max(255),
  adminEmail:    z.string().email('Email inválido'),
  adminPassword: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  modules:       z.array(z.enum(['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'])).optional(),
  amount:        z.number().min(0).optional(),
  reason:        z.string().min(1, 'El motivo es obligatorio').max(500),
})
const SubscriptionSchema = z.object({
  amount:   z.number().min(0, 'El monto no puede ser negativo'),
  currency: z.string().length(3).optional(),
  reason:   z.string().min(1, 'El motivo es obligatorio').max(500),
})

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
   * POST /v1/admin/tenants  (HU-138) — crear un cliente + su primer admin + suscripción.
   */
  app.post('/tenants', {
    schema: {
      tags:        ['Admin'],
      summary:     'Crear cliente (tenant)',
      description: 'Da de alta una empresa con su primer TENANT_ADMIN, módulos y suscripción (monto). Auditado. Solo plataforma.',
      security:    bearerAuth,
      response:    { 200: objRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const parsed = CreateTenantSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    }
    try {
      const created = await createTenantWithAdmin(parsed.data, request.user.platformAdminId as string, request.ip)
      return reply.code(200).send({ success: true, data: created })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * GET /v1/admin/tenants/:id/subscription  (HU-138)
   */
  app.get('/tenants/:id/subscription', {
    schema: { tags: ['Admin'], summary: 'Suscripción del cliente', security: bearerAuth, params: idParam, response: { 200: objRes, ...stdErrors } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const sub = await getSubscription(id)
    return reply.code(200).send({ success: true, data: sub })
  })

  /**
   * PUT /v1/admin/tenants/:id/subscription  (HU-138) — definir/editar el monto.
   */
  app.put('/tenants/:id/subscription', {
    schema: { tags: ['Admin'], summary: 'Definir/editar el monto de la suscripción', security: bearerAuth, params: idParam, response: { 200: objRes, ...stdErrors } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = SubscriptionSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    }
    try {
      const sub = await setSubscriptionAmount(id, parsed.data.amount, parsed.data.currency, request.user.platformAdminId as string, parsed.data.reason, request.ip)
      return reply.code(200).send({ success: true, data: sub })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
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
      // HU-136 — auditoría de plataforma (cambio de suscripción activar/cancelar)
      await logPlatformAction({
        platformAdminId: request.user.platformAdminId as string,
        tenantId:        id,
        action:          parsed.data.isActive ? 'tenant.activate' : 'tenant.deactivate',
        reason:          parsed.data.reason ?? null,
        ip:              request.ip,
      })
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

    // HU-134 — token de impersonación: identidad = el operador de plataforma
    // (platformAdminId), con tenantId del objetivo y `imp: true`. El tenantHook lo
    // reconoce (verifica platform_admins, no users) y le aplica contexto de tenant.
    const platformAdminId = request.user.platformAdminId as string
    const token = app.jwt.sign(
      {
        platformAdminId,
        tenantId: id,
        branchId: null,
        role: 'TENANT_ADMIN' as const,
        imp: true,
      },
      { expiresIn: '1h' },
    )

    const requestIp = request.ip
    await logImpersonation(id, platformAdminId, requestIp)
    // HU-136 — auditoría de plataforma (registro canónico append-only)
    await logPlatformAction({ platformAdminId, tenantId: id, action: 'tenant.impersonate', ip: requestIp })

    return reply.code(200).send({ token, expiresIn: '1h' })
  })

  /**
   * PUT /v1/admin/tenants/:id/feature-flags/:module
   */
  app.put('/tenants/:id/feature-flags/:module', {
    schema: {
      tags:        ['Admin'],
      summary:     'Activar o desactivar un módulo',
      description: 'Cambia el estado del feature flag de un módulo para el tenant. Solo SUPER_ADMIN.',
      security:    bearerAuth,
      params: {
        type: 'object',
        required: ['id', 'module'],
        properties: {
          id:     { type: 'string' },
          module: { type: 'string', enum: ['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA'] },
        },
      },
      body: {
        type: 'object',
        required: ['enabled'],
        properties: { enabled: { type: 'boolean' } },
      },
      response: { 200: objRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const { id, module } = request.params as { id: string; module: string }

    const paramsSchema = z.object({
      module: z.enum(['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA']),
    })
    const paramsParsed = paramsSchema.safeParse({ module })
    if (!paramsParsed.success) {
      return reply.code(400).send({
        error: `Módulo inválido. Valores permitidos: ARI, NIRA, KIRA, AGENDA, VERA`,
        code:  'VALIDATION_ERROR',
      })
    }

    const bodyParsed = z.object({ enabled: z.boolean(), reason: z.string().max(500).optional() }).safeParse(request.body)
    if (!bodyParsed.success) {
      return reply.code(400).send({
        error: bodyParsed.error.errors[0]?.message ?? 'Datos de entrada invalidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const flag = await toggleFeatureFlag(id, paramsParsed.data.module, bodyParsed.data.enabled)
      // HU-136 — auditoría de plataforma (módulo activado/desactivado)
      await logPlatformAction({
        platformAdminId: request.user.platformAdminId as string,
        tenantId:        id,
        action:          bodyParsed.data.enabled ? 'module.enable' : 'module.disable',
        reason:          bodyParsed.data.reason ?? null,
        metadata:        { module: paramsParsed.data.module },
        ip:              request.ip,
      })
      return reply.code(200).send({ success: true, data: flag })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * GET /v1/admin/impersonations
   */
  app.get('/impersonations', {
    schema: {
      tags:        ['Admin'],
      summary:     'Historial de impersonaciones',
      description: 'Lista todas las impersonaciones realizadas por el SUPER_ADMIN, ordenadas de más reciente a más antigua.',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          page:     { type: 'string' },
          limit:    { type: 'string' },
        },
      },
      response: { 200: listRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const q = request.query as { tenantId?: string; page?: string; limit?: string }
    const page  = Math.max(1, Number(q.page  ?? 1))
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)))
    const result = await listImpersonations(page, limit, q.tenantId)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/admin/audit-logs  (HU-136)
   * Historial INMUTABLE de acciones administrativas de la plataforma. Solo SUPER_ADMIN.
   */
  app.get('/audit-logs', {
    schema: {
      tags:        ['Admin'],
      summary:     'Auditoría de la plataforma',
      description: 'Registro append-only de acciones del equipo NEXOR (crear/activar/cancelar cliente, módulos, canales, impersonación). Solo SUPER_ADMIN. Ningún cliente accede.',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          action:   { type: 'string' },
          page:     { type: 'string' },
          limit:    { type: 'string' },
        },
      },
      response: { 200: listRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const q     = request.query as { tenantId?: string; action?: string; page?: string; limit?: string }
    const page  = Math.max(1, Number(q.page  ?? 1))
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)))
    const result = await listPlatformAuditLogs(
      { tenantId: q.tenantId, action: q.action },
      page,
      limit,
    )
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/admin/bulk-upload/logs
   * Historial global de cargas masivas — todos los tenants.
   */
  app.get('/bulk-upload/logs', {
    schema: {
      tags:        ['Admin'],
      summary:     'Historial global de cargas masivas',
      description: 'Todas las cargas masivas de todos los tenants. Filtrable por tenant, tipo y estado. Solo SUPER_ADMIN.',
      security:    bearerAuth,
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          type:     { type: 'string' },
          status:   { type: 'string' },
          from:     { type: 'string' },
          to:       { type: 'string' },
          page:     { type: 'string' },
          limit:    { type: 'string' },
        },
      },
      response: { 200: listRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const q     = request.query as { tenantId?: string; type?: string; status?: string; from?: string; to?: string; page?: string; limit?: string }
    const page  = Math.max(1, Number(q.page  ?? 1))
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)))

    const where = {
      ...(q.tenantId ? { tenantId: q.tenantId } : {}),
      ...(q.type     ? { type:     q.type     } : {}),
      ...(q.status   ? { status:   q.status   } : {}),
      ...((q.from || q.to) ? {
        createdAt: {
          ...(q.from ? { gte: new Date(q.from) } : {}),
          ...(q.to   ? { lte: new Date(q.to)   } : {}),
        },
      } : {}),
    }

    // Vista global cross-tenant: usar directPrisma (bypassa RLS de bulk_upload_logs, HU-114)
    const { directPrisma: prisma } = await import('../../lib/prisma')
    const [data, total] = await Promise.all([
      prisma.bulkUploadLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
        select: {
          id:          true,
          tenantId:    true,
          userId:      true,
          type:        true,
          fileName:    true,
          fileSize:    true,
          rowCount:    true,
          recordCount: true,
          status:      true,
          errors:      true,
          createdAt:   true,
          finishedAt:  true,
          tenant:      { select: { name: true, slug: true } },
        },
      }),
      prisma.bulkUploadLog.count({ where }),
    ])

    return reply.code(200).send({ data, total, page, limit })
  })

  /**
   * GET /v1/admin/bulk-upload/logs/:id
   * Detalle completo de una carga masiva — sin restricción de tenant.
   */
  app.get('/bulk-upload/logs/:id', {
    schema: {
      tags:        ['Admin'],
      summary:     'Detalle de una carga masiva (global)',
      description: 'Devuelve el detalle completo de cualquier carga masiva de cualquier tenant. Solo SUPER_ADMIN.',
      security:    bearerAuth,
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      response: { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    // Vista global cross-tenant: usar directPrisma (bypassa RLS de bulk_upload_logs, HU-114)
    const { directPrisma: prisma } = await import('../../lib/prisma')

    const log = await prisma.bulkUploadLog.findUnique({
      where:  { id },
      select: {
        id:          true,
        tenantId:    true,
        userId:      true,
        type:        true,
        fileName:    true,
        fileSize:    true,
        rowCount:    true,
        recordCount: true,
        status:      true,
        errors:      true,
        createdAt:   true,
        finishedAt:  true,
        tenant:      { select: { name: true, slug: true } },
      },
    })

    if (!log) return reply.code(404).send({ error: 'Registro no encontrado', code: 'NOT_FOUND' })
    return reply.code(200).send(log)
  })

  /**
   * GET /v1/admin/bulk-upload/logs/:id/file
   * Descarga el archivo Excel original de cualquier carga masiva.
   */
  app.get('/bulk-upload/logs/:id/file', {
    schema: {
      tags:        ['Admin'],
      summary:     'Descargar archivo original de carga masiva',
      description: 'Descarga el archivo Excel exacto que el tenant subió. Útil para auditoría y resolución de disputas. Solo SUPER_ADMIN.',
      security:    bearerAuth,
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    // Vista global cross-tenant: usar directPrisma (bypassa RLS de bulk_upload_logs, HU-114)
    const { directPrisma: prisma } = await import('../../lib/prisma')
    const log = await prisma.bulkUploadLog.findUnique({
      where:  { id },
      select: { id: true, fileName: true, fileData: true },
    })

    if (!log) return reply.code(404).send({ error: 'Registro no encontrado', code: 'NOT_FOUND' })
    if (!log.fileData) return reply.code(404).send({ error: 'El archivo original no está disponible para este registro', code: 'FILE_NOT_FOUND' })

    const safeFileName = log.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const buffer = Buffer.from(log.fileData)

    return reply
      .code(200)
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="NEXOR_Auditoria_${safeFileName}"`)
      .header('Content-Length', buffer.length)
      .send(buffer)
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
