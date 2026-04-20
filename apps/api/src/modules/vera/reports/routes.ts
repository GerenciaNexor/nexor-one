import type { FastifyInstance, FastifyReply } from 'fastify'
import { requireRoleAndModule } from '../../../lib/guards'
import { ReportQuerySchema, TimelineQuerySchema } from './schema'
import { getSummary, getTimeline, getCategoryBreakdown, exportCsv } from './service'

function errReply(reply: FastifyReply, err: unknown) {
  const e = err as { statusCode?: number; message?: string; code?: string }
  return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
}

export async function reportsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/vera/reports/summary?dateFrom=&dateTo=&branchId=
   * KPIs globales + desglose por sucursal y por módulo origen.
   */
  app.get('/summary', { preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA') }, async (request, reply) => {
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
   * GET /v1/vera/reports/timeline?dateFrom=&dateTo=&branchId=&granularity=day|week|month
   * Serie temporal de ingresos y egresos para graficar la evolución.
   */
  app.get('/timeline', { preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA') }, async (request, reply) => {
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
   * GET /v1/vera/reports/categories?dateFrom=&dateTo=&branchId=
   * Desglose de ingresos y egresos por categoría con monto y porcentaje del total.
   */
  app.get('/categories', { preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA') }, async (request, reply) => {
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
   * GET /v1/vera/reports/export?dateFrom=&dateTo=&branchId=
   * CSV descargable con todas las transacciones del periodo.
   */
  app.get('/export', { preHandler: requireRoleAndModule('AREA_MANAGER', 'VERA') }, async (request, reply) => {
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
