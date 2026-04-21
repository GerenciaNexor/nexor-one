import type { FastifyInstance } from 'fastify'
import { prisma } from '../../../lib/prisma'

// ─── Páginas HTML de respuesta (el cliente abre el enlace en el navegador) ────

function successHtml(clientName: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Cita cancelada — NEXOR</title></head>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:0;min-height:100vh;display:flex;align-items:center;justify-content:center;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;padding:40px 36px;border:1px solid #e2e8f0;text-align:center;">
    <div style="width:64px;height:64px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px;">✓</div>
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">Cita cancelada</h1>
    <p style="color:#6b7280;font-size:15px;line-height:1.5;">Hola <strong>${clientName}</strong>, tu cita ha sido cancelada exitosamente. El horario queda disponible para otro cliente.</p>
  </div>
</body>
</html>`
}

function errorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Enlace inválido — NEXOR</title></head>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:0;min-height:100vh;display:flex;align-items:center;justify-content:center;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;padding:40px 36px;border:1px solid #e2e8f0;text-align:center;">
    <div style="width:64px;height:64px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px;">✕</div>
    <h1 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">Enlace inválido</h1>
    <p style="color:#6b7280;font-size:15px;line-height:1.5;">${message}</p>
  </div>
</body>
</html>`
}

// ─── Ruta pública — sin JWT ni tenantHook ─────────────────────────────────────

export async function cancelAppointmentRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v1/agenda/cancel/:token
   * Cancela una cita a partir del token de un solo uso enviado por email.
   * No requiere autenticación — el token actúa como credencial temporal.
   * El token expira 2 horas antes de la cita para evitar cancelaciones de último momento.
   */
  app.get('/:token', {
    schema: {
      tags:        ['AGENDA'],
      summary:     'Cancelar cita por token de email',
      description: 'Cancela una cita usando el token de un solo uso enviado por email. No requiere autenticación. El token expira 2 horas antes de la cita.',
      security:    [],
      params: {
        type: 'object',
        properties: { token: { type: 'string' } },
        required: ['token'],
      },
    },
  }, async (request, reply) => {
    const { token } = request.params as { token: string }

    const cancelToken = await prisma.appointmentCancelToken.findUnique({
      where:  { token },
      select: {
        id:            true,
        expiresAt:     true,
        usedAt:        true,
        appointmentId: true,
        tenantId:      true,
        appointment: {
          select: {
            id:         true,
            status:     true,
            clientName: true,
            serviceType: { select: { name: true } },
          },
        },
      },
    })

    if (!cancelToken) {
      return reply.code(404).type('text/html').send(
        errorHtml('El enlace de cancelación no es válido o no existe.'),
      )
    }

    if (cancelToken.usedAt) {
      return reply.code(410).type('text/html').send(
        errorHtml('Este enlace ya fue utilizado anteriormente.'),
      )
    }

    if (new Date() > cancelToken.expiresAt) {
      return reply.code(410).type('text/html').send(
        errorHtml('Este enlace ha expirado. El plazo para cancelar por email venció 2 horas antes de la cita.'),
      )
    }

    // Si la cita ya estaba cancelada, mostrar éxito igualmente (idempotente)
    if (cancelToken.appointment.status === 'cancelled') {
      return reply.code(200).type('text/html').send(
        successHtml(cancelToken.appointment.clientName),
      )
    }

    // Cancelar en transacción atómica: marcar token como usado + cambiar estado
    await prisma.$transaction([
      prisma.appointmentCancelToken.update({
        where: { id: cancelToken.id },
        data:  { usedAt: new Date() },
      }),
      prisma.appointment.update({
        where: { id: cancelToken.appointmentId },
        data:  { status: 'cancelled' },
      }),
    ])

    // Notificar in-app a AREA_MANAGER.AGENDA del tenant
    const managers = await prisma.user.findMany({
      where:  { tenantId: cancelToken.tenantId, role: 'AREA_MANAGER', module: 'AGENDA', isActive: true },
      select: { id: true },
    })
    if (managers.length > 0) {
      await prisma.notification.createMany({
        data: managers.map((m) => ({
          tenantId: cancelToken.tenantId,
          userId:   m.id,
          module:   'AGENDA' as const,
          type:     'cita_cancelada_cliente',
          title:    `Cita cancelada — ${cancelToken.appointment.clientName}`,
          message:  `${cancelToken.appointment.clientName} canceló su cita de ${cancelToken.appointment.serviceType?.name ?? 'servicio'} desde el enlace del email de recordatorio.`,
          link:     `/agenda/appointments/${cancelToken.appointmentId}`,
        })),
      })
    }

    return reply.code(200).type('text/html').send(
      successHtml(cancelToken.appointment.clientName),
    )
  })
}
