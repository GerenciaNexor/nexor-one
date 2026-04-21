import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
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
    preHandler: requireRole('OPERATIVE'),
  }, async (request, reply) => {
    const { tenantId, role, module: userModule } = request.user

    const flags = await prisma.featureFlag.findMany({
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
