import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import type { ApiResponse } from '@nexor/shared'
import { prisma } from './lib/prisma'
import jwtPlugin from './plugins/jwt'
import rateLimitPlugin from './plugins/rate-limit'
import { tenantHook } from './plugins/tenant'
import authModule from './modules/auth/index'
import tenantsModule from './modules/tenants/index'
import branchesModule from './modules/branches/index'
import notificationsModule from './modules/notifications/index'
import adminModule from './modules/admin/index'
import { superAdminHook } from './modules/admin/routes'

const app = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
  },
})

/** Cierra la conexion de Prisma al apagar el servidor. */
app.addHook('onClose', async () => {
  await prisma.$disconnect()
})

// ─── Plugins globales ────────────────────────────────────────────────────────
app.register(fastifyCors, {
  origin: process.env['CORS_ORIGIN']?.split(',') ?? 'http://localhost:3000',
  credentials: true,
})
app.register(jwtPlugin)
app.register(rateLimitPlugin)

// ─── Health check (sin autenticacion) ────────────────────────────────────────
app.get('/health', async (): Promise<ApiResponse<{ version: string; db: string }>> => {
  await prisma.$queryRaw`SELECT 1`
  return {
    success: true,
    data: { version: '1.0.0', db: 'connected' },
    message: 'API y base de datos funcionando correctamente',
  }
})

// ─── Rutas publicas — autenticacion (sin tenantHook) ─────────────────────────
app.register(authModule, { prefix: '/v1/auth' })

// ─── Panel de Super Admin — sin tenantHook, con superAdminHook propio ─────────
// El SUPER_ADMIN opera a traves de todos los tenants — no puede estar en el
// scope del tenantHook que restringe a un solo tenant.
app.register(
  async (adminApp) => {
    adminApp.addHook('onRequest', superAdminHook)
    adminApp.register(adminModule)
  },
  { prefix: '/v1/admin' },
)

// ─── Rutas protegidas (/v1/*) — requieren JWT valido + tenant activo ──────────
// Los modulos de negocio se registran dentro de este scope para que el
// tenantHook se ejecute automaticamente en todos sus endpoints.
app.register(
  async (api) => {
    api.addHook('onRequest', tenantHook)

    api.register(tenantsModule,       { prefix: '/tenants' })
    api.register(branchesModule,      { prefix: '/branches' })
    api.register(notificationsModule, { prefix: '/notifications' })
    // api.register(usersModule,  { prefix: '/users' })   — HU-008
    // api.register(ariModule,    { prefix: '/ari' })     — HU-009+
    // api.register(niraModule,   { prefix: '/nira' })
    // api.register(kiraModule,   { prefix: '/kira' })
    // api.register(agendaModule, { prefix: '/agenda' })
    // api.register(veraModule,   { prefix: '/vera' })
  },
  { prefix: '/v1' },
)

const start = async (): Promise<void> => {
  const port = Number(process.env['PORT'] ?? 3001)
  const host = process.env['HOST'] ?? '0.0.0.0'

  try {
    await app.listen({ port, host })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
