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

// ─── Alcance del agente interno unificado por ROL (HU-187) ────────────────────
// El chat interno es UN solo agente que usa los módulos como herramientas, limitado a las áreas
// donde el usuario tiene permiso según su rol (README_ROLES). No se inventa un sistema nuevo: se
// reutiliza rol + user.module + feature flags del tenant.

/** Módulos internos (áreas) del sistema. */
export const INTERNAL_MODULES: AgentModule[] = ['KIRA', 'NIRA', 'ARI', 'AGENDA', 'VERA']

/** Etiqueta legible de cada área (para el prompt del agente). Inventario incluye alquileres. */
export const MODULE_LABEL: Record<string, string> = {
  KIRA: 'Inventario y alquileres que prestamos', NIRA: 'Compras y alquileres entrantes (lo que alquilamos de un tercero)', ARI: 'Ventas', AGENDA: 'Agenda', VERA: 'Finanzas (transacciones, presupuestos, centros de costo)',
}

/** Módulos donde un AREA_MANAGER tiene acceso de SOLO LECTURA (README_ROLES). */
const READ_RELATED: Partial<Record<AgentModule, AgentModule[]>> = {
  ARI:    ['KIRA', 'VERA'],
  NIRA:   ['KIRA', 'VERA'],
  KIRA:   ['NIRA'],
  VERA:   ['ARI', 'NIRA'],
  AGENDA: [],
}

/** Alcance del agente interno: módulos con acceso total y módulos de solo lectura. */
export interface InternalScope {
  full: AgentModule[]   // acceso total (todas las tools del módulo)
  read: AgentModule[]   // solo lectura (solo tools de consulta)
}

/**
 * Deriva del ROL del usuario las áreas que el agente interno puede consultar (regla dura HU-187):
 *   - TENANT_ADMIN / SUPER_ADMIN / BRANCH_ADMIN → todas las áreas activas del tenant.
 *   - AREA_MANAGER → su módulo (total) + sus módulos relacionados en SOLO LECTURA.
 *   - OPERATIVE → solo su módulo.
 * Todo intersectado con los módulos ACTIVOS del tenant (feature flags). El agente nunca recibe tools
 * de un módulo fuera de este alcance → no puede consultar áreas para las que el usuario no tiene permiso.
 */
export async function allowedModulesForUser(
  role: Role, userModule: string | null | undefined, tenantId: string,
): Promise<InternalScope> {
  const flags  = await prisma.featureFlag.findMany({ where: { tenantId, enabled: true }, select: { module: true } })
  const active = INTERNAL_MODULES.filter((m) => flags.some((f) => f.module === m))

  if (role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN') {
    return { full: active, read: [] }
  }

  const own = (userModule ?? '') as AgentModule
  if (!own || !active.includes(own)) return { full: [], read: [] }

  if (role === 'AREA_MANAGER') {
    const read = (READ_RELATED[own] ?? []).filter((m) => active.includes(m) && m !== own)
    return { full: [own], read }
  }
  // OPERATIVE
  return { full: [own], read: [] }
}

/** Etiquetas legibles de las áreas accesibles (full + read), para el prompt del agente. */
export function scopeAreaLabels(scope: InternalScope): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of [...scope.full, ...scope.read]) {
    const label = MODULE_LABEL[m] ?? m
    if (!seen.has(label)) { seen.add(label); out.push(label) }
  }
  return out
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
