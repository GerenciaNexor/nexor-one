import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../../lib/prisma'
import { requireRoleAndModule } from '../../../lib/guards'
import { bearerAuth, objRes, stdErrors, z2j } from '../../../lib/openapi'

// HU-123 — proveedor preferido GLOBAL del tenant (respaldo cuando el producto no tiene uno).
const SetGlobalPreferredSchema = z.object({
  supplierId: z.string().min(1).nullable(),
})

export async function preferredSupplierRoutes(app: FastifyInstance): Promise<void> {
  /** GET /v1/nira/preferred-supplier — consulta el preferido global del tenant. */
  app.get('/', {
    schema: {
      tags:     ['NIRA'],
      summary:  'Proveedor preferido global del tenant',
      security: bearerAuth,
      response: { 200: objRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const tenant = await prisma.tenant.findUnique({
      where:  { id: request.user.tenantId },
      select: { defaultSupplier: { select: { id: true, name: true, isActive: true } } },
    })
    return reply.code(200).send({ success: true, data: tenant?.defaultSupplier ?? null })
  })

  /** PUT /v1/nira/preferred-supplier — fija o quita (supplierId=null) el preferido global. */
  app.put('/', {
    schema: {
      tags:     ['NIRA'],
      summary:  'Fijar o quitar el proveedor preferido global',
      security: bearerAuth,
      body:     z2j(SetGlobalPreferredSchema),
      response: { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'NIRA'),
  }, async (request, reply) => {
    const parsed = SetGlobalPreferredSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    }
    const { supplierId } = parsed.data
    const { tenantId } = request.user

    if (supplierId) {
      const sup = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true } })
      if (!sup) return reply.code(400).send({ error: 'Proveedor no encontrado en tu empresa', code: 'VALIDATION_ERROR' })
    }

    await prisma.tenant.update({ where: { id: tenantId }, data: { defaultSupplierId: supplierId } })
    return reply.code(200).send({
      success: true,
      message: supplierId ? 'Proveedor preferido global actualizado' : 'Proveedor preferido global quitado',
    })
  })
}
