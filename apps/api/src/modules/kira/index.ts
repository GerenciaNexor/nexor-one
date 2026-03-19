/**
 * Módulo KIRA — Inventario y control de stock.
 * Agente de inventario con alertas de stock crítico y clasificación ABC.
 */
import type { FastifyInstance } from 'fastify'
import productsModule from './products/index'

export default async function kiraModule(app: FastifyInstance): Promise<void> {
  await app.register(productsModule, { prefix: '/products' })
}
