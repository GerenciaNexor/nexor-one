import type { FastifyInstance } from 'fastify'
import { requireFeatureFlag } from '../../lib/guards'
import { categoriesRoutes }   from './categories/routes'
import { costCentersRoutes }  from './cost-centers/routes'
import { transactionsRoutes } from './transactions/routes'
import { budgetsRoutes }      from './budgets/routes'
import { reportsRoutes }      from './reports/routes'

export default async function veraModule(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireFeatureFlag('VERA'))
  app.register(categoriesRoutes,   { prefix: '/categories'   })
  app.register(costCentersRoutes,  { prefix: '/cost-centers' })
  app.register(transactionsRoutes, { prefix: '/transactions' })
  app.register(budgetsRoutes,      { prefix: '/budgets'      })
  app.register(reportsRoutes,      { prefix: '/reports'      })
}
