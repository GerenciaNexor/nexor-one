/**
 * Servicio de chat interno del dashboard — HU-057A
 *
 * Responsabilidades:
 *   1. Resolver el módulo del agente según rol/módulo del usuario autenticado
 *   2. Guardar mensajes en chat_messages (append-only)
 *   3. Consultar historial paginado por usuario
 *
 * Reglas de acceso al módulo:
 *   - OPERATIVE:       siempre su módulo asignado; si el mensaje apunta a otro → no access
 *   - AREA_MANAGER:    keyword routing entre módulos activos del tenant
 *   - BRANCH_ADMIN+:   keyword routing entre módulos activos del tenant (sin restricción)
 *   - TENANT_ADMIN+:   keyword routing entre todos los módulos conocidos
 */

import type { Role } from '@nexor/shared'
import { prisma } from '../../lib/prisma'
import type { AgentModule } from '../agents/types'

// ─── Constantes ───────────────────────────────────────────────────────────────

const PRIORITY: AgentModule[] = ['KIRA', 'NIRA', 'ARI', 'AGENDA', 'VERA']

const KEYWORDS: Partial<Record<AgentModule, string[]>> = {
  KIRA:   ['stock', 'inventario', 'producto', 'entrada', 'salida', 'unidades',
            'bodega', 'almacén', 'cantidad', 'existencia', 'mercancía', 'lote', 'rotación'],
  NIRA:   ['compra', 'proveedor', 'orden', 'cotización', 'precio', 'pedido',
            'factura', 'surtir', ' oc ', 'suministro', 'abastec'],
  ARI:    ['cliente', 'venta', 'cotizar', 'lead', 'oportunidad', 'oferta',
            'presupuesto', 'negocio', 'contrato', 'deal', 'pipeline'],
  AGENDA: ['cita', 'turno', 'agendar', 'horario', 'disponibilidad', 'reservar',
            'appointment', 'agenda'],
  VERA:   ['transacción', 'transacciones', 'financiero', 'finanzas', 'ingreso',
            'egreso', 'gasto', 'utilidad', 'margen', 'flujo', 'caja', 'presupuesto vera',
            'balance', 'rentabilidad', 'kpi financiero'],
}

/** Elige el módulo con mayor score de keywords; en empate respeta PRIORITY. */
function scoreKeywords(message: string, candidates: AgentModule[]): AgentModule | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]!

  const lower = message.toLowerCase()
  const scores = new Map<AgentModule, number>()

  for (const mod of candidates) {
    const hits = (KEYWORDS[mod] ?? []).filter((kw) => lower.includes(kw)).length
    scores.set(mod, hits)
  }

  // Si ningún candidato tiene keywords relevantes → null (usar default externo)
  const maxScore = Math.max(...scores.values())
  if (maxScore === 0) return null

  return candidates.reduce((a, b) => (scores.get(b) ?? 0) > (scores.get(a) ?? 0) ? b : a)
}

// ─── Resolución de módulo ─────────────────────────────────────────────────────

export interface ModuleResolution {
  module:    AgentModule
  hasAccess: boolean
}

/**
 * Determina el módulo al que se enruta el mensaje del chat interno.
 *
 * @param role       - Rol del usuario autenticado
 * @param userModule - Módulo asignado al usuario (null para BRANCH_ADMIN+)
 * @param tenantId   - Para obtener los módulos activos del tenant
 * @param message    - Contenido del mensaje (para keyword scoring)
 */
