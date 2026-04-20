import type { FastifyInstance } from 'fastify'
import { serviceTypesRoutes } from './services/routes'
import { availabilityRoutes } from './availability/routes'
import { blockedDatesRoutes } from './blocked-dates/routes'
import { slotsRoutes } from './slots/routes'
import { appointmentsRoutes } from './appointments/routes'

/**
 * Módulo AGENDA — Agendamiento de citas.
 * Feature flag requerido: AGENDA = true (verificado en tenantHook).
 *
 * Prefijo registrado en app.ts: /v1/agenda
 * Sub-rutas:
 *   /services       — CRUD de servicios y asignación de profesionales (HU-067)
 *   /availability   — Bloques de disponibilidad por sucursal/profesional (HU-067)
 *   /blocked-dates  — Festivos y cierres especiales (HU-067)
 *   /slots          — Motor de horarios disponibles en tiempo real (HU-068)
 */
export default async function agendaModule(app: FastifyInstance): Promise<void> {
  app.register(serviceTypesRoutes, { prefix: '/services' })
  app.register(availabilityRoutes, { prefix: '/availability' })
  app.register(blockedDatesRoutes, { prefix: '/blocked-dates' })
  app.register(slotsRoutes,        { prefix: '/slots' })
  app.register(appointmentsRoutes, { prefix: '/appointments' })
}
