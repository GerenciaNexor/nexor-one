import { prisma, directPrisma } from '../../lib/prisma'
import type { Prisma } from '@prisma/client'

/**
 * HU-200 — Control presupuestario del proyecto-LÍMITE.
 *
 * REGLA DURA: el gasto real NUNCA se niega — siempre queda en VERA (verdad contable). Lo que se
 * controla es la ASIGNACIÓN de ese gasto al presupuesto del proyecto:
 *   - dentro del tope        → assignedStatus 'assigned' (cuenta).
 *   - supera el tope         → 'pending' (EN ESPERA): NO cuenta hasta que un admin resuelva.
 *   - aprobado / vencido     → 'over_limit' (exceso, cuenta y marca sobre-límite; no se borra).
 * La aprobación la da CUALQUIER admin (TENANT_ADMIN o BRANCH_ADMIN) del MISMO tenant (RLS).
 */

// Cliente Prisma o `tx` de una transacción abierta (ambos exponen los delegates que usamos).
type Client = Prisma.TransactionClient

const num = (v: unknown): number => (v == null ? 0 : Number(v))
const fmt = (n: number): string =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

/** Umbral de aviso efectivo (monto): explícito, o derivado del % del tope. null si no hay. */
function alertThreshold(p: { alertAmount: Prisma.Decimal | null; alertPct: number | null; targetAmount: Prisma.Decimal }): number | null {
  if (p.alertAmount != null) return num(p.alertAmount)
  if (p.alertPct != null) return num(p.targetAmount) * (p.alertPct / 100)
  return null
}

// Aprobación de sobregasto → solo admins. Aviso positivo del objetivo → también jefes de área.
const ADMIN_ROLES = ['TENANT_ADMIN', 'BRANCH_ADMIN'] as const
const MANAGER_ROLES = ['TENANT_ADMIN', 'BRANCH_ADMIN', 'AREA_MANAGER'] as const

/** Notifica a los usuarios del tenant con alguno de los roles indicados (por defecto, admins). */
export async function notifyProjectAdmins(
  client: Client, tenantId: string,
  n: { type: string; title: string; message: string; link: string },
  roles: readonly string[] = ADMIN_ROLES,
) {
  const users = await client.user.findMany({
    where:  { tenantId, isActive: true, role: { in: roles as unknown as ('OPERATIVE' | 'AREA_MANAGER' | 'BRANCH_ADMIN' | 'TENANT_ADMIN' | 'SUPER_ADMIN')[] } },
    select: { id: true },
  })
  if (users.length === 0) return
  await client.notification.createMany({
    data: users.map((u) => ({ tenantId, userId: u.id, module: 'PROYECTOS', type: n.type, title: n.title, message: n.message, link: n.link })) as Prisma.NotificationCreateManyInput[],
  })
}

/** Consumo CONFIRMADO de un proyecto (assigned + over_limit), excluyendo opcionalmente una transacción. */
async function confirmedConsumption(client: Client, tenantId: string, projectId: string, excludeTxId?: string): Promise<number> {
  const agg = await client.transaction.aggregate({
    where: { tenantId, projectId, assignmentStatus: { in: ['assigned', 'over_limit'] }, ...(excludeTxId ? { id: { not: excludeTxId } } : {}) },
    _sum:  { amount: true },
  })
  return num(agg._sum.amount)
}

/**
 * Evalúa la asignación de UNA transacción (ya creada, con su `projectId` puesto) contra el presupuesto.
 * Establece `assignmentStatus`, y para el sobregasto abre la solicitud de aprobación + notifica.
 * Reemplaza cualquier solicitud previa de esa transacción (re-evaluación al reasignar). Idempotente.
 */
