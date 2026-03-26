/**
 * Módulo Webhooks — Recepción de mensajes de canales externos.
 *
 * Registrado en app.ts como ruta PÚBLICA (sin JWT ni tenantHook).
 * La autenticidad se verifica internamente en cada handler:
 *   - WhatsApp → HMAC-SHA256 con WHATSAPP_APP_SECRET
 *   - Gmail    → HMAC con Google-signed JWT de Pub/Sub (HU-036+)
 *
 * Base path: /webhook
 *
 * Captura del raw body:
 * Se usa addContentTypeParser con parseAs:'buffer' en este scope para que cada
 * handler pueda verificar la firma HMAC sobre el body original sin consumir el
 * stream dos veces. El parser devuelve el body como Buffer — el handler parsea
 * el JSON manualmente. Esto aplica SOLO a las rutas de este módulo (scoped plugin).
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import whatsappWebhookRoutes from './whatsapp'
import gmailWebhookRoutes    from './gmail'

export default async function webhooksModule(app: FastifyInstance): Promise<void> {
  // Capturar el body como Buffer (raw) en lugar de parsearlo automáticamente.
  // Permite que los handlers verifiquen la firma HMAC antes de parsear el JSON.
  // Al estar dentro de un plugin de Fastify, solo afecta a las rutas de este módulo.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req: FastifyRequest, body: Buffer, done: (err: Error | null, body?: unknown) => void) => {
      try {
        const parsed = JSON.parse(body.toString('utf8'))
        // Adjuntamos el buffer original al parsed body para que el handler lo use en HMAC
        ;(parsed as Record<string, unknown>).__rawBuffer__ = body
        done(null, parsed)
      } catch {
        done(new Error('Invalid JSON body'))
      }
    },
  )

  await app.register(whatsappWebhookRoutes, { prefix: '/whatsapp' })
  await app.register(gmailWebhookRoutes,    { prefix: '/gmail' })
}
