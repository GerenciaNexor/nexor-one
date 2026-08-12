import type { FastifyInstance, FastifyReply } from 'fastify'
import { CreateProjectSchema, UpdateProjectSchema } from './schema'
import { createProject, listProjects, getProject, updateProject, deleteProject } from './service'
import { requireRoleAndModule } from '../../lib/guards'
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../lib/openapi'

const errReply = (reply: FastifyReply, err: unknown) => {
  const e = err as { statusCode?: number; message?: string; code?: string }
  return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
}

// Lectura: cualquiera del módulo (OPERATIVE+). Gestión (crear/editar/eliminar): AREA_MANAGER+.
const canRead   = requireRoleAndModule('OPERATIVE', 'PROYECTOS')
const canManage = requireRoleAndModule('AREA_MANAGER', 'PROYECTOS')

export async function proyectosRoutes(app: FastifyInstance): Promise<void> {
  /** GET /v1/proyectos — lista con tipo, meta, avance/consumo y estado. `status`/`type` filtran. */
  app.get('/', {
    preHandler: canRead,
    schema: {
      tags: ['Proyectos'], summary: 'Listar proyectos', security: bearerAuth,
      querystring: { type: 'object', properties: { status: { type: 'string' }, type: { type: 'string' } } },
      response: { 200: listRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const q = request.query as { status?: string; type?: string }
    const result = await listProjects(request.user.tenantId, { status: q.status, type: q.type })
    return reply.code(200).send(result)
  })

  /** GET /v1/proyectos/:id — detalle: meta, avance/consumo, %, transacciones, fechas y estado. */
  app.get('/:id', {
    preHandler: canRead,
    schema: { tags: ['Proyectos'], summary: 'Detalle de proyecto', security: bearerAuth, params: idParam, response: { 200: objRes, ...stdErrors } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const p = await getProject(request.user.tenantId, id)
      return reply.code(200).send({ success: true, data: p })
    } catch (err) { return errReply(reply, err) }
  })

  /** POST /v1/proyectos — crear proyecto. */
  app.post('/', {
    preHandler: canManage,
    schema: { tags: ['Proyectos'], summary: 'Crear proyecto', security: bearerAuth, body: z2j(CreateProjectSchema), response: { 201: objRes, ...stdErrors } },
  }, async (request, reply) => {
    const parsed = CreateProjectSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    try {
      const p = await createProject(request.user.tenantId, request.user.userId, parsed.data)
      return reply.code(201).send({ success: true, data: p })
    } catch (err) { return errReply(reply, err) }
  })

  /** PUT /v1/proyectos/:id — editar proyecto (incluye cambiar de estado). */
  app.put('/:id', {
    preHandler: canManage,
    schema: { tags: ['Proyectos'], summary: 'Editar proyecto', security: bearerAuth, params: idParam, body: z2j(UpdateProjectSchema), response: { 200: objRes, ...stdErrors } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateProjectSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos', code: 'VALIDATION_ERROR' })
    try {
      const p = await updateProject(request.user.tenantId, id, parsed.data)
      return reply.code(200).send({ success: true, data: p })
    } catch (err) { return errReply(reply, err) }
  })

  /** DELETE /v1/proyectos/:id — eliminar proyecto. */
  app.delete('/:id', {
    preHandler: canManage,
    schema: { tags: ['Proyectos'], summary: 'Eliminar proyecto', security: bearerAuth, params: idParam, response: { 200: objRes, ...stdErrors } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const r = await deleteProject(request.user.tenantId, id)
      return reply.code(200).send({ success: true, data: r })
    } catch (err) { return errReply(reply, err) }
  })
}
