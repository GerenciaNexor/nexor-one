/**
 * Ruta pública de callback OAuth2 de Gmail
 *
 * GET /v1/integrations/gmail/callback?code=...&state=...
 *
 * Google redirige el BROWSER del usuario aquí tras la autorización.
 * No requiere JWT — la autenticidad está garantizada por:
 *   1. La firma HMAC del state (previene CSRF)
 *   2. El código de autorización de Google (un solo uso)
 *
 * Registrada en app.ts FUERA del scope de tenantHook, junto a las rutas públicas.
 * Redirige al frontend tras completar el proceso.
 */

import type { FastifyInstance } from 'fastify'
import { handleGmailCallback } from './service'

export default async function gmailCallbackRoute(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/integrations/gmail/callback
   * Intercambia el código de Google por tokens, cifra y guarda el refresh_token.
   * Redirige al frontend con el resultado.
   */
  app.get<{
    Querystring: {
      code?:  string
      state?: string
      error?: string
    }
  }>('/callback', async (request, reply) => {
    const frontendBase = process.env['CORS_ORIGIN']?.split(',')[0] ?? 'http://localhost:3000'
    const successUrl   = `${frontendBase}/settings/integrations?gmail=success`
    const errorUrl     = `${frontendBase}/settings/integrations?gmail=error`

    // Google puede devolver error si el usuario cancela (error=access_denied)
    if (request.query.error) {
      request.log.warn(
        { event: 'gmail_oauth_cancelled', error: request.query.error },
        'Usuario canceló la autorización de Gmail',
      )
      return reply.redirect(302, errorUrl + '&reason=cancelled')
    }

    const { code, state } = request.query

    if (!code || !state) {
      return reply.redirect(302, errorUrl + '&reason=missing_params')
    }

    try {
      const { tenantId, email } = await handleGmailCallback(code, state)

      request.log.info(
        { event: 'gmail_oauth_success', tenantId, email },
        'Gmail conectado correctamente',
      )

      return reply.redirect(302, successUrl)
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string }
      request.log.error(
        { event: 'gmail_oauth_failed', error: e.message, code: e.code },
        'Error en callback de Gmail OAuth',
      )
      return reply.redirect(302, errorUrl + `&reason=${e.code ?? 'unknown'}`)
    }
  })
}
