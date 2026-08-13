import { prisma, directPrisma } from '../../lib/prisma'
import type { Prisma } from '@prisma/client'

// ─── Forma y defaults de la configuración del agente (HU-196) ──────────────────

export interface ChannelConfig { enabled: boolean; respond: boolean; schedule: boolean }
export interface AgentBehavior {
  whatsapp: ChannelConfig
  gmail:    ChannelConfig
  hours:    { mode: '24_7' | 'business'; start?: string; end?: string } // start/end 'HH:mm' (zona del negocio)
}

/** Comportamiento por defecto si un tenant/sucursal no tiene configuración propia. */
export const DEFAULT_BEHAVIOR: AgentBehavior = {
  whatsapp: { enabled: true, respond: true, schedule: true },
  gmail:    { enabled: true, respond: true, schedule: true },
  hours:    { mode: '24_7' },
}

/** Mezcla la config guardada con los defaults (rellena campos faltantes → extensible sin migración). */
function merge(saved: unknown): AgentBehavior {
  const s = (saved ?? {}) as Partial<AgentBehavior>
  const ch = (c?: Partial<ChannelConfig>, d?: ChannelConfig): ChannelConfig => ({
    enabled:  c?.enabled  ?? d!.enabled,
    respond:  c?.respond  ?? d!.respond,
    schedule: c?.schedule ?? d!.schedule,
  })
  return {
    whatsapp: ch(s.whatsapp, DEFAULT_BEHAVIOR.whatsapp),
    gmail:    ch(s.gmail,    DEFAULT_BEHAVIOR.gmail),
    hours:    { mode: s.hours?.mode ?? '24_7', ...(s.hours?.start ? { start: s.hours.start } : {}), ...(s.hours?.end ? { end: s.hours.end } : {}) },
  }
}

/**
 * Resuelve la config efectiva del agente para un mensaje: la de la SUCURSAL si existe, si no la
 * DEFAULT del tenant (branch_id null), si no los defaults del código. Usa directPrisma porque el
 * worker corre fuera de una request (filtro tenantId explícito). — HU-196.
 */
export async function resolveAgentBehavior(tenantId: string, branchId?: string | null): Promise<AgentBehavior> {
  const rows = await directPrisma.agentSetting.findMany({
    where:  branchId ? { tenantId, OR: [{ branchId }, { branchId: null }] } : { tenantId, branchId: null },
    select: { branchId: true, settings: true },
  })
  // Prioridad: la de la sucursal exacta; si no, la default (branchId null).
  const own      = branchId ? rows.find((r) => r.branchId === branchId) : undefined
  const fallback = rows.find((r) => r.branchId === null)
  return merge((own ?? fallback)?.settings)
}

/**
 * HU-196 — Decide qué hace el agente ante un mensaje entrante de un canal: responder al cliente, o
 * solo notificar al negocio (canal apagado / "solo notificar" / fuera de horario). `canSchedule`
 * indica si puede agendar. Lo usa el worker.
 */
export async function evaluateAgentGate(tenantId: string, branchId: string | null, channel: 'whatsapp' | 'gmail') {
  const behavior = await resolveAgentBehavior(tenantId, branchId)
  const cfg = channel === 'gmail' ? behavior.gmail : behavior.whatsapp
  const tenant = await directPrisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } })
  const within = isWithinHours(behavior.hours, tenant?.timezone ?? 'America/Bogota')
  const shouldRespond = cfg.enabled && cfg.respond && within
  return {
    enabled:       cfg.enabled,
    shouldRespond,                 // responde al cliente
    notifyOnly:    !shouldRespond, // solo notifica al negocio (no responde)
    canSchedule:   cfg.schedule,
    withinHours:   within,
  }
}

/** ¿El agente responde AHORA según el horario configurado? (24/7 siempre; 'business' dentro de [start,end]). */
export function isWithinHours(hours: AgentBehavior['hours'], timezone: string): boolean {
  if (hours.mode !== 'business' || !hours.start || !hours.end) return true
  const now = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  return now >= hours.start && now <= hours.end
}

// ─── Panel de administración (solo admins) ─────────────────────────────────────

/** Lista, para el panel: el default del tenant + la config (propia o heredada) de cada sucursal. */
export async function listAgentSettings(tenantId: string) {
  const [branches, rows] = await Promise.all([
    prisma.branch.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.agentSetting.findMany({ where: { tenantId }, select: { branchId: true, settings: true } }),
  ])
  const byBranch = new Map(rows.map((r) => [r.branchId, r.settings]))
  const tenantDefault = merge(byBranch.get(null))
  return {
    default: tenantDefault,
    branches: branches.map((b) => ({
      id:   b.id,
      name: b.name,
      hasOwn:   byBranch.has(b.id),
      settings: byBranch.has(b.id) ? merge(byBranch.get(b.id)) : tenantDefault,
    })),
  }
}

/**
 * Guarda la config para un conjunto de sucursales (o el default del tenant). `branchIds === null`
 * → default del tenant (branch_id null). Lista → una fila por sucursal. Solo admins (guard en la ruta).
 */
export async function saveAgentSettings(tenantId: string, branchIds: string[] | null, settings: AgentBehavior) {
  const data = settings as unknown as Prisma.InputJsonValue

  if (branchIds === null) {
    // Default del tenant (branch_id NULL): findFirst + update/create (un solo default por tenant).
    const existing = await prisma.agentSetting.findFirst({ where: { tenantId, branchId: null }, select: { id: true } })
    if (existing) await prisma.agentSetting.update({ where: { id: existing.id }, data: { settings: data } })
    else          await prisma.agentSetting.create({ data: { tenantId, branchId: null, settings: data } })
    return { applied: 'default' as const, count: 1 }
  }

  // Validar que las sucursales sean del tenant.
  const valid = await prisma.branch.findMany({ where: { tenantId, id: { in: branchIds } }, select: { id: true } })
  const validIds = new Set(valid.map((b) => b.id))
  const targets = branchIds.filter((id) => validIds.has(id))
  if (targets.length === 0) throw { statusCode: 400, message: 'Ninguna sucursal válida seleccionada', code: 'NO_BRANCHES' }

  for (const branchId of targets) {
    await prisma.agentSetting.upsert({
      where:  { tenantId_branchId: { tenantId, branchId } },
      create: { tenantId, branchId, settings: data },
      update: { settings: data },
    })
  }
  return { applied: 'branches' as const, count: targets.length }
}
