import type { Prisma } from '@prisma/client'
import type { Role } from '@nexor/shared'
import { prisma } from '../../../lib/prisma'
import { hasMinRole } from '../../../lib/guards'
import type { ReportQuery } from './schema'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDateRange(query: ReportQuery): {
  gte?: Date
  lte?: Date
} {
  const filter: { gte?: Date; lte?: Date } = {}
  if (query.dateFrom) filter.gte = new Date(query.dateFrom)
  if (query.dateTo) {
    const end = new Date(query.dateTo)
    end.setHours(23, 59, 59, 999)
    filter.lte = end
  }
  return filter
}

// =============================================================================
// REPORTE DE VENTAS
// =============================================================================

/**
 * Devuelve:
 *   summary — deals ganados/perdidos, valor total, tasa de conversión, días promedio para cerrar
 *   vendors — rendimiento individual por vendedor
 *
 * Tasa de conversión = ganados / (ganados + perdidos) — solo deals cerrados.
 * OPERATIVE solo ve sus propios datos; AREA_MANAGER+ puede filtrar por usuario.
 */
export async function getSalesReport(
  tenantId:  string,
  userId:    string,
  role:      Role,
  query:     ReportQuery,
) {
  const isManager = hasMinRole(role, 'AREA_MANAGER')

  const effectiveAssignedTo =
    !isManager         ? userId
    : query.assignedTo === 'me' ? userId
    : query.assignedTo

  const dateRange = buildDateRange(query)
  const hasDateFilter = Object.keys(dateRange).length > 0

  const baseWhere: Prisma.DealWhereInput = {
    tenantId,
    ...(effectiveAssignedTo ? { assignedTo: effectiveAssignedTo } : {}),
    ...(query.branchId      ? { branchId:   query.branchId }      : {}),
  }

  // ── Deals ganados (stage isFinalWon) ──────────────────────────────────────
  const wonDeals = await prisma.deal.findMany({
    where: {
      ...baseWhere,
      stage: { isFinalWon: true },
      ...(hasDateFilter ? { closedAt: dateRange } : {}),
    },
    select: {
      value:        true,
      closedAt:     true,
      createdAt:    true,
      assignedTo:   true,
      assignedUser: { select: { id: true, name: true } },
    },
  })

  // ── Deals perdidos (stage isFinalLost) ────────────────────────────────────
  const lostDeals = await prisma.deal.findMany({
    where: {
      ...baseWhere,
      stage: { isFinalLost: true },
      ...(hasDateFilter ? { closedAt: dateRange } : {}),
    },
    select: {
      assignedTo:   true,
      assignedUser: { select: { id: true, name: true } },
    },
  })

  // ── Métricas globales ─────────────────────────────────────────────────────
  const totalGanados  = wonDeals.length
  const totalPerdidos = lostDeals.length
  const totalCerrados = totalGanados + totalPerdidos

  const valorTotal = wonDeals.reduce(
    (sum, d) => sum + (d.value ? parseFloat(String(d.value)) : 0),
    0,
  )

  const tasaConversion =
    totalCerrados > 0
      ? Math.round((totalGanados / totalCerrados) * 1000) / 10
      : 0

  const dealsConCierre = wonDeals.filter((d) => d.closedAt)
  const diasPromedioCierre =
    dealsConCierre.length > 0
      ? Math.round(
          (dealsConCierre.reduce((sum, d) => {
            const ms = d.closedAt!.getTime() - d.createdAt.getTime()
            return sum + ms / (1000 * 60 * 60 * 24)
          }, 0) /
            dealsConCierre.length) *
            10,
        ) / 10
      : 0

  // ── Rendimiento por vendedor ───────────────────────────────────────────────
  const vendorMap = new Map<
    string,
    { userId: string; nombre: string; ganados: number; perdidos: number; valorGanado: number }
  >()

  for (const deal of wonDeals) {
    if (!deal.assignedTo || !deal.assignedUser) continue
    const value = deal.value ? parseFloat(String(deal.value)) : 0
    const v = vendorMap.get(deal.assignedTo)
    if (v) {
      v.ganados++
      v.valorGanado += value
    } else {
      vendorMap.set(deal.assignedTo, {
        userId:      deal.assignedTo,
        nombre:      deal.assignedUser.name,
        ganados:     1,
        perdidos:    0,
        valorGanado: value,
      })
    }
  }

  for (const deal of lostDeals) {
    if (!deal.assignedTo || !deal.assignedUser) continue
    const v = vendorMap.get(deal.assignedTo)
    if (v) {
      v.perdidos++
    } else {
      vendorMap.set(deal.assignedTo, {
        userId:      deal.assignedTo,
        nombre:      deal.assignedUser.name,
        ganados:     0,
        perdidos:    1,
        valorGanado: 0,
      })
    }
  }

  const vendors = Array.from(vendorMap.values()).map((v) => ({
    ...v,
    valorGanado:     Math.round(v.valorGanado),
    tasaConversion:
      v.ganados + v.perdidos > 0
        ? Math.round((v.ganados / (v.ganados + v.perdidos)) * 1000) / 10
        : 0,
  }))

  return {
    summary: {
      totalGanados,
      totalPerdidos,
      valorTotal:         Math.round(valorTotal),
      tasaConversion,
      diasPromedioCierre,
    },
    vendors,
  }
}

