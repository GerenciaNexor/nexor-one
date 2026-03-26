/**
 * Módulo NIRA — Compras y gestión de proveedores.
 *
 * Rutas registradas bajo /v1/nira/:
 *   /suppliers       → CRUD de proveedores (HU-039)
 *   /purchase-orders → OC con flujo de aprobación (HU-040, HU-041)
 *   /compare         → Comparador de precios por proveedor (HU-042)
 *   /reports         → Ranking de proveedores por score (HU-043)
 */

import type { FastifyInstance } from 'fastify'
import { suppliersRoutes }      from './suppliers/routes'
import { purchaseOrdersRoutes } from './purchase-orders/routes'
import { compareRoutes }        from './compare/routes'
import { reportsRoutes }        from './reports/routes'

export default async function niraModule(app: FastifyInstance): Promise<void> {
  await app.register(suppliersRoutes,      { prefix: '/suppliers' })
  await app.register(purchaseOrdersRoutes, { prefix: '/purchase-orders' })
  await app.register(compareRoutes,        { prefix: '/compare' })
  await app.register(reportsRoutes,        { prefix: '/reports' })
}
