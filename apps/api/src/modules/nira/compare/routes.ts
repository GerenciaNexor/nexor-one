import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { compareSupplierPrices } from './service'
import { requireRoleAndModule } from '../../../lib/guards'

const QuerySchema = z.object({
  productId: z.string().min(1, 'El productId es requerido'),
})

export async function compareRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/nira/compare?productId=xxx
   * Devuelve el historial de precios de un producto por proveedor.
   * Solo OC en estado 'received' son consideradas.
   * Ordenado por precio promedio ascendente.
   * OPERATIVE.NIRA o superior puede consultar.
   */
  app.get('/', { preHandler: requireRoleAndModule('OPERATIVE', 'NIRA') }, async (request, reply) => {
    const parsed = QuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code:  'VALIDATION_ERROR',
      })
    }
    try {
      const result = await compareSupplierPrices(request.user.tenantId, parsed.data.productId)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
