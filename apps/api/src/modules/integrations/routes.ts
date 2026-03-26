/**
 * Rutas protegidas de integraciones — requieren JWT + tenantHook
 *
 * GET    /v1/integrations                → lista de integraciones del tenant (sin tokens)
 * POST   /v1/integrations/whatsapp       → conectar número de WhatsApp Business
 * GET    /v1/integrations/gmail/oauth    → genera URL de autorización de Google
 * GET    /v1/integrations/:id/test       → verifica el token contra la API de Meta
 * DELETE /v1/integrations/:id            → desconecta y elimina el token cifrado
 *
 * La ruta pública de callback de Google (GET /v1/integrations/gmail/callback)
 * se registra en app.ts fuera del scope de tenantHook.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireRole } from '../../lib/guards'
import {
  generateGmailOAuthUrl,
  getIntegrations,
  connectWhatsApp,
  testIntegration,
  disconnectIntegration,
} from './service'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ConnectWhatsAppSchema = z.object({
  /** phone_number_id entregado por Meta al configurar WhatsApp Business */
  phoneNumberId: z.string().min(1, 'phoneNumberId es requerido'),
  /** access_token de Meta — se cifra inmediatamente, nunca se devuelve */
  accessToken:   z.string().min(1, 'accessToken es requerido'),
  /** Asociar a una sucursal específica (opcional — null = nivel tenant) */
  branchId:      z.string().optional(),
})

// ─── Rutas ────────────────────────────────────────────────────────────────────

export async function integrationsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/integrations
   * Lista todas las integraciones del tenant sin incluir tokens.
   */
  app.get('/', { preHandler: [requireRole('BRANCH_ADMIN')] }, async (request, reply) => {
    try {
      const integrations = await getIntegrations(request.user.tenantId)
      return reply.code(200).send({ success: true, data: integrations })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * POST /v1/integrations/whatsapp
   * Registra un número de WhatsApp Business.
   * El access_token se cifra inmediatamente — el response nunca lo incluye.
   * La integración queda is_active: false hasta que se llame a /test.
   */
  app.post('/whatsapp', { preHandler: [requireRole('BRANCH_ADMIN')] }, async (request, reply) => {
    const parsed = ConnectWhatsAppSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Datos de entrada inválidos',
        code:  'VALIDATION_ERROR',
      })
    }

    try {
      const integration = await connectWhatsApp(request.user.tenantId, parsed.data)
      return reply.code(201).send({ success: true, data: integration })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * GET /v1/integrations/gmail/oauth
   * Genera la URL de autorización OAuth2 de Google.
   * El frontend redirige al usuario a esta URL.
   */
  app.get('/gmail/oauth', { preHandler: [requireRole('BRANCH_ADMIN')] }, async (request, reply) => {
    try {
      const authUrl = generateGmailOAuthUrl(request.user.tenantId, request.user.userId)
      return reply.code(200).send({ success: true, data: { authUrl } })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * GET /v1/integrations/:id/test
   * Verifica el access_token de una integración de WhatsApp llamando a la Graph API.
   * Actualiza is_active y last_verified_at según el resultado.
   * El token NUNCA aparece en el response.
   */
  app.get<{ Params: { id: string } }>(
    '/:id/test',
    { preHandler: [requireRole('BRANCH_ADMIN')] },
    async (request, reply) => {
      try {
        const result = await testIntegration(request.user.tenantId, request.params.id)
        return reply.code(200).send({ success: result.success, data: result })
      } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string; code?: string }
        return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
      }
    },
  )

  /**
   * DELETE /v1/integrations/:id
   * Desconecta la integración: elimina el token cifrado y marca is_active: false.
   * El registro permanece en DB para auditoría.
   */
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireRole('BRANCH_ADMIN')] },
    async (request, reply) => {
      try {
        await disconnectIntegration(request.user.tenantId, request.params.id)
        return reply.code(200).send({ success: true })
      } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string; code?: string }
        return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
      }
    },
  )
}
