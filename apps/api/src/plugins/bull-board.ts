/**
 * Dashboard de Bull Board — visualización de colas BullMQ
 *
 * Accesible en: /v1/admin/queues
 * Protección: hereda el superAdminHook del scope /v1/admin — solo SUPER_ADMIN.
 *
 * Nota sobre acceso desde el navegador:
 * El superAdminHook valida el JWT en cada request (incluyendo assets estáticos).
 * Para usar el dashboard desde un navegador, se recomienda una herramienta como
 * Requestly o ModHeader para adjuntar el bearer token automáticamente.
 * En producción, considera añadir un proxy inverso con sesión de admin.
 */

import type { FastifyInstance } from 'fastify'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { FastifyAdapter } from '@bull-board/fastify'
import { incomingMessagesQueue } from '../lib/queue'

/**
 * Registra el plugin de Bull Board en el scope de Fastify dado.
 * Debe llamarse dentro del scope que ya tiene el superAdminHook aplicado.
 *
 * @param app    La instancia de Fastify (del scope admin)
 * @param prefix El prefix completo donde se montará el dashboard (ej: /v1/admin/queues)
 */
export async function registerBullBoard(app: FastifyInstance, prefix: string): Promise<void> {
  const serverAdapter = new FastifyAdapter()
  serverAdapter.setBasePath(prefix)

  createBullBoard({
    queues: [
      new BullMQAdapter(incomingMessagesQueue),
    ],
    serverAdapter,
  })

  await app.register(serverAdapter.registerPlugin(), { prefix: '/queues' })
}