// =============================================================================
// REPORTE DE PIPELINE
// =============================================================================

/**
 * Devuelve:
 *   stages       — cantidad de deals activos y valor total por etapa
 *   staleDeals   — deals sin interacción en los últimos 7 días, creados hace > 7 días
 *
 * El filtro de fechas aplica a deal.createdAt para mostrar deals de un período.
 * OPERATIVE solo ve los deals que tiene asignados.
 */
export async function getPipelineReport(
  tenantId:  string,
  userId:    string,
  role:      Role,
  query:     ReportQuery,
) {
  const isManager = hasMinRole(role, 'AREA_MANAGER')

  const effectiveAssignedTo =
    !isManager              ? userId
    : query.assignedTo === 'me' ? userId
    : query.assignedTo

  const dateRange = buildDateRange(query)
  const hasDateFilter = Object.keys(dateRange).length > 0

  const dealBaseWhere: Prisma.DealWhereInput = {
    tenantId,
    ...(effectiveAssignedTo ? { assignedTo: effectiveAssignedTo } : {}),
    ...(query.branchId      ? { branchId:   query.branchId }      : {}),
    ...(hasDateFilter       ? { createdAt:  dateRange }           : {}),
  }

  // ── Etapas con conteo de deals activos ────────────────────────────────────
  const stages = await prisma.pipelineStage.findMany({
    where:   { tenantId },
    orderBy: { order: 'asc' },
    select: {
      id:          true,
      name:        true,
      color:       true,
      isFinalWon:  true,
      isFinalLost: true,
      deals: {
        where:  dealBaseWhere,
        select: { value: true },
      },
    },
  })

  // ── Deals sin actividad en más de 7 días ──────────────────────────────────
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const staleDeals = await prisma.deal.findMany({
    where: {
      ...dealBaseWhere,
      stage:        { isFinalWon: false, isFinalLost: false },
      createdAt:    { lt: sevenDaysAgo },
      // Ninguna interacción en los últimos 7 días
      interactions: { none: { createdAt: { gte: sevenDaysAgo } } },
    },
    select: {
      id:           true,
      title:        true,
      createdAt:    true,
      client:       { select: { name: true } },
      stage:        { select: { name: true, color: true } },
      assignedUser: { select: { name: true } },
      interactions: {
        orderBy: { createdAt: 'desc' },
        take:    1,
        select:  { createdAt: true },
      },
    },
    orderBy: { createdAt: 'asc' },
    take:    50,
  })

  return {
    stages: stages.map((s) => ({
      id:          s.id,
      name:        s.name,
      color:       s.color,
      isFinalWon:  s.isFinalWon,
      isFinalLost: s.isFinalLost,
      deals:       s.deals.length,
      valorTotal:  Math.round(
        s.deals.reduce((sum, d) => sum + (d.value ? parseFloat(String(d.value)) : 0), 0),
      ),
    })),
    staleDeals: staleDeals.map((d) => {
      const lastActivity    = d.interactions[0]?.createdAt ?? d.createdAt
      const diasSinActividad = Math.floor(
        (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24),
      )
      return {
        id:               d.id,
        title:            d.title,
        clientName:       d.client.name,
        stageName:        d.stage.name,
        stageColor:       d.stage.color,
        assignedName:     d.assignedUser?.name ?? null,
        diasSinActividad,
        createdAt:        d.createdAt,
      }
    }),
  }
}
