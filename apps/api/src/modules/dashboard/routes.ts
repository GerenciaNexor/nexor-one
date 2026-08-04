import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { directPrisma } from '../../lib/prisma'
import { getDashboardKpis, getDashboardTimeseries, getTopProducts } from './service'
import { recalcTodayRollupForTenant } from '../../jobs/dashboard-rollup'
import { requireRole } from '../../lib/guards'
import { bearerAuth, objRes, stdErrors, z2j } from '../../lib/openapi'

const TimeseriesQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD').optional(),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD').optional(),
})

// Parseo + validación del rango de fechas (compartido por timeseries y top-products).
function parseRange(q: { from?: string; to?: string }): { from: Date; to: Date } | { error: string } {
  const to   = q.to   ? new Date(q.to   + 'T00:00:00.000Z') : new Date()
  const from = q.from ? new Date(q.from + 'T00:00:00.000Z') : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { error: 'Fecha inválida' }
  if (from > to) return { error: '"from" no puede ser posterior a "to"' }
  if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) return { error: 'El rango no puede superar 366 días' }
  return { from, to }
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/dashboard/kpis
   */
  app.get('/kpis', {
    schema: {
      tags:        ['Dashboard'],
      summary:     'KPIs del dashboard por módulo',
      description: 'Devuelve KPIs de todos los módulos activos del tenant en una sola respuesta. ' +
                   'OPERATIVE y AREA_MANAGER solo reciben KPIs de su módulo asignado. ' +
                   'Si un módulo falla, devuelve null con campo error sin afectar los demás.',
      security:    bearerAuth,
      response:    { 200: objRes, ...stdErrors },
    },
    // HU-122: el dashboard gestiona su propia transacción POR módulo (paralelas), así que
    // sale del wrapper de transacción por-request para no serializar los 5 KPIs en una conexión.
    config:     { tenantTx: false },
    preHandler: requireRole('OPERATIVE'),
  }, async (request, reply) => {
    const { tenantId, role, module: userModule } = request.user

    // directPrisma (bypass RLS) + filtro tenantId explícito: esta query corre fuera de la
    // transacción por-request (la ruta optó por salir); el WHERE garantiza el aislamiento.
    const flags = await directPrisma.featureFlag.findMany({
      where:  { tenantId, enabled: true },
      select: { module: true },
    })
    const activeModules = flags.map((f) => f.module as string)

    let modulesToFetch: string[]
    if (role === 'OPERATIVE' || role === 'AREA_MANAGER') {
      modulesToFetch = userModule && activeModules.includes(userModule)
        ? [userModule]
        : []
    } else {
      modulesToFetch = activeModules
    }

    const kpis = await getDashboardKpis(tenantId, modulesToFetch)

    return reply.send({
      success: true,
      data:    kpis,
    })
  })

  /**
   * GET /v1/dashboard/timeseries?from=YYYY-MM-DD&to=YYYY-MM-DD — HU-127
   * Series diarias para los gráficos de líneas. Lee del rollup diario (no consulta
   * pesada por carga). Respeta el rol (consolidado vs. sucursal). Default: últimos 30 días.
   * Corre dentro de la transacción por-request (HU-122) — sin tenantTx:false.
   */
  app.get('/timeseries', {
    schema: {
      tags:        ['Dashboard'],
      summary:     'Series temporales del Dashboard (rollup diario)',
      description: 'Devuelve los valores diarios de cada métrica (compras, ventas, OC creadas, cotizaciones) para los gráficos de líneas. Respeta el rol vía getBranchFilter.',
      security:    bearerAuth,
      querystring: z2j(TimeseriesQuerySchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRole('OPERATIVE'),
  }, async (request, reply) => {
    const parsed = TimeseriesQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos', code: 'VALIDATION_ERROR' })
    }
    const range = parseRange(parsed.data)
    if ('error' in range) return reply.code(400).send({ error: range.error, code: 'VALIDATION_ERROR' })

    const data = await getDashboardTimeseries(request.user.tenantId, request.user, range.from, range.to)
    return reply.send({ success: true, data })
  })

  /**
   * GET /v1/dashboard/top-products?from=YYYY-MM-DD&to=YYYY-MM-DD — HU-130
   * Top 10 de productos del rango: más vendidos (unidades) y mayor ganancia (margen).
   * Sale de stock_movements (solo salidas con motivo 'venta', precios congelados — HU-128).
   * Respeta el rol (consolidado vs sucursal). Corre en la tx por-request (HU-122).
   */
  app.get('/top-products', {
    schema: {
      tags:        ['Dashboard'],
      summary:     'Top 10 de productos (unidades vendidas / ganancia)',
      description: 'Top 10 por unidades vendidas y por ganancia (margen con precios congelados). Solo salidas con motivo venta. Respeta rol vía getBranchFilter.',
      security:    bearerAuth,
      querystring: z2j(TimeseriesQuerySchema),
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: requireRole('OPERATIVE'),
  }, async (request, reply) => {
    const parsed = TimeseriesQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos', code: 'VALIDATION_ERROR' })
    }
    const range = parseRange(parsed.data)
    if ('error' in range) return reply.code(400).send({ error: range.error, code: 'VALIDATION_ERROR' })

    const data = await getTopProducts(request.user.tenantId, request.user, range.from, range.to)
    return reply.send({ success: true, data })
  })

  /**
   * POST /v1/dashboard/refresh — HU-174
   * Recálculo a demanda del rollup del DÍA EN CURSO desde las transacciones reales
   * (ventas, compras y registro rápido), reutilizando la lógica del job. NO recarga: recalcula.
   * - "Hoy" en la zona del negocio (businessToday) → no toca los días pasados.
   * - Respeta tenant/sucursal/RLS: recalcTodayRollupForTenant corre bajo withTenantContext
   *   (SET LOCAL app.current_tenant_id) y las lecturas posteriores aplican el filtro por rol.
   * Sale del wrapper por-request (tenantTx:false): el recálculo abre su propia transacción.
   */
  app.post('/refresh', {
    schema: {
      tags:        ['Dashboard'],
      summary:     'Recalcular el rollup del día en curso (a demanda)',
      description: 'Fuerza el recálculo del rollup de hoy desde las transacciones reales y devuelve la marca de tiempo del cálculo. Solo recalcula el día en curso; no altera días pasados.',
      security:    bearerAuth,
      response:    { 200: objRes, ...stdErrors },
    },
    config:     { tenantTx: false },
    preHandler: requireRole('OPERATIVE'),
  }, async (request, reply) => {
    const { rows, date } = await recalcTodayRollupForTenant(request.user.tenantId)
    return reply.send({ success: true, data: { recalculatedAt: new Date().toISOString(), date, rows } })
  })
}
