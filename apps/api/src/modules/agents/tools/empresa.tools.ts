/**
 * Tools transversales de empresa — disponibles en todos los módulos.
 * consultar_usuarios  — solo TENANT_ADMIN y BRANCH_ADMIN.
 * consultar_sucursales — cualquier rol autenticado.
 *
 * Estas tools no modifican datos. Solo lectura.
 */

import { prisma } from '../../../lib/prisma'
import type { AgentTool, ExecutionContext } from '../types'

const ALLOWED_ROLES_USUARIOS = new Set(['TENANT_ADMIN', 'BRANCH_ADMIN', 'SUPER_ADMIN'])

// ─── consultar_usuarios ───────────────────────────────────────────────────────

const consultarUsuarios: AgentTool = {
  definition: {
    name: 'consultar_usuarios',
    description: 'Returns the list of users in the tenant with their role, assigned module and branch. Only available to TENANT_ADMIN and BRANCH_ADMIN. Optionally filter by role, module or branch.',
    input_schema: {
      type: 'object',
      properties: {
        rol:      { type: 'string', description: 'Filter by role: OPERATIVE, AREA_MANAGER, BRANCH_ADMIN, TENANT_ADMIN' },
        modulo:   { type: 'string', description: 'Filter by module: KIRA, NIRA, ARI, AGENDA, VERA' },
        branchId: { type: 'string', description: 'Filter by branch ID' },
        activo:   { type: 'boolean', description: 'Filter by active status (default: true)' },
      },
    },
  },

  async execute({ rol, modulo, branchId, activo }, tenantId, ctx?: ExecutionContext) {
    if (!ctx?.userRole || !ALLOWED_ROLES_USUARIOS.has(ctx.userRole)) {
      return {
        error:  'ACCESO_DENEGADO',
        mensaje: 'Solo TENANT_ADMIN y BRANCH_ADMIN pueden consultar la lista de usuarios.',
      }
    }

    const isActive = activo !== undefined ? Boolean(activo) : true

    const users = await prisma.user.findMany({
      where: {
        tenantId,
        isActive,
        ...(rol      ? { role:     rol    as never } : {}),
        ...(modulo   ? { module:   modulo as never } : {}),
        ...(branchId ? { branchId: branchId as string } : {}),
      },
      select: {
        id:       true,
        name:     true,
        email:    true,
        role:     true,
        module:   true,
        isActive: true,
        branch:   { select: { name: true } },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })

    if (users.length === 0) return { total: 0, usuarios: [], message: 'No se encontraron usuarios con los filtros indicados.' }

    return {
      total: users.length,
      usuarios: users.map((u) => ({
        id:      u.id,
        nombre:  u.name,
        email:   u.email,
        rol:     u.role,
        modulo:  u.module ?? null,
        sucursal: u.branch?.name ?? null,
        activo:  u.isActive,
      })),
    }
  },
}

// ─── consultar_sucursales ─────────────────────────────────────────────────────

const consultarSucursales: AgentTool = {
  definition: {
    name: 'consultar_sucursales',
    description: 'Returns the list of active branches (locations) of the company with their address and contact information.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },

  async execute(_, tenantId) {
    const branches = await prisma.branch.findMany({
      where:   { tenantId, isActive: true },
      select:  { id: true, name: true, address: true, city: true, phone: true },
      orderBy: { name: 'asc' },
    })

    if (branches.length === 0) return { total: 0, sucursales: [], message: 'No hay sucursales activas configuradas.' }

    return {
      total: branches.length,
      sucursales: branches.map((b) => ({
        id:        b.id,
        nombre:    b.name,
        direccion: b.address ?? null,
        ciudad:    b.city    ?? null,
        telefono:  b.phone   ?? null,
      })),
    }
  },
}

// ─── Catálogo empresa ─────────────────────────────────────────────────────────

export const EMPRESA_TOOLS: AgentTool[] = [
  consultarUsuarios,
  consultarSucursales,
]
