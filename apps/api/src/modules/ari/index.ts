import type { FastifyInstance } from 'fastify'
import { pipelineRoutes } from './pipeline/routes'
import { clientsRoutes } from './clients/routes'
import { quotesRoutes } from './quotes/routes'
import { reportsRoutes } from './reports/routes'

/**
 * Módulo ARI — Ventas, CRM y pipeline comercial.
 * Feature flag requerido: ARI = true (verificado en tenantHook).
 *
 * Prefijo registrado en app.ts: /v1/ari
 * Sub-rutas:
 *   /clients          — Gestión de clientes y leads
 *   /pipeline/stages  — Gestión de etapas del kanban
 *   /deals            — Gestión de deals
 *   /quotes           — Cotizaciones con integración KIRA
 *   /reports/sales    — Reporte de rendimiento de ventas
 *   /reports/pipeline — Reporte de estado del pipeline
 */
export default async function ariModule(app: FastifyInstance): Promise<void> {
  app.register(clientsRoutes, { prefix: '/clients' })
  app.register(pipelineRoutes)
  app.register(quotesRoutes,  { prefix: '/quotes' })
  app.register(reportsRoutes, { prefix: '/reports' })
}
