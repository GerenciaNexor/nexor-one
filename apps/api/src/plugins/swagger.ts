/**
 * Plugin de documentación OpenAPI (HU-087).
 *
 * Endpoints:
 *   GET /documentation      — OpenAPI 3.0 JSON spec (machine-readable)
 *   GET /documentation/ui   — Swagger UI interactivo (human-readable)
 *
 * Solo activo cuando NODE_ENV !== 'production'.
 * En producción estos endpoints no existen → Fastify devuelve 404 automáticamente.
 */

import type { FastifyInstance } from 'fastify'

export default async function swaggerPlugin(app: FastifyInstance): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') return

  // Importaciones dinámicas — los paquetes solo se cargan en dev/staging
  const { default: swagger }   = await import('@fastify/swagger')
  const { default: swaggerUI } = await import('@fastify/swagger-ui')

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title:   'NEXOR API',
        version: '1.0.0',
        description:
          'API REST de NEXOR — plataforma SaaS de gestión integral para PYMEs.\n\n' +
          'Incluye los módulos:\n' +
          '- **KIRA** — Inventario, stock y lotes\n' +
          '- **NIRA** — Proveedores y órdenes de compra\n' +
          '- **ARI** — CRM, pipeline de ventas y cotizaciones\n' +
          '- **AGENDA** — Servicios, disponibilidad y citas\n' +
          '- **VERA** — Finanzas, presupuestos y reportes\n\n' +
          '**Autenticación:** Bearer JWT. Obtén un token en `POST /v1/auth/login` ' +
          'y úsalo con el botón **Authorize** de esta UI.\n\n' +
          '**Nota:** Esta documentación solo está disponible en desarrollo y staging.',
        contact: { name: 'Equipo NEXOR', email: 'dev@nexor.co' },
        license: { name: 'Privado', url: 'https://nexor.co' },
      },
      servers: [
        { url: 'http://localhost:3001', description: 'Desarrollo local' },
        { url: 'https://api.staging.nexor.co', description: 'Staging' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type:         'http',
            scheme:       'bearer',
            bearerFormat: 'JWT',
            description:
              'Token JWT obtenido en `POST /v1/auth/login`.\n' +
              'Formato del header: `Authorization: Bearer <token>`\n' +
              '**Nota:** No incluir datos reales de producción en esta UI.',
          },
        },
        schemas: {
          Error: {
            type:       'object',
            required:   ['error', 'code'],
            properties: {
              error: { type: 'string', description: 'Mensaje de error legible' },
              code:  { type: 'string', description: 'Código de error para el cliente' },
            },
            example: { error: 'Recurso no encontrado', code: 'NOT_FOUND' },
          },
        },
      },
      // Seguridad global — todas las rutas requieren Bearer JWT salvo las marcadas con security: []
      security: [{ bearerAuth: [] }],
      tags: [
        { name: 'Auth',          description: 'Autenticación: login, refresh token y perfil' },
        { name: 'Tenants',       description: 'Configuración de la empresa y feature flags' },
        { name: 'Branches',      description: 'Gestión de sucursales' },
        { name: 'Users',         description: 'Usuarios, roles y permisos' },
        { name: 'KIRA',          description: 'Inventario: productos, stock, lotes, alertas y reportes' },
        { name: 'NIRA',          description: 'Compras: proveedores, órdenes de compra y reportes' },
        { name: 'ARI',           description: 'Ventas: clientes, pipeline, deals y cotizaciones' },
        { name: 'AGENDA',        description: 'Agenda: servicios, disponibilidad, citas y slots' },
        { name: 'VERA',          description: 'Finanzas: transacciones, categorías, presupuestos y reportes' },
        { name: 'Admin',         description: 'Panel del Super Administrador NEXOR (solo SUPER_ADMIN)' },
        { name: 'Notifications', description: 'Notificaciones in-app del usuario' },
        { name: 'Integrations',  description: 'Integraciones externas: WhatsApp Business y Gmail' },
        { name: 'Agents',        description: 'Logs de agentes IA del tenant' },
        { name: 'Chat',          description: 'Chat con el agente IA interno' },
      ],
    },
  })

  // Schema de error global referenciable como { $ref: 'Error#' }
  app.addSchema({
    $id:        'Error',
    type:       'object',
    required:   ['error', 'code'],
    properties: {
      error: { type: 'string' },
      code:  { type: 'string' },
    },
  })

  // GET /documentation — OpenAPI 3.0 JSON spec (machine-readable)
  app.get('/documentation', async (_request, reply) => {
    return reply
      .type('application/json')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .send((app as any).swagger())
  })

  // GET /documentation/ui — Swagger UI interactivo
  // uiConfig.url apunta al spec JSON en /documentation
  await app.register(swaggerUI, {
    routePrefix: '/documentation/ui',
    uiConfig: {
      url:                  '/documentation',   // spec desde /documentation, no /documentation/ui/json
      docExpansion:         'list',
      deepLinking:          true,
      persistAuthorization: true,
      tryItOutEnabled:      true,
      filter:               true,
    },
    staticCSP:    true,
    transformSpecificationClone: true,
  })

  app.log.info('📚 OpenAPI spec:  http://localhost:3001/documentation')
  app.log.info('📚 Swagger UI:    http://localhost:3001/documentation/ui')
}
