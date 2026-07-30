import type { FastifyInstance, FastifyReply } from 'fastify'
import { CreateRentalSchema, ReturnRentalSchema, RentalQuerySchema } from './schema'
import { createRental, returnRental, listRentals, listRentalClients } from './service'
import { requireRoleAndModule } from '../../../lib/guards'
import { z2j, listRes, objRes, idParam, stdErrors, bearerAuth } from '../../../lib/openapi'

const errReply = (reply: FastifyReply, err: unknown) => {
  const e = err as { statusCode?: number; message?: string; code?: string }
  return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
}

export async function rentalsRoutes(app: FastifyInstance): Promise<void> {
  /** POST /v1/kira/rentals — registrar un alquiler (salida temporal; opera sobre el DISPONIBLE). */
  app.post('/', {
    schema: { tags: ['KIRA'], summary: 'Registrar alquiler', security: bearerAuth, body: z2j(CreateRentalSchema), response: { 201: objRes, ...stdErrors } },
    preHandler: requireRoleAndModule('OPERATIVE', 'KIRA'),
  }, async (request, reply) => {
    const parsed = CreateRentalSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    // OPERATIVE solo opera en su propia sucursal (coherente con movimientos de stock).
    if (request.user.role === 'OPERATIVE' && parsed.data.branchId !== request.user.branchId) {
      return reply.code(403).send({ error: 'Solo puedes alquilar en tu propia sucursal', code: 'FORBIDDEN' })
    }
    try {
      const rental = await createRental(request.user.tenantId, request.user.userId, parsed.data)
      return reply.code(201).send({ success: true, data: rental })
    } catch (err) { return errReply(reply, err) }
  })

  /** POST /v1/kira/rentals/:id/return — devolver un alquiler (libera el disponible). */
  app.post('/:id/return', {
    schema: { tags: ['KIRA'], summary: 'Devolver alquiler', security: bearerAuth, params: idParam, body: z2j(ReturnRentalSchema), response: { 200: objRes, ...stdErrors } },
    preHandler: requireRoleAndModule('OPERATIVE', 'KIRA'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = ReturnRentalSchema.safeParse(request.body ?? {})
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    try {
      const rental = await returnRental(request.user.tenantId, id, parsed.data)
      return reply.code(200).send({ success: true, data: rental })
    } catch (err) { return errReply(reply, err) }
  })

  /** GET /v1/kira/rentals/clients — clientes para el selector de alquiler (incluye "Consumidor final"). */
  app.get('/clients', {
    schema: { tags: ['KIRA'], summary: 'Clientes para alquiler', security: bearerAuth, response: { 200: listRes, ...stdErrors } },
    preHandler: requireRoleAndModule('OPERATIVE', 'KIRA'),
  }, async (request, reply) => {
    const result = await listRentalClients(request.user.tenantId)
    return reply.code(200).send(result)
  })

  /** GET /v1/kira/rentals — historial de alquileres (filtros: status/producto/sucursal/cliente). */
  app.get('/', {
    schema: { tags: ['KIRA'], summary: 'Listar alquileres', security: bearerAuth, querystring: z2j(RentalQuerySchema), response: { 200: listRes, ...stdErrors } },
    preHandler: requireRoleAndModule('OPERATIVE', 'KIRA'),
  }, async (request, reply) => {
    const parsed = RentalQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos', code: 'VALIDATION_ERROR' })
    const query = request.user.role === 'OPERATIVE'
      ? { ...parsed.data, branchId: request.user.branchId ?? parsed.data.branchId }
      : parsed.data
    const result = await listRentals(request.user.tenantId, query)
    return reply.code(200).send(result)
  })
}
