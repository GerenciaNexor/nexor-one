import type { FastifyInstance, FastifyReply } from 'fastify'
import { CreateIncomingRentalSchema, IncomingRentalQuerySchema } from './schema'
import { createIncomingRental, listIncomingRentals, getIncomingRental } from './service'
import { requireRoleAndModule } from '../../../lib/guards'
import { z2j, listRes, objRes, idParam, stdErrors, bearerAuth } from '../../../lib/openapi'

const errReply = (reply: FastifyReply, err: unknown) => {
  const e = err as { statusCode?: number; message?: string; code?: string }
  return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
}

export async function incomingRentalsRoutes(app: FastifyInstance): Promise<void> {
  /** POST /v1/nira/incoming-rentals — registrar un alquiler entrante (de un tercero). */
  app.post('/', {
    schema: { tags: ['NIRA'], summary: 'Registrar alquiler entrante', security: bearerAuth, body: z2j(CreateIncomingRentalSchema), response: { 201: objRes, ...stdErrors } },
    preHandler: requireRoleAndModule('OPERATIVE', 'NIRA'),
  }, async (request, reply) => {
    const parsed = CreateIncomingRentalSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    // OPERATIVE queda atado a su propia sucursal (los admins pueden dejarla vacía o elegirla).
    const input = request.user.role === 'OPERATIVE'
      ? { ...parsed.data, branchId: request.user.branchId ?? parsed.data.branchId ?? null }
      : parsed.data
    try {
      const rental = await createIncomingRental(request.user.tenantId, request.user.userId, input)
      return reply.code(201).send({ success: true, data: rental })
    } catch (err) { return errReply(reply, err) }
  })

  /** GET /v1/nira/incoming-rentals/:id — detalle de un alquiler entrante. */
  app.get('/:id', {
    schema: { tags: ['NIRA'], summary: 'Detalle de alquiler entrante', security: bearerAuth, params: idParam, response: { 200: objRes, ...stdErrors } },
    preHandler: requireRoleAndModule('OPERATIVE', 'NIRA'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const rental = await getIncomingRental(request.user.tenantId, id)
      return reply.code(200).send({ success: true, data: rental })
    } catch (err) { return errReply(reply, err) }
  })

  /** GET /v1/nira/incoming-rentals — historial de alquileres entrantes (filtros: status/proveedor). */
  app.get('/', {
    schema: { tags: ['NIRA'], summary: 'Listar alquileres entrantes', security: bearerAuth, querystring: z2j(IncomingRentalQuerySchema), response: { 200: listRes, ...stdErrors } },
    preHandler: requireRoleAndModule('OPERATIVE', 'NIRA'),
  }, async (request, reply) => {
    const parsed = IncomingRentalQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos', code: 'VALIDATION_ERROR' })
    const result = await listIncomingRentals(request.user.tenantId, parsed.data)
    return reply.code(200).send(result)
  })
}
