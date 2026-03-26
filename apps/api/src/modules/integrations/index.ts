/**
 * Módulo de integraciones — Gmail OAuth2 (HU-034)
 * WhatsApp — HU-035+
 *
 * Registrado en dos puntos de app.ts:
 *   - Rutas protegidas (tenantHook): /v1/integrations/*
 *   - Callback público (sin tenantHook): /v1/integrations/gmail/callback
 */

import type { FastifyInstance } from 'fastify'
import { integrationsRoutes } from './routes'

export default async function integrationsModule(app: FastifyInstance): Promise<void> {
  await app.register(integrationsRoutes)
}
