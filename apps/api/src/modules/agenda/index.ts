import type { FastifyInstance } from 'fastify'
import { requireFeatureFlag } from '../../lib/guards'
import { serviceTypesRoutes } from './services/routes'
import { availabilityRoutes } from './availability/routes'
import { blockedDatesRoutes } from './blocked-dates/routes'
import { slotsRoutes } from './slots/routes'
import { appointmentsRoutes } from './appointments/routes'

export default async function agendaModule(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireFeatureFlag('AGENDA'))
  app.register(serviceTypesRoutes, { prefix: '/services' })
  app.register(availabilityRoutes, { prefix: '/availability' })
  app.register(blockedDatesRoutes, { prefix: '/blocked-dates' })
  app.register(slotsRoutes,        { prefix: '/slots' })
  app.register(appointmentsRoutes, { prefix: '/appointments' })
}
