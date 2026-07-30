import type { FastifyInstance, FastifyReply } from 'fastify'
import { CreateReminderSchema, UpdateReminderSchema } from './schema'
import { createReminder, listReminders, updateReminder, deleteReminder, completeReminder } from './service'
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../lib/openapi'

const errReply = (reply: FastifyReply, err: unknown) => {
  const e = err as { statusCode?: number; message?: string; code?: string }
  return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
}

export async function remindersRoutes(app: FastifyInstance): Promise<void> {
  /** GET /v1/reminders — recordatorios del usuario. `status=pending|done` filtra; `activeOnly=true` = próximos. */
  app.get('/', {
    schema: {
      tags: ['Reminders'], summary: 'Listar recordatorios del usuario', security: bearerAuth,
      querystring: { type: 'object', properties: { activeOnly: { type: 'string' }, status: { type: 'string' } } },
      response: { 200: listRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const q = request.query as { activeOnly?: string; status?: string }
    const status = q.status === 'pending' || q.status === 'done' ? q.status : undefined
    const result = await listReminders(request.user.tenantId, request.user.userId, { status, activeOnly: q.activeOnly === 'true' })
    return reply.code(200).send(result)
  })

  /** POST /v1/reminders — crear recordatorio. */
  app.post('/', {
    schema: { tags: ['Reminders'], summary: 'Crear recordatorio', security: bearerAuth, body: z2j(CreateReminderSchema), response: { 201: objRes, ...stdErrors } },
  }, async (request, reply) => {
    const parsed = CreateReminderSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    try {
      const r = await createReminder(request.user.tenantId, request.user.userId, parsed.data)
      return reply.code(201).send({ success: true, data: r })
    } catch (err) { return errReply(reply, err) }
  })

  /** PUT /v1/reminders/:id — editar recordatorio. */
  app.put('/:id', {
    schema: { tags: ['Reminders'], summary: 'Editar recordatorio', security: bearerAuth, params: idParam, body: z2j(UpdateReminderSchema), response: { 200: objRes, ...stdErrors } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateReminderSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    try {
      const r = await updateReminder(request.user.tenantId, request.user.userId, id, parsed.data)
      return reply.code(200).send({ success: true, data: r })
    } catch (err) { return errReply(reply, err) }
  })

  /** POST /v1/reminders/:id/complete — marcar como hecho. body { series?: boolean } para finalizar la serie. */
  app.post('/:id/complete', {
    schema: { tags: ['Reminders'], summary: 'Marcar recordatorio como hecho', security: bearerAuth, params: idParam, body: { type: 'object', properties: { series: { type: 'boolean' } } }, response: { 200: objRes, ...stdErrors } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { series } = (request.body ?? {}) as { series?: boolean }
    try {
      const r = await completeReminder(request.user.tenantId, request.user.userId, id, { series: series === true })
      return reply.code(200).send({ success: true, data: r })
    } catch (err) { return errReply(reply, err) }
  })

  /** DELETE /v1/reminders/:id — eliminar recordatorio (solo si ya está hecho — HU-157). */
  app.delete('/:id', {
    schema: { tags: ['Reminders'], summary: 'Eliminar recordatorio', security: bearerAuth, params: idParam, response: { 200: objRes, ...stdErrors } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const r = await deleteReminder(request.user.tenantId, request.user.userId, id)
      return reply.code(200).send({ success: true, data: r })
    } catch (err) { return errReply(reply, err) }
  })
}
