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
  tenantId: string
  userId:   string
  role:     'user' | 'assistant'
  content:  string
  module?:  AgentModule
}): Promise<void> {
  await prisma.chatMessage.create({
    data: {
      tenantId: params.tenantId,
      userId:   params.userId,
      role:     params.role,
      content:  params.content,
      module:   params.module ?? null,
    },
  })
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
