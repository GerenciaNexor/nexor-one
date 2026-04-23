import type { FastifyInstance } from 'fastify'
import { requireRoleAndModule } from '../../../lib/guards'
import { getBranchFilter } from '../../../lib/guards'
import { CreateAppointmentSchema, UpdateStatusSchema, ListAppointmentsQuerySchema } from './schema'
import { listAppointments, createAppointment, updateAppointmentStatus } from './service'
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../../lib/openapi'

export async function appointmentsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/agenda/appointments
   */
  app.get('/', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Listar citas',
      description: 'Lista citas del tenant. OPERATIVE/AREA_MANAGER/BRANCH_ADMIN ven solo su sucursal; TENANT_ADMIN ve todas.',
      security:    bearerAuth,
      querystring: z2j(ListAppointmentsQuerySchema),
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'AGENDA'),
  }, async (request, reply) => {
    const parsed = ListAppointmentsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos', code: 'VALIDATION_ERROR' })
    }

    try {
      const branchFilter = getBranchFilter(request.user)
      const result = await listAppointments(request.user.tenantId, parsed.data, branchFilter)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * POST /v1/agenda/appointments
   */
  app.post('/', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Crear cita',
      description: 'Crea una cita verificando disponibilidad del slot de forma atómica. Envía confirmación por email si status=confirmed.',
      security:    bearerAuth,
      body:        z2j(CreateAppointmentSchema),
      response:    { 201: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'AGENDA'),
  }, async (request, reply) => {
    const parsed = CreateAppointmentSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    }

    try {
      const appointment = await createAppointment(request.user.tenantId, parsed.data)
      return reply.code(201).send(appointment)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * PUT /v1/agenda/appointments/:id/status
   */
  app.put('/:id/status', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Cambiar estado de cita',
      description: 'Cambia el estado de una cita. Una cita cancelada no puede modificarse. Envía email de confirmación al confirmar.',
      security:    bearerAuth,
      params:      idParam,
      body:        z2j(UpdateStatusSchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRoleAndModule('OPERATIVE', 'AGENDA'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateStatusSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    }

    try {
      const result = await updateAppointmentStatus(request.user.tenantId, id, parsed.data.status, request.user)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
