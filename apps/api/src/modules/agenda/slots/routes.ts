import type { FastifyInstance } from 'fastify'
import { requireRoleAndModule } from '../../../lib/guards'
import { SlotsQuerySchema } from './schema'
import { getAvailableSlots } from './service'

export async function slotsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /v1/agenda/slots
   * Calcula los horarios disponibles para un servicio en una sucursal y fecha.
   *
   * Query params (todos requeridos excepto professionalId):
   *   serviceId      — ID del tipo de servicio
   *   branchId       — ID de la sucursal
   *   date           — Fecha en formato YYYY-MM-DD (en la zona horaria del tenant)
   *   professionalId — (opcional) Filtrar por profesional específico
   *
   * Respuesta:
   *   { date, serviceId, branchId, durationMinutes, timezone, slots[], total }
   *
   * Accesible por cualquier usuario autenticado con acceso al módulo AGENDA.
   * El agente IA lo usa desde WhatsApp para mostrar horarios en tiempo real.
   */
  app.get('/', { preHandler: requireRoleAndModule('OPERATIVE', 'AGENDA') }, async (request, reply) => {
    const parsed = SlotsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.errors[0]?.message ?? 'Parámetros inválidos',
        code:  'VALIDATION_ERROR',
      })
    }

    try {
      const result = await getAvailableSlots(request.user.tenantId, parsed.data)
      return reply.code(200).send(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; code?: string }
      return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Error interno', code: e.code ?? 'INTERNAL_ERROR' })
    }
  })
}
