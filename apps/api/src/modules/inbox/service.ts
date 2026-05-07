import { google } from 'googleapis'
import type { Prisma } from '@prisma/client'
import type { Role } from '@nexor/shared'
import { prisma } from '../../lib/prisma'
import { decrypt } from '../../lib/encryption'
import { hasMinRole } from '../../lib/guards'
import type { InboxQuery, ReplyInput, UpdateStatusInput, AssignInput } from './schema'

// ─── Selects ──────────────────────────────────────────────────────────────────

const CONVERSATION_SELECT = {
  id:               true,
  channel:          true,
  senderIdentifier: true,
  senderName:       true,
  relatedModule:    true,
  status:           true,
  assignedTo:       true,
  lastMessageAt:    true,
  createdAt:        true,
  updatedAt:        true,
  assignedUser: { select: { id: true, name: true } },
  _count: { select: { messages: true } },
} as const

const MESSAGE_SELECT = {
  id:                true,
  direction:         true,
  content:           true,
  messageType:       true,
  isFromAgent:       true,
  userId:            true,
  externalMessageId: true,
  timestamp:         true,
  createdAt:         true,
  user: { select: { id: true, name: true } },
} as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatConversation(c: any) {
  const { _count, ...rest } = c
  return { ...rest, messageCount: _count?.messages ?? 0 }
}

/**
 * Construye el filtro de módulo según el rol del usuario.
 *
 * - TENANT_ADMIN / BRANCH_ADMIN / SUPER_ADMIN → sin filtro de módulo (ven todo)
 * - AREA_MANAGER / OPERATIVE → solo ven conversaciones de su módulo asignado
 */
function moduleFilter(
  role: Role,
  userModule: string | undefined,
): Prisma.ConversationWhereInput {
  if (hasMinRole(role, 'BRANCH_ADMIN')) return {}
  if (!userModule) return {}
  return { relatedModule: userModule as Prisma.EnumModuleNameFilter }
}

// =============================================================================
// USUARIOS PARA REASIGNACIÓN
// =============================================================================

export async function listInboxUsers(tenantId: string) {
  const rows = await prisma.user.findMany({
    where:   { tenantId, isActive: true },
    select:  { id: true, name: true, role: true, module: true },
    orderBy: { name: 'asc' },
  })
  return { data: rows }
}

// =============================================================================
// BANDEJA DE ENTRADA
// =============================================================================

export async function listConversations(
  tenantId:   string,
  role:       Role,
  userModule: string | undefined,
  query:      InboxQuery,
) {
  const where: Prisma.ConversationWhereInput = {
    tenantId,
    ...moduleFilter(role, userModule),
    ...(query.status  ? { status:  query.status  } : {}),
    ...(query.channel ? { channel: query.channel } : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      select:  CONVERSATION_SELECT,
      orderBy: { lastMessageAt: 'desc' },
      skip:    (query.page - 1) * query.limit,
      take:    query.limit,
    }),
    prisma.conversation.count({ where }),
  ])

  return {
    data:       rows.map(formatConversation),
    total,
    page:       query.page,
    limit:      query.limit,
    totalPages: Math.ceil(total / query.limit),
  }
}

export async function getConversation(
  tenantId:   string,
  role:       Role,
  userModule: string | undefined,
  id:         string,
) {
  const conversation = await prisma.conversation.findFirst({
    where: { id, tenantId, ...moduleFilter(role, userModule) },
    select: {
      ...CONVERSATION_SELECT,
      messages: {
        select:  MESSAGE_SELECT,
        orderBy: { timestamp: 'asc' },
      },
    },
  })
  if (!conversation) {
    throw { statusCode: 404, message: 'Conversación no encontrada', code: 'NOT_FOUND' }
  }
  const { _count, ...rest } = conversation as typeof conversation & { _count?: { messages: number } }
  return { ...rest, messageCount: _count?.messages ?? rest.messages.length }
}

export async function getUnreadCount(
  tenantId:   string,
  role:       Role,
  userModule: string | undefined,
) {
  const count = await prisma.conversation.count({
    where: {
      tenantId,
      status: 'open',
      ...moduleFilter(role, userModule),
    },
  })
  return { count }
}

// =============================================================================
// RESPUESTA MANUAL
// =============================================================================