export async function resolveModuleForChat(
  role:       Role,
  userModule: string | null | undefined,
  tenantId:   string,
  message:    string,
): Promise<ModuleResolution> {
  // Módulos activos del tenant
  const flags = await prisma.featureFlag.findMany({
    where:  { tenantId, enabled: true },
    select: { module: true },
  })
  const activeModules = PRIORITY.filter((m) => flags.some((f) => f.module === m))
  const fallback: AgentModule = activeModules[0] ?? 'KIRA'

  // ── OPERATIVE — solo su módulo asignado ───────────────────────────────────
  if (role === 'OPERATIVE') {
    const ownModule = (userModule ?? '') as AgentModule
    if (!ownModule || !PRIORITY.includes(ownModule)) {
      // Sin módulo asignado — devuelve el fallback del tenant sin acceso
      return { module: fallback, hasAccess: false }
    }

    // Detectar si el mensaje intenta acceder a otro módulo
    const detected = scoreKeywords(message, PRIORITY.filter((m) => m !== ownModule))
    if (detected) {
      // Intento de acceso a módulo ajeno → no access
      return { module: detected, hasAccess: false }
    }

    return { module: ownModule, hasAccess: true }
  }

  // ── AREA_MANAGER — puede usar cualquier módulo activo del tenant ───────────
  if (role === 'AREA_MANAGER') {
    const detected = scoreKeywords(message, activeModules)
    // Si no hay keywords de otro módulo, usa su propio módulo asignado (o fallback)
    const resolved = detected ?? (userModule as AgentModule | undefined) ?? fallback
    return { module: resolved, hasAccess: true }
  }

  // ── BRANCH_ADMIN / TENANT_ADMIN / SUPER_ADMIN — sin restricciones ─────────
  const detected = scoreKeywords(message, activeModules)
  return { module: detected ?? fallback, hasAccess: true }
}

// ─── Operaciones de chat_messages ─────────────────────────────────────────────

export async function saveChatMessage(params: {
  tenantId:      string
  userId:        string
  chatSessionId: string
  role:          'user' | 'assistant'
  content:       string
  module?:       AgentModule
}): Promise<void> {
  await prisma.chatMessage.create({
    data: {
      tenantId:      params.tenantId,
      userId:        params.userId,
      chatSessionId: params.chatSessionId,
      role:          params.role,
      content:       params.content,
      module:        params.module ?? null,
    },
  })
}

// ─── Sesiones de chat (HU-183) ────────────────────────────────────────────────
// Cada usuario puede tener varios chats separados; cada uno con su propio historial y contexto.
// Todo por (tenantId, userId) — RLS por tenant + filtro por usuario en la capa de aplicación.

const MAX_TITLE   = 80
/** Cuántos mensajes previos de la sesión recuerda el agente (memoria por chat). HU-186: 25. */
const MEMORY_SIZE = 25

/** Lista los chats del usuario, más recientes primero. */
export async function listChatSessions(tenantId: string, userId: string) {
  return prisma.chatSession.findMany({
    where:   { tenantId, userId },
    orderBy: { updatedAt: 'desc' },
    select:  { id: true, title: true, createdAt: true, updatedAt: true },
  })
}

/** Crea un chat nuevo (título opcional; si no, 'Nuevo chat' hasta el primer mensaje). */
export async function createChatSession(tenantId: string, userId: string, title?: string) {
  const clean = (title ?? '').trim().slice(0, MAX_TITLE)
  return prisma.chatSession.create({
    data:   { tenantId, userId, title: clean || 'Nuevo chat' },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  })
}

/** Verifica que la sesión exista y pertenezca al usuario+tenant (aislamiento). */
export async function getOwnedSession(sessionId: string, tenantId: string, userId: string) {
  return prisma.chatSession.findFirst({
    where:  { id: sessionId, tenantId, userId },
    select: { id: true, title: true },
  })
}

/** Renombra un chat (solo su dueño). Devuelve null si no existe o no es del usuario. */
export async function renameChatSession(sessionId: string, tenantId: string, userId: string, title: string) {
  const clean = title.trim().slice(0, MAX_TITLE)
  if (!clean) return null
  const owned = await getOwnedSession(sessionId, tenantId, userId)
  if (!owned) return null
  return prisma.chatSession.update({
    where:  { id: sessionId },
    data:   { title: clean },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  })
}

