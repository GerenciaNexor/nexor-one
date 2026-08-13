import type { FastifyInstance, FastifyReply } from 'fastify'
import { CreateProjectSchema, UpdateProjectSchema } from './schema'
import { createProject, listProjects, getProject, updateProject, deleteProject, assignTransaction } from './service'
import { listPendingApprovals, resolveApproval } from './budget'
import { requireRole } from '../../lib/guards'
import { z2j, idParam, listRes, objRes, stdErrors, bearerAuth } from '../../lib/openapi'

const errReply = (reply: FastifyReply, err: unknown) => {
  const e = err as { statusCode?: number; message?: string; code?: string }
  return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
}

// El módulo ya exige el feature-flag PROYECTOS a nivel de tenant (index.ts). Proyectos es transversal
// (metas/presupuestos de toda la empresa; la asignación de transacciones cruza módulos), así que:
//   · Lectura (lista/detalle/selector): cualquier usuario del tenant (OPERATIVE+).
//   · Gestión (crear/editar/eliminar/asignar): jefe de área o superior (AREA_MANAGER+), por ROL.
//   · Aprobar sobregastos (HU-200): SOLO admins del tenant — TENANT_ADMIN o BRANCH_ADMIN.
const canRead    = requireRole('OPERATIVE')
const canManage  = requireRole('AREA_MANAGER')
const canApprove = requireRole('BRANCH_ADMIN')

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

  /** GET /v1/proyectos/aprobaciones — sobregastos EN ESPERA del tenant (para los admins). */
  app.get('/aprobaciones', {
    preHandler: canApprove,
    schema: { tags: ['Proyectos'], summary: 'Sobregastos pendientes de aprobación', security: bearerAuth, response: { 200: listRes, ...stdErrors } },
  }, async (request, reply) => {
    const result = await listPendingApprovals(request.user.tenantId)
    return reply.code(200).send(result)
  })

  /** POST /v1/proyectos/aprobaciones/:id/resolver — aprobar / rechazar / aumentar tope (admin del tenant). */
  app.post('/aprobaciones/:id/resolver', {
    preHandler: canApprove,
    schema: {
      tags: ['Proyectos'], summary: 'Resolver un sobregasto', security: bearerAuth, params: idParam,
      body: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['approve', 'reject', 'increase_tope'] }, newTope: { type: 'number' }, reason: { type: 'string' } } },
      response: { 200: objRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { action, newTope, reason } = (request.body ?? {}) as { action: 'approve' | 'reject' | 'increase_tope'; newTope?: number; reason?: string }
    if (!['approve', 'reject', 'increase_tope'].includes(action)) return reply.code(400).send({ error: 'Acción inválida', code: 'VALIDATION_ERROR' })
    if (action === 'increase_tope' && !(typeof newTope === 'number' && newTope > 0)) return reply.code(400).send({ error: 'Indica el nuevo tope', code: 'VALIDATION_ERROR' })
    try {
      const r = await resolveApproval(request.user.tenantId, id, request.user.userId, action, { newTope, reason })
      return reply.code(200).send({ success: true, data: r })
    } catch (err) { return errReply(reply, err) }
  })

  /** PATCH /v1/proyectos/transacciones/:txId — asignar / cambiar / quitar (projectId=null) el proyecto
   *  de una transacción. Manual y opcional; solo transacciones y proyectos del mismo tenant. */
  app.patch('/transacciones/:txId', {
    preHandler: canManage,
    schema: {
      tags: ['Proyectos'], summary: 'Asignar/quitar el proyecto de una transacción', security: bearerAuth,
      params: { type: 'object', required: ['txId'], properties: { txId: { type: 'string' } } },
      body: { type: 'object', properties: { projectId: { type: ['string', 'null'] } } },
      response: { 200: objRes, ...stdErrors },
    },
  }, async (request, reply) => {
    const { txId } = request.params as { txId: string }
    const { projectId } = (request.body ?? {}) as { projectId?: string | null }
    if (projectId !== null && projectId !== undefined && typeof projectId !== 'string') {
      return reply.code(400).send({ error: 'projectId inválido', code: 'VALIDATION_ERROR' })
    }
    try {
      const r = await assignTransaction(request.user.tenantId, txId, projectId ?? null, request.user.userId)
      return reply.code(200).send({ success: true, data: r })
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
