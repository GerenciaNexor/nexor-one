import type { FastifyInstance } from 'fastify'
import { directPrisma } from '../../lib/prisma'
import { getDashboardKpis } from './service'
import { requireRole } from '../../lib/guards'
import { bearerAuth, objRes, stdErrors } from '../../lib/openapi'

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
}
