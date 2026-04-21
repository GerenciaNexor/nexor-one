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
import { idParam, listRes, objRes, stdErrors, bearerAuth } from '../../lib/openapi'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ConnectWhatsAppSchema = z.object({
  phoneNumberId: z.string().min(1, 'phoneNumberId es requerido'),
  accessToken:   z.string().min(1, 'accessToken es requerido'),
  branchId:      z.string().optional(),
})

// ─── Rutas ────────────────────────────────────────────────────────────────────

export async function integrationsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/integrations
   */
  app.get('/', {
    schema: {
      tags:        ['Integrations'],
      summary:     'Listar integraciones',
      description: 'Lista todas las integraciones del tenant sin incluir tokens. Requiere BRANCH_ADMIN.',
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
   * POST /v1/integrations/whatsapp
   */
  app.post('/whatsapp', {
    schema: {
      tags:        ['Integrations'],
      summary:     'Conectar WhatsApp Business',
      description: 'Registra un número de WhatsApp Business. El access_token se cifra inmediatamente y nunca aparece en el response.',
      security:    bearerAuth,
      body: {
        type: 'object',
        required: ['phoneNumberId', 'accessToken'],
        properties: {
          phoneNumberId: { type: 'string' },
          accessToken:   { type: 'string' },
          branchId:      { type: 'string' },
        },
      },
      response: { 201: objRes, ...stdErrors },
    },
    preHandler: [requireRole('BRANCH_ADMIN')],
  }, async (request, reply) => {
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
   */
  app.get('/gmail/oauth', {
    schema: {
      tags:        ['Integrations'],
      summary:     'URL de autorización Gmail OAuth2',
      description: 'Genera la URL de autorización OAuth2 de Google. El frontend redirige al usuario a esta URL.',
      security:    bearerAuth,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: [requireRole('BRANCH_ADMIN')],
  }, async (request, reply) => {
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
   */
  app.get<{ Params: { id: string } }>('/:id/test', {
    schema: {
      tags:        ['Integrations'],
      summary:     'Verificar token de integración',
      description: 'Verifica el access_token llamando a la Graph API de Meta. Actualiza is_active y last_verified_at.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: [requireRole('BRANCH_ADMIN')],
  }, async (request, reply) => {
    try {
      const result = await testIntegration(request.user.tenantId, request.params.id)
      return reply.code(200).send({ success: result.success, data: result })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })

  /**
   * DELETE /v1/integrations/:id
   */
  app.delete<{ Params: { id: string } }>('/:id', {
    schema: {
      tags:        ['Integrations'],
      summary:     'Desconectar integración',
      description: 'Elimina el token cifrado y marca is_active: false. El registro permanece en DB para auditoría.',
      security:    bearerAuth,
      params:      idParam,
      response:    { 200: objRes, ...stdErrors },
    },
    preHandler: [requireRole('BRANCH_ADMIN')],
  }, async (request, reply) => {
    try {
      await disconnectIntegration(request.user.tenantId, request.params.id)
      return reply.code(200).send({ success: true })
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
