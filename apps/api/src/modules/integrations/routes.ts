/**
 * Rutas de integraciones del CLIENTE — SOLO LECTURA (HU-139).
 *
 * GET /v1/integrations → estado de los canales del tenant (Conectado / No conectado /
 * última verificación), SIN tokens. La gestión de credenciales (conectar/desconectar/
 * verificar WhatsApp y Gmail) la hace EXCLUSIVAMENTE el equipo NEXOR desde la plataforma
 * (`/v1/admin/tenants/:id/integrations/*`, HU-139). El cliente ya no ve la pantalla de
 * credenciales de Meta.
 *
 * La ruta pública de callback de Google (GET /v1/integrations/gmail/callback) se registra
 * en app.ts fuera del scope de tenantHook.
 */
import type { FastifyInstance } from 'fastify'
import { requireRole } from '../../lib/guards'
import { directPrisma } from '../../lib/prisma'
import { getIntegrations, generateGmailOAuthUrl } from './service'
import { listRes, objRes, stdErrors, bearerAuth } from '../../lib/openapi'

export async function integrationsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/integrations — estado (sin tokens). Requiere BRANCH_ADMIN.
   */
  app.get('/', {
    schema: {
      tags:        ['Integrations'],
      summary:     'Estado de las integraciones del cliente',
      description: 'Solo lectura: estado de los canales (sin tokens). WhatsApp lo gestiona NEXOR; Gmail lo conecta el cliente por OAuth.',
      security:    bearerAuth,
      response:    { 200: listRes, ...stdErrors },
    },
    preHandler: [requireRole('BRANCH_ADMIN')],
  }, async (request, reply) => {
    try {
      const integrations = await getIntegrations(request.user.tenantId)
      return reply.code(200).send({ success: true, data: integrations })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * GET /v1/integrations/gmail/connect-url — inicia el OAuth de Gmail (lo hace el CLIENTE).
   * Devuelve la URL de consentimiento de Google; el frontend redirige al usuario allí para que
   * elija su cuenta y otorgue permiso. Solo el TENANT_ADMIN puede vincular el buzón del tenant.
   */
  app.get('/gmail/connect-url', {
    schema: { tags: ['Integrations'], summary: 'URL de conexión de Gmail (OAuth del cliente)', security: bearerAuth, response: { 200: objRes, ...stdErrors } },
    preHandler: [requireRole('TENANT_ADMIN')],
  }, async (request, reply) => {
    try {
      const url = generateGmailOAuthUrl(request.user.tenantId, request.user.userId)
      return reply.code(200).send({ success: true, data: { url } })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * DELETE /v1/integrations/gmail — el CLIENTE desconecta su propio Gmail (elimina el buzón vinculado).
   */
  app.delete('/gmail', {
    schema: { tags: ['Integrations'], summary: 'Desconectar Gmail del cliente', security: bearerAuth, response: { 200: objRes, ...stdErrors } },
    preHandler: [requireRole('TENANT_ADMIN')],
  }, async (request, reply) => {
    const r = await directPrisma.integration.deleteMany({ where: { tenantId: request.user.tenantId, channel: 'GMAIL' } })
    return reply.code(200).send({ success: true, data: { removed: r.count } })
  })
}