export async function applyAssignment(client: Client, tenantId: string, transactionId: string, requestedBy?: string | null) {
  const tx = await client.transaction.findFirst({ where: { id: transactionId, tenantId }, select: { id: true, amount: true, projectId: true } })
  if (!tx) return

  // Cualquier re-evaluación descarta la solicitud pendiente anterior de esta transacción.
  await client.budgetApproval.deleteMany({ where: { tenantId, transactionId } })

  if (!tx.projectId) {
    await client.transaction.update({ where: { id: transactionId }, data: { assignmentStatus: null } })
    return { status: null as null }
  }

  const project = await client.proyecto.findFirst({
    where:  { id: tx.projectId, tenantId },
    select: { id: true, name: true, type: true, targetAmount: true, alertAmount: true, alertPct: true, graceDays: true, alertNotifiedAt: true },
  })
  // Los proyectos de OBJETIVO (o si no se halló) no controlan el tope: la asignación cuenta directo.
  if (!project || project.type !== 'limite') {
    await client.transaction.update({ where: { id: transactionId }, data: { assignmentStatus: 'assigned' } })
    // HU-201 — objetivo: la meta se puede superar libremente (sin bloqueo). Al ALCANZARLA por primera
    // vez, se avisa positivamente (una sola vez; alertNotifiedAt marca que ya se felicitó).
    if (project && project.type === 'objetivo') {
      const target = num(project.targetAmount)
      const total  = await confirmedConsumption(client, tenantId, project.id) // ya incluye esta transacción
      if (target > 0 && total >= target && !project.alertNotifiedAt) {
        await client.proyecto.update({ where: { id: project.id }, data: { alertNotifiedAt: new Date() } })
        const superado = total > target
        await notifyProjectAdmins(client, tenantId, {
          type:    'OBJETIVO_LOGRADO',
          title:   `🎉 ¡Objetivo logrado: ${project.name}!`,
          message: `¡Felicidades! El proyecto «${project.name}» ${superado ? 'superó' : 'alcanzó'} su meta de ${fmt(target)} (llevas ${fmt(total)}). ${superado ? '¡Y lo superaste!' : '¡Meta cumplida!'}`,
          link:    `/proyectos/${project.id}`,
        }, MANAGER_ROLES)
      }
    }
    return { status: 'assigned' as const }
  }

  const amount = num(tx.amount)
  const tope   = num(project.targetAmount)
  const C      = await confirmedConsumption(client, tenantId, project.id, transactionId)
  const newTotal = C + amount

  if (newTotal <= tope) {
    await client.transaction.update({ where: { id: transactionId }, data: { assignmentStatus: 'assigned' } })
    // Umbral de aviso: notificar una sola vez al cruzarlo (marca alertNotifiedAt).
    const umbral = alertThreshold(project)
    if (umbral != null && newTotal >= umbral && !project.alertNotifiedAt) {
      await client.proyecto.update({ where: { id: project.id }, data: { alertNotifiedAt: new Date() } })
      await notifyProjectAdmins(client, tenantId, {
        type:    'PRESUPUESTO_UMBRAL',
        title:   `Cerca del límite: ${project.name}`,
        message: `El proyecto «${project.name}» llegó al umbral de aviso (${fmt(newTotal)} de ${fmt(tope)}). ¿Aumentar el tope o continuar?`,
        link:    `/proyectos/${project.id}`,
      })
    }
    return { status: 'assigned' as const }
  }

  // Sobregasto: el gasto ya está en VERA; su asignación queda EN ESPERA de aprobación.
  await client.transaction.update({ where: { id: transactionId }, data: { assignmentStatus: 'pending' } })
  const graceDays = project.graceDays ?? 2
  const dueAt = new Date(Date.now() + graceDays * 86_400_000)
  await client.budgetApproval.create({
    data: {
      tenantId, projectId: project.id, transactionId, amount, status: 'pending', requestedBy: requestedBy ?? null, dueAt,
      trace: [{ at: new Date().toISOString(), event: 'requested', note: `Supera el tope (${fmt(tope)}); en espera ${graceDays} día(s).` }] as unknown as Prisma.InputJsonValue,
    },
  })
  await notifyProjectAdmins(client, tenantId, {
    type:    'PRESUPUESTO_SOBREGASTO',
    title:   `Sobregasto pendiente: ${project.name}`,
    message: `Un gasto de ${fmt(amount)} asignado a «${project.name}» supera su tope (${fmt(tope)}). El gasto ya está registrado en VERA; su asignación al proyecto está EN ESPERA de tu aprobación (vence en ${graceDays} día(s)).`,
    link:    `/proyectos/${project.id}`,
  })
  return { status: 'pending' as const }
}

