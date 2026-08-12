import { prisma } from '../../lib/prisma'
import type { CreateProjectInput, UpdateProjectInput } from './schema'

// Campos que se exponen (nunca tenant_id en la respuesta).
const SELECT = {
  id: true, name: true, description: true, type: true, targetAmount: true,
  alertAmount: true, alertPct: true, startDate: true, endDate: true, status: true,
  createdBy: true, createdAt: true, updatedAt: true,
} as const

type ProjectRow = {
  type: string; targetAmount: unknown; alertAmount: unknown; alertPct: number | null
}

const num = (d: unknown): number => (d == null ? 0 : Number(d))

/**
 * HU-198 — Avance/consumo de un proyecto. `current` = suma de las transacciones asignadas; la
 * conexión con las transacciones llega en HU-199, así que hoy es 0 (aún no hay transacciones ligadas).
 * La forma de la respuesta ya deja todo listo para que HU-199 solo provea `current`.
 *   - objetivo: `reached` cuando se alcanza/supera la meta; `remaining` = lo que falta.
 *   - límite:   `exceeded` cuando se pasa del techo; `remaining` = cupo restante;
 *               `alertReached` cuando se llega al umbral de aviso (monto explícito o derivado del %).
 */
export function computeProgress(p: ProjectRow, current = 0) {
  const target = num(p.targetAmount)
  const pct    = target > 0 ? Math.round((current / target) * 10000) / 100 : 0
  const isLimit = p.type === 'limite'
  const alertAt = p.alertAmount != null ? num(p.alertAmount)
    : (p.alertPct != null ? Math.round(target * (p.alertPct / 100) * 100) / 100 : null)
  return {
    current,
    target,
    pct,
    remaining:    Math.max(target - current, 0),
    reached:      current >= target,          // objetivo: meta alcanzada
    exceeded:     isLimit && current > target, // límite: techo superado
    alertAt,
    alertReached: alertAt != null && current >= alertAt,
  }
}

const toDate = (s: string): Date => new Date(`${s.slice(0, 10)}T00:00:00.000Z`)

/** Normaliza el umbral: solo el tipo límite lo conserva; el objetivo nunca tiene umbral. */
function normalizeAlert(type: string | undefined, alertAmount?: number | null, alertPct?: number | null) {
  if (type === 'objetivo') return { alertAmount: null, alertPct: null }
  return {
    ...(alertAmount !== undefined ? { alertAmount: alertAmount ?? null } : {}),
    ...(alertPct    !== undefined ? { alertPct:    alertPct ?? null } : {}),
  }
}

export async function createProject(tenantId: string, userId: string, input: CreateProjectInput) {
  const alert = normalizeAlert(input.type, input.alertAmount, input.alertPct)
  const p = await prisma.proyecto.create({
    data: {
      tenantId,
      name:         input.name,
      description:  input.description ?? null,
      type:         input.type,
      targetAmount: input.targetAmount,
      alertAmount:  alert.alertAmount ?? null,
      alertPct:     alert.alertPct ?? null,
      startDate:    toDate(input.startDate),
      endDate:      toDate(input.endDate),
      status:       input.status,
      createdBy:    userId,
    },
    select: SELECT,
  })
  return { ...p, progress: computeProgress(p) }
}

/** Lista los proyectos del tenant (RLS aísla). Filtros opcionales por estado y tipo. */
export async function listProjects(tenantId: string, opts: { status?: string; type?: string } = {}) {
  const data = await prisma.proyecto.findMany({
    where: {
      tenantId,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.type ? { type: opts.type } : {}),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select:  SELECT,
  })
  return { data: data.map((p) => ({ ...p, progress: computeProgress(p) })), total: data.length }
}

/** Detalle: proyecto + avance + transacciones asignadas (vacío hasta HU-199). */
export async function getProject(tenantId: string, id: string) {
  const p = await prisma.proyecto.findFirst({ where: { id, tenantId }, select: SELECT })
  if (!p) throw { statusCode: 404, message: 'Proyecto no encontrado', code: 'NOT_FOUND' }
  // HU-199 conectará las transacciones asignadas; por ahora no hay ninguna ligada.
  return { ...p, progress: computeProgress(p), transactions: [] as unknown[] }
}

export async function updateProject(tenantId: string, id: string, input: UpdateProjectInput) {
  const existing = await prisma.proyecto.findFirst({ where: { id, tenantId }, select: { id: true, type: true } })
  if (!existing) throw { statusCode: 404, message: 'Proyecto no encontrado', code: 'NOT_FOUND' }

  const effectiveType = input.type ?? existing.type
  const alert = normalizeAlert(effectiveType, input.alertAmount, input.alertPct)

  const p = await prisma.proyecto.update({
    where: { id },
    data: {
      ...(input.name        !== undefined && { name:         input.name }),
      ...(input.description !== undefined && { description:  input.description }),
      ...(input.type        !== undefined && { type:         input.type }),
      ...(input.targetAmount !== undefined && { targetAmount: input.targetAmount }),
      ...(alert.alertAmount !== undefined && { alertAmount:  alert.alertAmount }),
      ...(alert.alertPct    !== undefined && { alertPct:     alert.alertPct }),
      ...(input.startDate   !== undefined && { startDate:    toDate(input.startDate) }),
      ...(input.endDate     !== undefined && { endDate:      toDate(input.endDate) }),
      ...(input.status      !== undefined && { status:       input.status }),
    },
    select: SELECT,
  })
  return { ...p, progress: computeProgress(p) }
}

export async function deleteProject(tenantId: string, id: string) {
  const existing = await prisma.proyecto.findFirst({ where: { id, tenantId }, select: { id: true } })
  if (!existing) throw { statusCode: 404, message: 'Proyecto no encontrado', code: 'NOT_FOUND' }
  await prisma.proyecto.delete({ where: { id } })
  return { id }
}
