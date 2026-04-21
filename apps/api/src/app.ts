import { initSentry } from './plugins/sentry'
import { startAbcScheduler } from './jobs/abc-classification'
import { startStockAlertsScheduler } from './jobs/stock-alerts'
import { startIntegrationHealthScheduler } from './jobs/integration-health'
import { startSupplierScoresScheduler } from './jobs/supplier-scores'
import { startOverdueDeliveriesScheduler } from './jobs/overdue-deliveries'
import { startQuoteExpiryScheduler } from './jobs/quote-expiry'
import { startAppointmentRemindersScheduler } from './jobs/appointment-reminders'
import { startBudgetAlertsScheduler }         from './jobs/budget-alerts'

// Sentry debe inicializarse antes que cualquier otro modulo
initSentry()

// Validar ENCRYPTION_KEY antes de arrancar — falla rapido con mensaje claro
import { validateEncryptionKey } from './lib/encryption'
try {
  validateEncryptionKey()
} catch (err) {
  console.error('\n' + (err instanceof Error ? err.message : String(err)) + '\n')
  process.exit(1)
}

import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import type { ApiResponse } from '@nexor/shared'
import { prisma } from './lib/prisma'
import { closeQueues } from './lib/queue'
import { startWorker, closeWorker } from './lib/worker'
import { registerBullBoard } from './plugins/bull-board'
import jwtPlugin from './plugins/jwt'
import rateLimitPlugin from './plugins/rate-limit'
import sentryPlugin from './plugins/sentry'
import { tenantHook } from './plugins/tenant'
import webhooksModule from './modules/webhooks/index'
import gmailCallbackRoute from './modules/integrations/callback'
import authModule from './modules/auth/index'
import integrationsModule from './modules/integrations/index'
import tenantsModule from './modules/tenants/index'
import branchesModule from './modules/branches/index'
import notificationsModule from './modules/notifications/index'
import adminModule from './modules/admin/index'
import { superAdminHook } from './modules/admin/routes'
import swaggerPlugin from './plugins/swagger'
import ariModule from './modules/ari/index'
import kiraModule from './modules/kira/index'
import niraModule from './modules/nira/index'
import usersModule from './modules/users/index'
import agentsModule from './modules/agents/index'
import chatModule from './modules/chat/index'
import agendaModule from './modules/agenda/index'
import veraModule from './modules/vera/index'
import dashboardModule from './modules/dashboard/index'
import { cancelAppointmentRoutes } from './modules/agenda/cancel/routes'

const app = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
  },
  // AJV deshabilitado: la validación de requests la hace Zod en cada handler.
  // Los schemas en las rutas son exclusivamente para documentación OpenAPI.
  ajv: {
    customOptions: {
      removeAdditional: false,
      strict:           false,
      allowUnionTypes:  true,
    },
  },
})

// Deshabilitar el validador AJV: Zod valida en cada handler; los schemas son solo para OpenAPI.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.setSchemaController({ compilersFactory: { buildValidator: (() => () => true) as any } })

/** Cierra worker, colas y Prisma al apagar el servidor (en orden correcto). */
app.addHook('onClose', async () => {
  await closeWorker()                          // espera jobs en curso
  await Promise.all([prisma.$disconnect(), closeQueues()])
})

// ─── Documentación OpenAPI (solo dev/staging, antes de registrar rutas) ──────
app.register(swaggerPlugin)

// ─── Plugins globales ────────────────────────────────────────────────────────
app.register(fastifyCors, {
  origin: process.env['CORS_ORIGIN']?.split(',') ?? 'http://localhost:3000',
  credentials: true,
})
app.register(jwtPlugin)
app.register(rateLimitPlugin)
app.register(sentryPlugin)

// ─── Health check (sin autenticacion) — CI/CD test ───────────────────────────
app.get('/health', async (): Promise<ApiResponse<{ version: string; db: string }>> => {
  await prisma.$queryRaw`SELECT 1`
  return {
    success: true,
    data: { version: '1.0.0', db: 'connected' },
    message: 'API y base de datos funcionando correctamente',
  }
})

// ─── Webhooks de canales externos (sin JWT, sin tenantHook) ──────────────────
// Autenticidad verificada internamente por cada handler (HMAC, verify_token).
app.register(webhooksModule, { prefix: '/webhook' })

// ─── Callback OAuth2 de Google (sin JWT — el browser es redirigido aquí) ─────
// El state firmado con HMAC garantiza la autenticidad de la solicitud.
app.register(gmailCallbackRoute, { prefix: '/v1/integrations/gmail' })

// ─── Rutas publicas — autenticacion (sin tenantHook) ─────────────────────────
app.register(authModule, { prefix: '/v1/auth' })

// ─── Panel de Super Admin — sin tenantHook, con superAdminHook propio ─────────
// El SUPER_ADMIN opera a traves de todos los tenants — no puede estar en el
// scope del tenantHook que restringe a un solo tenant.
// Incluye el dashboard de Bull Board en /v1/admin/queues.
app.register(
  async (adminApp) => {
    adminApp.addHook('onRequest', superAdminHook)
    adminApp.register(adminModule)
    await registerBullBoard(adminApp, '/v1/admin/queues')
  },
  { prefix: '/v1/admin' },
)

// ─── Cancelación de cita por email (sin JWT — token actúa como credencial) ───
app.register(cancelAppointmentRoutes, { prefix: '/v1/agenda/cancel' })

// ─── Rutas protegidas (/v1/*) — requieren JWT valido + tenant activo ──────────
// Los modulos de negocio se registran dentro de este scope para que el
// tenantHook se ejecute automaticamente en todos sus endpoints.
app.register(
  async (api) => {
    api.addHook('onRequest', tenantHook)

    api.register(tenantsModule,       { prefix: '/tenants' })
    api.register(branchesModule,      { prefix: '/branches' })
    api.register(notificationsModule, { prefix: '/notifications' })
    api.register(ariModule,           { prefix: '/ari' })
    api.register(kiraModule,          { prefix: '/kira' })
    api.register(usersModule,         { prefix: '/users' })
    api.register(integrationsModule,  { prefix: '/integrations' })
    api.register(niraModule,          { prefix: '/nira' })
    api.register(agentsModule,        { prefix: '/agent-logs' })
    api.register(chatModule,          { prefix: '/chat' })
    api.register(agendaModule,        { prefix: '/agenda' })
    api.register(veraModule,          { prefix: '/vera' })
    api.register(dashboardModule,     { prefix: '/dashboard' })
  },
  { prefix: '/v1' },
)

const start = async (): Promise<void> => {
  const port = Number(process.env['PORT'] ?? 3001)
  const host = process.env['HOST'] ?? '0.0.0.0'

  try {
    await app.listen({ port, host })
    startWorker()                       // Worker BullMQ — procesa incoming-messages
    startAbcScheduler()
    startStockAlertsScheduler()
    startIntegrationHealthScheduler()   // Verifica tokens de WhatsApp y Gmail cada 7 días
    startSupplierScoresScheduler()      // Calcula scores de proveedores cada 24 h
    startOverdueDeliveriesScheduler()   // Detecta OC con entregas vencidas cada 24 h
    startQuoteExpiryScheduler()         // Vence cotizaciones y alerta por vencimiento próximo
    startAppointmentRemindersScheduler() // Envía recordatorios de citas del día siguiente
    startBudgetAlertsScheduler()         // Alertas de presupuesto VERA — corre cada 24 h
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