// ─── Resolución por un admin (mismo tenant) ────────────────────────────────────

type TraceEvent = { at: string; event: string; by?: string; note?: string }
const pushTrace = (trace: unknown, ev: TraceEvent): Prisma.InputJsonValue =>
  ([...(Array.isArray(trace) ? trace : []), ev] as unknown as Prisma.InputJsonValue)

/** Lista las solicitudes de sobregasto EN ESPERA del tenant (para los admins). */
export async function listPendingApprovals(tenantId: string) {
  const rows = await prisma.budgetApproval.findMany({
    where:  { tenantId, status: 'pending' },
    select: {
      id: true, amount: true, dueAt: true, createdAt: true, requestedBy: true,
      proyecto:    { select: { id: true, name: true, targetAmount: true } },
      transaction: { select: { id: true, description: true, date: true, type: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return {
    data: rows.map((r) => ({
      id: r.id, amount: num(r.amount), dueAt: r.dueAt, createdAt: r.createdAt,
      project: { id: r.proyecto.id, name: r.proyecto.name, targetAmount: num(r.proyecto.targetAmount) },
      transaction: r.transaction,
    })),
    total: rows.length,
  }
}

/**
 * Resuelve una solicitud EN ESPERA. `action`:
 *   - 'approve'       → entra como sobre-límite (over_limit): cuenta y se marca exceso.
 *   - 'reject'        → la asignación se quita (el gasto queda en VERA, fuera del proyecto).
 *   - 'increase_tope' → sube el tope del proyecto y re-evalúa los pendientes (los que ahora caben entran).
 * Aislado por tenant (RLS + filtro): jamás resuelve solicitudes de otra empresa.
 */
export async function resolveApproval(
  tenantId: string, approvalId: string, adminUserId: string,
  action: 'approve' | 'reject' | 'increase_tope', opts: { newTope?: number; reason?: string } = {},
) {
  return prisma.$transaction(async (tx) => {
    const ap = await tx.budgetApproval.findFirst({
      where:  { id: approvalId, tenantId },
      select: { id: true, status: true, projectId: true, transactionId: true, amount: true, trace: true },
    })
    if (!ap) throw { statusCode: 404, message: 'Solicitud no encontrada', code: 'NOT_FOUND' }
    if (ap.status !== 'pending') throw { statusCode: 409, message: 'La solicitud ya fue resuelta', code: 'ALREADY_RESOLVED' }
    const now = new Date()

    if (action === 'approve') {
      await tx.transaction.update({ where: { id: ap.transactionId }, data: { assignmentStatus: 'over_limit' } })
      await tx.budgetApproval.update({
        where: { id: ap.id },
        data:  { status: 'approved', resolvedBy: adminUserId, resolvedAt: now, reason: opts.reason ?? null,
          trace: pushTrace(ap.trace, { at: now.toISOString(), event: 'approved', by: adminUserId, note: opts.reason }) },
      })
      return { id: ap.id, status: 'approved' as const }
    }

    if (action === 'reject') {
      await tx.transaction.update({ where: { id: ap.transactionId }, data: { projectId: null, assignmentStatus: null } })
      await tx.budgetApproval.update({
        where: { id: ap.id },
        data:  { status: 'rejected', resolvedBy: adminUserId, resolvedAt: now, reason: opts.reason ?? null,
          trace: pushTrace(ap.trace, { at: now.toISOString(), event: 'rejected', by: adminUserId, note: opts.reason }) },
      })
      return { id: ap.id, status: 'rejected' as const }
    }

    // increase_tope: subir el tope y re-evaluar TODOS los pendientes del proyecto (los que quepan entran).
    const project = await tx.proyecto.findFirst({ where: { id: ap.projectId, tenantId }, select: { id: true, targetAmount: true } })
    if (!project) throw { statusCode: 404, message: 'Proyecto no encontrado', code: 'NOT_FOUND' }
    const newTope = opts.newTope ?? 0
    if (!(newTope > num(project.targetAmount))) throw { statusCode: 400, message: 'El nuevo tope debe ser mayor al actual', code: 'INVALID_TOPE' }
    await tx.proyecto.update({ where: { id: project.id }, data: { targetAmount: newTope, alertNotifiedAt: null } })

    // Consumo confirmado actual (assigned + over_limit) del proyecto.
    let running = await confirmedConsumption(tx as unknown as Client, tenantId, project.id)
    const pendings = await tx.budgetApproval.findMany({
      where: { tenantId, projectId: project.id, status: 'pending' }, orderBy: { createdAt: 'asc' },
      select: { id: true, transactionId: true, amount: true, trace: true },
    })
    let resolvedThis = false
    for (const p of pendings) {
      if (running + num(p.amount) <= newTope) {
        running += num(p.amount)
        await tx.transaction.update({ where: { id: p.transactionId }, data: { assignmentStatus: 'assigned' } })
        await tx.budgetApproval.update({
          where: { id: p.id },
          data:  { status: 'approved', resolvedBy: adminUserId, resolvedAt: now, reason: opts.reason ?? null,
            trace: pushTrace(p.trace, { at: now.toISOString(), event: 'tope_increased', by: adminUserId, note: `Tope subido a ${fmt(newTope)}; entra dentro del presupuesto.` }) },
        })
        if (p.id === ap.id) resolvedThis = true
      }
    }
    return { id: ap.id, status: resolvedThis ? ('approved' as const) : ('pending' as const), newTope }
  })
}

// ─── Job: vencimiento del plazo (pending → over_limit con traza) ────────────────

/**
 * Barre las solicitudes EN ESPERA vencidas (dueAt ≤ now) y las hace entrar como SOBRE-LÍMITE, con
 * trazabilidad (se informó, esperó, venció, entró como exceso). Notifica a los admins. Usa el proxy
 * `prisma` con filtro tenantId explícito por fila (corre fuera de una request). Idempotente.
 */
export async function expireOverdueApprovals(now: Date = new Date()): Promise<number> {
  // Corre FUERA de una request (scheduler): directPrisma bypasea RLS y filtramos por tenant en cada
  // fila. Barre TODOS los tenants; cada operación lleva su tenantId/ids explícitos.
  const due = await directPrisma.budgetApproval.findMany({
    where:  { status: 'pending', dueAt: { lte: now } },
    select: { id: true, tenantId: true, projectId: true, transactionId: true, amount: true, trace: true, proyecto: { select: { name: true } } },
  })
  for (const ap of due) {
    await directPrisma.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id: ap.transactionId }, data: { assignmentStatus: 'over_limit' } })
      await tx.budgetApproval.update({
        where: { id: ap.id },
        data:  { status: 'expired', resolvedAt: now,
          trace: pushTrace(ap.trace, { at: now.toISOString(), event: 'expired_over_limit', note: 'Venció el plazo sin resolución; entra como sobre-límite (exceso).' }) },
      })
      await notifyProjectAdmins(tx as unknown as Client, ap.tenantId, {
        type:    'PRESUPUESTO_EXCESO',
        title:   `Exceso registrado: ${ap.proyecto.name}`,
        message: `Venció el plazo de aprobación de un sobregasto de ${fmt(num(ap.amount))} en «${ap.proyecto.name}». La asignación entró como SOBRE-LÍMITE (exceso) con trazabilidad; el gasto ya estaba en VERA.`,
        link:    `/proyectos/${ap.projectId}`,
      })
    })
  }
  return due.length
}
