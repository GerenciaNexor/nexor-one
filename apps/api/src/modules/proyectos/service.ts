import { prisma } from '../../lib/prisma'
import type { Prisma } from '@prisma/client'
import { applyAssignment } from './budget'
import type { CreateProjectInput, UpdateProjectInput } from './schema'

// Campos que se exponen (nunca tenant_id en la respuesta).
const SELECT = {
  id: true, name: true, description: true, type: true, targetAmount: true,
  alertAmount: true, alertPct: true, graceDays: true, startDate: true, endDate: true, status: true,
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
      graceDays:    input.type === 'objetivo' ? null : (input.graceDays ?? null),
      startDate:    toDate(input.startDate),
      endDate:      toDate(input.endDate),
      status:       input.status,
      createdBy:    userId,
    },
    select: SELECT,
  })
  return { ...p, progress: computeProgress(p) }
}

/**
 * HU-199 — Suma de las transacciones asignadas por proyecto. `current` = Σ monto de las transacciones
 * ligadas (RLS aísla por tenant). El monto es una magnitud positiva; el usuario asigna ingresos a los
 * objetivos y egresos a los límites.
 */
async function sumByProject(tenantId: string, projectIds: string[]): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map()
  const rows = await prisma.transaction.groupBy({
    by:    ['projectId'],
    // HU-200 — solo cuentan las asignaciones confirmadas: 'assigned' (dentro del tope) y 'over_limit'
    // (exceso aprobado/vencido). Las 'pending' (en espera de aprobación) NO suman al consumo.
    where: { tenantId, projectId: { in: projectIds }, assignmentStatus: { in: ['assigned', 'over_limit'] } },
    _sum:  { amount: true },
  })
  return new Map(rows.map((r) => [r.projectId as string, Number(r._sum.amount ?? 0)]))
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
  const sums = await sumByProject(tenantId, data.map((p) => p.id))
  return { data: data.map((p) => ({ ...p, progress: computeProgress(p, sums.get(p.id) ?? 0) })), total: data.length }
}

/** Detalle: proyecto + avance (suma CONFIRMADA) + transacciones (con estado) + sobregastos en espera. */
export async function getProject(tenantId: string, id: string) {
  const p = await prisma.proyecto.findFirst({ where: { id, tenantId }, select: SELECT })
  if (!p) throw { statusCode: 404, message: 'Proyecto no encontrado', code: 'NOT_FOUND' }
  const [transactions, pending] = await Promise.all([
    prisma.transaction.findMany({
      where:  { tenantId, projectId: id },
      select: { id: true, type: true, amount: true, description: true, date: true, referenceType: true, category: true, assignmentStatus: true, createdAt: true },
      orderBy: { date: 'desc' },
    }),
    prisma.budgetApproval.findMany({
      where:  { tenantId, projectId: id, status: 'pending' },
      select: { id: true, amount: true, dueAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  // HU-200 — el consumo solo cuenta lo CONFIRMADO (assigned + over_limit); lo pending está en espera.
  const current = transactions.filter((t) => t.assignmentStatus !== 'pending').reduce((s, t) => s + Number(t.amount), 0)
  const progress = computeProgress(p, current)
  return {
    ...p,
    progress,
    overLimit: p.type === 'limite' && transactions.some((t) => t.assignmentStatus === 'over_limit'), // indicador sobre-límite
    transactions: transactions.map((t) => ({ ...t, amount: Number(t.amount) })),
    pendingApprovals: pending.map((a) => ({ id: a.id, amount: Number(a.amount), dueAt: a.dueAt, createdAt: a.createdAt })),
  }
}

/**
 * HU-199 — Asigna/quita/cambia el proyecto de una transacción (manual, opcional). Valida que la
 * transacción y el proyecto sean del MISMO tenant (nunca cross-tenant). `projectId = null` la desasigna.
 */
export async function assignTransaction(tenantId: string, transactionId: string, projectId: string | null, requestedBy?: string) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.transaction.findFirst({ where: { id: transactionId, tenantId }, select: { id: true } })
    if (!t) throw { statusCode: 404, message: 'Transacción no encontrada', code: 'NOT_FOUND' }
    if (projectId) {
      const proj = await tx.proyecto.findFirst({ where: { id: projectId, tenantId }, select: { id: true } })
      if (!proj) throw { statusCode: 404, message: 'Proyecto no encontrado', code: 'NOT_FOUND' }
    }
    await tx.transaction.update({ where: { id: transactionId }, data: { projectId } })
    // HU-200 — evalúa el presupuesto: define assigned/pending y abre la solicitud de sobregasto si aplica.
    const r = await applyAssignment(tx, tenantId, transactionId, requestedBy)
    return { id: transactionId, projectId, status: r?.status ?? null }
  })
}

/** Cliente de lectura: el proxy `prisma` o un `tx` de transacción abierta (ambos exponen `.proyecto`). */
type ProjectReader = Pick<Prisma.TransactionClient, 'proyecto'>

/**
 * Valida que un projectId (si viene) pertenezca al tenant → aislamiento cross-tenant (HU-199).
 * Devuelve el id validado o null. `client` permite validar dentro de una transacción existente
 * (quick/alquiler entrante usan su `tx`); por defecto usa el proxy con contexto de la request.
 */
export async function validateProjectId(tenantId: string, projectId?: string | null, client: ProjectReader = prisma): Promise<string | null> {
  if (!projectId) return null
  const proj = await client.proyecto.findFirst({ where: { id: projectId, tenantId }, select: { id: true } })
  if (!proj) throw { statusCode: 400, message: 'El proyecto no existe en tu empresa', code: 'PROJECT_NOT_FOUND' }
  return proj.id
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
      // Cambiar la meta/tope re-arma el aviso (objetivo logrado / umbral) — HU-200/HU-201.
      ...(input.targetAmount !== undefined && { targetAmount: input.targetAmount, alertNotifiedAt: null }),
      ...(alert.alertAmount !== undefined && { alertAmount:  alert.alertAmount }),
      ...(alert.alertPct    !== undefined && { alertPct:     alert.alertPct }),
      ...(input.graceDays   !== undefined && { graceDays:    effectiveType === 'objetivo' ? null : input.graceDays }),
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
