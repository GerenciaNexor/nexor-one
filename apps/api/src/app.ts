import { initSentry } from './plugins/sentry'
import { startAbcScheduler } from './jobs/abc-classification'
import { startStockAlertsScheduler } from './jobs/stock-alerts'
import { startIntegrationHealthScheduler } from './jobs/integration-health'
import { startSupplierScoresScheduler } from './jobs/supplier-scores'
import { startOverdueDeliveriesScheduler } from './jobs/overdue-deliveries'
import { startQuoteExpiryScheduler } from './jobs/quote-expiry'
import { startAppointmentRemindersScheduler } from './jobs/appointment-reminders'
import { startBudgetAlertsScheduler }         from './jobs/budget-alerts'
import { startDashboardRollupScheduler }      from './jobs/dashboard-rollup'
import { startDemoExpiryScheduler }           from './jobs/demo-expiry'
import { startReminderScheduler }             from './jobs/reminder-fire'

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
import type { FastifyRequest, FastifyReply } from 'fastify'
import fastifyCors from '@fastify/cors'
import type { ApiResponse } from '@nexor/shared'
import { prisma, runInTenantTransaction } from './lib/prisma'
import { closeQueues } from './lib/queue'
import { startWorker, closeWorker } from './lib/worker'
import { closeLoginLimiter } from './modules/auth/login-limiter'
import { registerBullBoard } from './plugins/bull-board'
import jwtPlugin from './plugins/jwt'
import rateLimitPlugin from './plugins/rate-limit'
import sentryPlugin from './plugins/sentry'
import { tenantHook } from './plugins/tenant'
import webhooksModule from './modules/webhooks/index'
import gmailCallbackRoute from './modules/integrations/callback'
import authModule from './modules/auth/index'
import platformModule from './modules/platform/index'
import integrationsModule from './modules/integrations/index'
import tenantsModule from './modules/tenants/index'
import branchesModule from './modules/branches/index'
import notificationsModule from './modules/notifications/index'
import remindersModule from './modules/reminders/index'
import adminModule from './modules/admin/index'
import { superAdminHook } from './modules/admin/routes'
import swaggerPlugin from './plugins/swagger'
import securityHeadersPlugin from './plugins/security-headers'
import multipartPlugin from './plugins/multipart'
import ariModule from './modules/ari/index'
import kiraModule from './modules/kira/index'
import niraModule from './modules/nira/index'
import usersModule from './modules/users/index'
import agentsModule from './modules/agents/index'
import chatModule from './modules/chat/index'
import agendaModule from './modules/agenda/index'
import veraModule from './modules/vera/index'
import dashboardModule from './modules/dashboard/index'
import bulkUploadModule from './modules/bulk-upload/index'
import inboxModule from './modules/inbox/index'
import ocrModule from './modules/ocr/index'
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
// buildValidator(externalSchemas)(schema) → validatorFn(data) — 3 niveles requeridos por Fastify 4.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.setSchemaController({ compilersFactory: { buildValidator: (() => () => () => true) as any } })

/** Cierra worker, colas y Prisma al apagar el servidor (en orden correcto). */
app.addHook('onClose', async () => {
  await closeWorker()                          // espera jobs en curso
  await Promise.all([prisma.$disconnect(), closeQueues(), closeLoginLimiter()])
})

// ─── Documentación OpenAPI (solo dev/staging, antes de registrar rutas) ──────
app.register(swaggerPlugin)

// ─── Plugins globales ────────────────────────────────────────────────────────
// CORS: orígenes permitidos desde la env var CORS_ORIGIN (lista separada por comas).
// Se recorta cada valor y se descartan vacíos → tolera espacios tras la coma en la
// config de Railway (evita un fallo silencioso de CORS por un espacio de más).
const corsOrigins = (process.env['CORS_ORIGIN'] ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.register(fastifyCors, {
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
})
app.register(jwtPlugin)
app.register(rateLimitPlugin)
app.register(sentryPlugin)
app.register(securityHeadersPlugin)
app.register(multipartPlugin)

// ─── Error handler global — enmascara detalles internos en 5xx ───────────────
app.setErrorHandler((err, request, reply) => {
  const statusCode = err.statusCode ?? 500
  if (statusCode >= 500) {
    request.log.error({ err }, 'Unhandled error')
    return reply.code(statusCode).send({ error: 'Error interno del servidor', code: 'INTERNAL_ERROR' })
  }
  // 4xx: re-enviar con mensaje limpio (sin stack trace)
  return reply.code(statusCode).send({
    error: err.message,
    code:  (err as { code?: string }).code ?? 'REQUEST_ERROR',
  })
})

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

// ─── Autenticacion de PLATAFORMA (HU-134) — identidad separada del equipo NEXOR ─
// Publica (sin tenantHook, sin transaccion por-request): emite un JWT SIN tenantId.
app.register(platformModule, { prefix: '/v1/platform' })

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

    // HU-122 — Contexto de tenant confiable por-request.
    // Envuelve CADA handler protegido en una transacción interactiva con SET LOCAL
    // (runInTenantTransaction), de modo que contexto y queries comparten conexión y
    // RLS aísla de forma confiable bajo concurrencia. Las rutas que hacen I/O externo
    // pesado pueden optar por salir con `config: { tenantTx: false }` y manejar su DB
    // con withTenantContext.
    api.addHook('onRoute', (routeOptions) => {
      if ((routeOptions.config as { tenantTx?: boolean } | undefined)?.tenantTx === false) return
      const original = routeOptions.handler
      if (typeof original !== 'function') return
      routeOptions.handler = function (this: unknown, req: FastifyRequest, reply: FastifyReply) {
        const tenantId = (req.user as { tenantId?: string } | undefined)?.tenantId
        const run = () => (original as (rq: FastifyRequest, rp: FastifyReply) => unknown).call(this, req, reply)
        if (!tenantId) return run()
        return runInTenantTransaction(tenantId, async () => run())
      }
    })

    api.register(tenantsModule,       { prefix: '/tenants' })
    api.register(branchesModule,      { prefix: '/branches' })
    api.register(notificationsModule, { prefix: '/notifications' })
    api.register(remindersModule,     { prefix: '/reminders' })
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
    api.register(bulkUploadModule,    { prefix: '/bulk-upload' })
    api.register(inboxModule,         { prefix: '/inbox' })
    api.register(ocrModule,           { prefix: '/ocr' })
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
    startDashboardRollupScheduler()      // Rollup diario del Dashboard (HU-127) — corre cada 24 h
    startDemoExpiryScheduler()           // HU-142 — suspende demos vencidas cada 1 h (sin borrar)
    startReminderScheduler()             // HU-156 — dispara recordatorios cada 1 min → notificación
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