export async function replyToConversation(
  tenantId: string,
  userId:   string,
  id:       string,
  input:    ReplyInput,
) {
  const conversation = await prisma.conversation.findFirst({
    where:  { id, tenantId },
    select: { id: true, channel: true, senderIdentifier: true, status: true },
  })
  if (!conversation) {
    throw { statusCode: 404, message: 'Conversación no encontrada', code: 'NOT_FOUND' }
  }
  if (conversation.status === 'resolved') {
    throw {
      statusCode: 422,
      message:    'No se puede responder una conversación resuelta',
      code:       'CONVERSATION_RESOLVED',
    }
  }

  // ── Obtener integración activa del tenant para el canal ───────────────────
  const integration = await prisma.integration.findFirst({
    where:  { tenantId, channel: conversation.channel, isActive: true },
    select: { id: true, tokenEncrypted: true, identifier: true },
  })
  if (!integration?.tokenEncrypted) {
    const channelLabel = conversation.channel === 'WHATSAPP' ? 'WhatsApp' : 'Gmail'
    throw {
      statusCode: 422,
      message:    `No hay integración de ${channelLabel} activa para este tenant`,
      code:       'INTEGRATION_NOT_ACTIVE',
    }
  }

  // ── Enviar por el canal correspondiente ───────────────────────────────────
  if (conversation.channel === 'WHATSAPP') {
    await sendWhatsAppMessage(
      integration.identifier,
      conversation.senderIdentifier,
      input.text,
      decrypt(integration.tokenEncrypted),
    )
  } else {
    await sendGmailMessage(
      integration.identifier,
      conversation.senderIdentifier,
      input.text,
      decrypt(integration.tokenEncrypted),
    )
  }

  const now = new Date()

  // ── Guardar mensaje en conversation_messages ──────────────────────────────
  const message = await prisma.conversationMessage.create({
    data: {
      conversationId: id,
      tenantId,
      direction:      'outbound',
      content:        input.text,
      messageType:    'text',
      isFromAgent:    false,
      userId,
      timestamp:      now,
    },
    select: MESSAGE_SELECT,
  })

  // ── Marcar conversación como replied y actualizar lastMessageAt ───────────
  await prisma.conversation.update({
    where: { id },
    data:  { status: 'replied', lastMessageAt: now },
  })

  return message
}

// ─── WhatsApp: envío via Meta Graph API ──────────────────────────────────────

async function sendWhatsAppMessage(
  phoneNumberId: string,
  to:            string,
  text:          string,
  accessToken:   string,
): Promise<void> {
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw {
      statusCode: 502,
      message:    `Error al enviar mensaje de WhatsApp (${res.status}): ${detail}`,
      code:       'WHATSAPP_SEND_ERROR',
    }
  }
}

// ─── Gmail: envío via Gmail API con refresh_token del tenant ─────────────────

async function sendGmailMessage(
  fromEmail:    string,
  toEmail:      string,
  text:         string,
  refreshToken: string,
): Promise<void> {
  const oauthClient = new google.auth.OAuth2(
    process.env['GOOGLE_CLIENT_ID'],
    process.env['GOOGLE_CLIENT_SECRET'],
  )
  oauthClient.setCredentials({ refresh_token: refreshToken })
  const gmail = google.gmail({ version: 'v1', auth: oauthClient })

  // Construir el email en formato RFC 2822 codificado en base64url
  const rawMessage = [
    `From: ${fromEmail}`,
    `To: ${toEmail}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    text,
  ].join('\r\n')

  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  try {
    await gmail.users.messages.send({
      userId:      'me',
      requestBody: { raw: encodedMessage },
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw {
      statusCode: 502,
      message:    `Error al enviar email por Gmail: ${detail}`,
      code:       'GMAIL_SEND_ERROR',
    }
  }
}

// =============================================================================
// ESTADO Y REASIGNACIÓN
// =============================================================================

export async function updateConversationStatus(
  tenantId: string,
  id:       string,
  input:    UpdateStatusInput,
) {
  const existing = await prisma.conversation.findFirst({
    where:  { id, tenantId },
    select: { id: true },
  })
  if (!existing) {
    throw { statusCode: 404, message: 'Conversación no encontrada', code: 'NOT_FOUND' }
  }

  return prisma.conversation.update({
    where:  { id },
    data:   { status: input.status },
    select: CONVERSATION_SELECT,
  })
}

export async function assignConversation(
  tenantId:      string,
  id:            string,
  assignedById:  string,
  input:         AssignInput,
) {
  // Verificar que la conversación existe y pertenece al tenant
  const existing = await prisma.conversation.findFirst({
    where:  { id, tenantId },
    select: { id: true, channel: true, senderIdentifier: true },
  })
  if (!existing) {
    throw { statusCode: 404, message: 'Conversación no encontrada', code: 'NOT_FOUND' }
  }

  // Resolver nombre del asignante y verificar usuario destino en paralelo
  const [assignedBy, targetUser] = await Promise.all([
    prisma.user.findFirst({ where: { id: assignedById, tenantId }, select: { name: true } }),
    prisma.user.findFirst({ where: { id: input.userId, tenantId, isActive: true }, select: { id: true, name: true } }),
  ])
  if (!targetUser) {
    throw { statusCode: 404, message: 'Usuario no encontrado en este tenant', code: 'NOT_FOUND' }
  }

  const assignedByName = assignedBy?.name ?? 'Un compañero'

  const [updated] = await Promise.all([
    prisma.conversation.update({
      where:  { id },
      data:   { assignedTo: input.userId, status: 'reassigned' },
      select: CONVERSATION_SELECT,
    }),
    // Notificación in-app al usuario asignado
    prisma.notification.create({
      data: {
        tenantId,
        userId:  input.userId,
        type:    'conversacion_asignada',
        title:   'Conversación asignada',
        message: `${assignedByName} te asignó una conversación de ${existing.channel === 'WHATSAPP' ? 'WhatsApp' : 'Gmail'} con ${existing.senderIdentifier}.`,
        link:    `/inbox/${id}`,
      },
    }),
  ])

  return formatConversation(updated)
}