/** Elimina un chat y sus mensajes (cascade). Devuelve false si no es del usuario. */
export async function deleteChatSession(sessionId: string, tenantId: string, userId: string): Promise<boolean> {
  const owned = await getOwnedSession(sessionId, tenantId, userId)
  if (!owned) return false
  await prisma.chatSession.delete({ where: { id: sessionId } })
  return true
}

/** Historial paginado de UNA sesión (valida pertenencia). Devuelve null si no es del usuario. */
export async function getSessionMessages(
  sessionId: string, tenantId: string, userId: string,
  page = 1, limit = 50, sort: 'asc' | 'desc' = 'asc',
) {
  const owned = await getOwnedSession(sessionId, tenantId, userId)
  if (!owned) return null

  const safeLimit = Math.min(100, Math.max(1, limit))
  const safePage  = Math.max(1, page)
  const skip      = (safePage - 1) * safeLimit

  const [messages, total] = await Promise.all([
    prisma.chatMessage.findMany({
      where:   { chatSessionId: sessionId, tenantId },
      orderBy: { createdAt: sort },
      skip, take: safeLimit,
      select:  { id: true, role: true, content: true, module: true, createdAt: true },
    }),
    prisma.chatMessage.count({ where: { chatSessionId: sessionId, tenantId } }),
  ])

  return { data: messages, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } }
}

/** Últimos N mensajes de la sesión, en orden cronológico — memoria conversacional del agente. */
export async function getSessionMemory(sessionId: string, tenantId: string): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const rows = await prisma.chatMessage.findMany({
    where:   { chatSessionId: sessionId, tenantId },
    orderBy: { createdAt: 'desc' },
    take:    MEMORY_SIZE,
    select:  { role: true, content: true },
  })
  return rows.reverse().map((r) => ({ role: r.role === 'assistant' ? 'assistant' : 'user', content: r.content }))
}

/** Si el chat aún tiene el título por defecto, lo fija con el primer mensaje del usuario. */
export async function autoTitleFromFirstMessage(sessionId: string, message: string): Promise<void> {
  const title = message.trim().slice(0, MAX_TITLE)
  if (!title) return
  await prisma.chatSession.updateMany({
    where: { id: sessionId, title: 'Nuevo chat' },
    data:  { title },
  }).catch(() => {})
}

/** Marca el chat como recién usado (lo sube en la lista). */
export async function touchChatSession(sessionId: string): Promise<void> {
  await prisma.chatSession.update({ where: { id: sessionId }, data: {} }).catch(() => {})
}

/**
 * Historial paginado del propio usuario.
 */
export async function getChatHistory(
  userId:   string,
  tenantId: string,
  page  = 1,
  limit = 20,
  sort: 'asc' | 'desc' = 'asc',
) {
  const safeLimit = Math.min(100, Math.max(1, limit))
  const safePage  = Math.max(1, page)
  const skip      = (safePage - 1) * safeLimit

  const [messages, total] = await Promise.all([
    prisma.chatMessage.findMany({
      where:   { userId, tenantId },
      orderBy: { createdAt: sort },
      skip,
      take: safeLimit,
      select: { id: true, role: true, content: true, module: true, createdAt: true },
    }),
    prisma.chatMessage.count({ where: { userId, tenantId } }),
  ])

  return {
    data:       messages,
    pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) },
  }
}

/**
 * Historial paginado de cualquier usuario del tenant — solo TENANT_ADMIN.
 * Valida que el usuario pertenezca al mismo tenant antes de devolver.
 */
export async function getChatHistoryForUser(
  targetUserId: string,
  tenantId:     string,
  page  = 1,
  limit = 20,
  sort: 'asc' | 'desc' = 'asc',
): Promise<ReturnType<typeof getChatHistory> | null> {
  // Verificar que el usuario objetivo pertenece al tenant
  const targetUser = await prisma.user.findUnique({
    where:  { id: targetUserId },
    select: { tenantId: true },
  })

  if (!targetUser || targetUser.tenantId !== tenantId) return null

  return getChatHistory(targetUserId, tenantId, page, limit, sort)
}
