/**
 * Librería de email usando Resend.
 * Todas las funciones son fire-and-forget desde los servicios:
 *   sendAppointmentConfirmation(...)
 *   sendAppointmentReminder(...)
 *
 * Si RESEND_API_KEY no está configurada, los emails se omiten sin lanzar error
 * (para que el sistema funcione en entornos sin email configurado).
 */

import { Resend } from 'resend'

let resendClient: Resend | null = null

function getResend(): Resend | null {
  const apiKey = process.env['RESEND_API_KEY']
  if (!apiKey) return null
  if (!resendClient) resendClient = new Resend(apiKey)
  return resendClient
}

const FROM_EMAIL = process.env['EMAIL_FROM'] ?? 'noreply@nexor.app'

// ─── Helpers de formato ───────────────────────────────────────────────────────

function formatDate(date: Date, timezone = 'America/Bogota'): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: timezone,
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  }).format(date)
}

function formatTime(date: Date, timezone = 'America/Bogota'): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: timezone,
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   true,
  }).format(date)
}

// ─── Templates ────────────────────────────────────────────────────────────────

function confirmationHtml(params: {
  clientName:      string
  serviceName:     string
  branchName:      string
  professionalName?: string
  startAt:         Date
  endAt:           Date
  tenantName:      string
  timezone:        string
}): string {
  const { clientName, serviceName, branchName, professionalName, startAt, endAt, tenantName, timezone } = params
  const dateStr = formatDate(startAt, timezone)
  const startStr = formatTime(startAt, timezone)
  const endStr   = formatTime(endAt,   timezone)

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Confirmación de cita</title></head>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:0;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#6366f1;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Cita confirmada</h1>
      <p style="margin:4px 0 0;color:#c7d2fe;font-size:14px;">${tenantName}</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 20px;color:#374151;font-size:15px;">Hola <strong>${clientName}</strong>, tu cita ha sido agendada exitosamente.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#6b7280;font-size:13px;width:140px;">Servicio</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#111827;font-size:14px;font-weight:500;">${serviceName}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#6b7280;font-size:13px;">Fecha</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#111827;font-size:14px;font-weight:500;">${dateStr}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#6b7280;font-size:13px;">Hora</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#111827;font-size:14px;font-weight:500;">${startStr} – ${endStr}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#6b7280;font-size:13px;">Sucursal</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#111827;font-size:14px;font-weight:500;">${branchName}</td></tr>
        ${professionalName ? `<tr><td style="padding:10px 0;color:#6b7280;font-size:13px;">Profesional</td><td style="padding:10px 0;color:#111827;font-size:14px;font-weight:500;">${professionalName}</td></tr>` : ''}
      </table>
      <p style="margin:24px 0 0;color:#6b7280;font-size:13px;">Si necesitas cancelar o reprogramar, comunícate con nosotros con anticipación.</p>
    </div>
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Este es un mensaje automático de ${tenantName}. No respondas a este correo.</p>
    </div>
  </div>
</body>
</html>`
}

function reminderHtml(params: {
  clientName:       string
  serviceName:      string
  branchName:       string
  professionalName?: string
  startAt:          Date
  tenantName:       string
  timezone:         string
  cancelUrl?:       string
}): string {
  const { clientName, serviceName, branchName, professionalName, startAt, tenantName, timezone, cancelUrl } = params
  const timeStr = formatTime(startAt, timezone)

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Recordatorio de cita</title></head>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:0;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#f59e0b;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Recordatorio de cita</h1>
      <p style="margin:4px 0 0;color:#fef3c7;font-size:14px;">${tenantName}</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 20px;color:#374151;font-size:15px;">Hola <strong>${clientName}</strong>, te recordamos que mañana tienes una cita agendada.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#6b7280;font-size:13px;width:140px;">Servicio</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#111827;font-size:14px;font-weight:500;">${serviceName}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#6b7280;font-size:13px;">Hora</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#111827;font-size:14px;font-weight:500;">${timeStr}</td></tr>
        <tr><td style="padding:10px 0;color:#6b7280;font-size:13px;">Sucursal</td><td style="padding:10px 0;color:#111827;font-size:14px;font-weight:500;">${branchName}${professionalName ? ` — ${professionalName}` : ''}</td></tr>
      </table>
      ${cancelUrl ? `<div style="margin-top:28px;text-align:center;">
        <a href="${cancelUrl}" style="display:inline-block;padding:12px 28px;background:#ef4444;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Cancelar mi cita</a>
        <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;">Este enlace expira 2 horas antes de la cita.</p>
      </div>` : `<p style="margin:24px 0 0;color:#6b7280;font-size:13px;">Si necesitas cancelar, por favor avísanos lo antes posible.</p>`}
    </div>
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Mensaje automático de ${tenantName}.</p>
    </div>
  </div>
</body>
</html>`
}

// ─── Funciones públicas ────────────────────────────────────────────────────────

export async function sendAppointmentConfirmation(params: {
  to:              string
  clientName:      string
  serviceName:     string
  branchName:      string
  professionalName?: string
  startAt:         Date
  endAt:           Date
  tenantName:      string
  timezone?:       string
}): Promise<void> {
  const resend = getResend()
  if (!resend) return // Sin API key → skip silencioso

  const tz = params.timezone ?? 'America/Bogota'

  try {
    await resend.emails.send({
      from:    FROM_EMAIL,
      to:      params.to,
      subject: `Cita confirmada — ${params.tenantName}`,
      html:    confirmationHtml({ ...params, timezone: tz }),
    })
  } catch (err) {
    // Email nunca debe tumbar el flujo principal
    console.error('[Email] Error enviando confirmación de cita:', err)
  }
}

export async function sendAppointmentReminder(params: {
  to:               string
  clientName:       string
  serviceName:      string
  branchName:       string
  professionalName?: string
  startAt:          Date
  tenantName:       string
  timezone?:        string
  cancelUrl?:       string
}): Promise<void> {
  const resend = getResend()
  if (!resend) return

  const tz = params.timezone ?? 'America/Bogota'

  try {
    await resend.emails.send({
      from:    FROM_EMAIL,
      to:      params.to,
      subject: `Recuerda tu cita mañana — ${params.tenantName}`,
      html:    reminderHtml({ ...params, timezone: tz }),
    })
  } catch (err) {
    console.error('[Email] Error enviando recordatorio de cita:', err)
  }
}
