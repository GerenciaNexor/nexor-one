import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { listAllTenants, getTenantDetail, toggleTenant, logImpersonation } from './service'
import { z } from 'zod'

/**
 * Hook onRequest para el scope /v1/admin.
 * Verifica el JWT y exige exactamente el rol SUPER_ADMIN.
 * Registrado fuera del tenantHook porque SUPER_ADMIN opera a traves de todos los tenants.
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
   * GET /v1/admin/tenants?page=1&limit=20
   * Listado paginado de todas las empresas de la plataforma.
   */
  app.get('/tenants', async (request, reply) => {
    const query = request.query as { page?: string; limit?: string }
    const page = Math.max(1, Number(query.page ?? 1))
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)))
    const result = await listAllTenants(page, limit)
    return reply.code(200).send(result)
  })

  /**
   * GET /v1/admin/tenants/:id
   * Detalle completo: sucursales, usuarios y feature flags del tenant.
   */
  app.get('/tenants/:id', async (request, reply) => {
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
   * Activar o desactivar una empresa. Al desactivarla, el tenantHook rechaza
   * inmediatamente todos sus tokens con 403 TENANT_DISABLED.
   *
   * Restriccion: no se puede desactivar la propia empresa del Super Admin.
   */
  app.put('/tenants/:id/toggle', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = ToggleSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada invalidos',
        code: 'VALIDATION_ERROR',
      })
    }

    // No se puede desactivar la propia empresa del Super Admin
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
   * Genera un JWT de 1 hora que opera como TENANT_ADMIN del tenant objetivo.
   * El token NO tiene refresh token — no puede renovarse.
   * Queda registrado de forma permanente en agent_logs.
   */
  app.post('/tenants/:id/impersonate', async (request, reply) => {
    const { id } = request.params as { id: string }

    // Verificar que el tenant existe y esta activo
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

    // Token con rol TENANT_ADMIN del tenant objetivo, expira en 1 hora, sin refresh.
    // No se genera refresh token — la impersonacion no es renovable por diseno.
    const token = app.jwt.sign(
      {
        userId: request.user.userId,
        tenantId: id,
        branchId: null,
        role: 'TENANT_ADMIN' as const,
      },
      { expiresIn: '1h' },
    )

    // Audit log inmutable — APPEND-ONLY en agent_logs
    const requestIp = request.ip
    await logImpersonation(id, request.user.userId, requestIp)

    return reply.code(200).send({ token, expiresIn: '1h' })
  })
}
