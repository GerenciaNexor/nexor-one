import type { FastifyInstance, FastifyReply } from 'fastify'
import { requireRoleAndModule } from '../../../lib/guards'
import { ReportQuerySchema, TimelineQuerySchema } from './schema'
import { getSummary, getTimeline, getCategoryBreakdown, exportCsv } from './service'
import { z2j, stdErrors, bearerAuth } from '../../../lib/openapi'

function errReply(reply: FastifyReply, err: unknown) {
  const e = err as { statusCode?: number; message?: string; code?: string }
  return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
}

export async function reportsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/vera/reports/summary
   */
  app.get('/summary', {
    schema: {
      tags:        ['VERA'],
      summary:     'Resumen financiero',
      description: 'KPIs globales + desglose por sucursal y módulo origen. Requiere AREA_MANAGER.VERA.',
      security:    bearerAuth,
      querystring: z2j(ReportQuerySchema),
      response:    { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
    const parsed = ReportQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos', code: 'VALIDATION_ERROR' })
    }
    try {
      const data = await getSummary(request.user.tenantId, parsed.data)
      return reply.code(200).send(data)
    } catch (err) { return errReply(reply, err) }
  })

  /**
   * GET /v1/vera/reports/timeline
   */
  app.get('/timeline', {
    schema: {
      tags:        ['VERA'],
      summary:     'Serie temporal de ingresos y egresos',
      description: 'Serie temporal agrupada por día, semana o mes para graficar la evolución financiera.',
      security:    bearerAuth,
      querystring: z2j(TimelineQuerySchema),
      response:    { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
    const parsed = TimelineQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos', code: 'VALIDATION_ERROR' })
    }
    try {
      const data = await getTimeline(request.user.tenantId, parsed.data)
      return reply.code(200).send({ data })
    } catch (err) { return errReply(reply, err) }
  })

  /**
   * GET /v1/vera/reports/categories
   */
  app.get('/categories', {
    schema: {
      tags:        ['VERA'],
      summary:     'Desglose por categoría',
      description: 'Ingresos y egresos por categoría con monto y porcentaje del total.',
      security:    bearerAuth,
      querystring: z2j(ReportQuerySchema),
      response:    { 200: { type: 'object', additionalProperties: true }, ...stdErrors },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
    const parsed = ReportQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos', code: 'VALIDATION_ERROR' })
    }
    try {
      const data = await getCategoryBreakdown(request.user.tenantId, parsed.data)
      return reply.code(200).send({ data })
    } catch (err) { return errReply(reply, err) }
  })

  /**
   * GET /v1/vera/reports/export
   */
  app.get('/export', {
    schema: {
      tags:        ['VERA'],
      summary:     'Exportar transacciones CSV',
      description: 'Descarga un CSV con todas las transacciones del período seleccionado.',
      security:    bearerAuth,
      querystring: z2j(ReportQuerySchema),
      response:    { 200: { type: 'string', description: 'Archivo CSV' } },
    },
    preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA'),
  }, async (request, reply) => {
    const parsed = ReportQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos', code: 'VALIDATION_ERROR' })
    }
    try {
      const csv      = await exportCsv(request.user.tenantId, parsed.data)
      const filename = `vera-transactions-${new Date().toISOString().slice(0, 10)}.csv`
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .code(200)
        .send(csv)
    } catch (err) { return errReply(reply, err) }
  })
}
