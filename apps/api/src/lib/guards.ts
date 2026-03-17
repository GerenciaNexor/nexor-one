import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Role } from '@nexor/shared'

// ─────────────────────────────────────────────────────────────────────────────
// Jerarquia de roles
// Mayor indice = mayor privilegio. Un rol superior hereda todos los permisos
// de los roles inferiores.
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_HIERARCHY: readonly Role[] = [
  'OPERATIVE',
  'AREA_MANAGER',
  'BRANCH_ADMIN',
  'TENANT_ADMIN',
  'SUPER_ADMIN',
]

/**
 * Devuelve true si userRole >= minRole en la jerarquia.
 * Funcion pura — util para condicionales en servicios.
 */
export function hasMinRole(userRole: Role, minRole: Role): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(minRole)
}

// ─────────────────────────────────────────────────────────────────────────────
// Guards como preHandlers de Fastify
// Se usan en las opciones de la ruta: { preHandler: [requireRole('BRANCH_ADMIN')] }
// El tenantHook (HU-005) ya verifico el JWT antes de que lleguen aqui,
// por lo que request.user esta garantizado.
// ─────────────────────────────────────────────────────────────────────────────

type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>

/**
 * Requiere que el usuario tenga al menos `minRole` en la jerarquia.
 * Devuelve 403 si el rol es insuficiente — NUNCA 404.
 *
 * Ejemplos:
 *   preHandler: [requireRole('TENANT_ADMIN')]   → solo TENANT_ADMIN y SUPER_ADMIN
 *   preHandler: [requireRole('BRANCH_ADMIN')]   → BRANCH_ADMIN, TENANT_ADMIN, SUPER_ADMIN
 *   preHandler: [requireRole('AREA_MANAGER')]   → todos excepto OPERATIVE
 */
export function requireRole(minRole: Role): PreHandler {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!hasMinRole(request.user.role, minRole)) {
      return reply.code(403).send({
        error: 'No tienes permisos para realizar esta accion',
        code: 'FORBIDDEN',
      })
    }
  }
}

/**
 * Para AREA_MANAGER y OPERATIVE verifica que su modulo coincida con `requiredModule`.
 * Roles superiores (BRANCH_ADMIN, TENANT_ADMIN, SUPER_ADMIN) pasan sin restriccion
 * de modulo porque tienen acceso transversal.
 *
 * SIEMPRE usar en combinacion con requireRole — nunca solo:
 *   preHandler: [requireRole('OPERATIVE'), requireModule('KIRA')]
 *   → OPERATIVE.KIRA ✅ | OPERATIVE.ARI ❌ | AREA_MANAGER.KIRA ✅ | BRANCH_ADMIN ✅
 */
export function requireModule(requiredModule: string): PreHandler {
  return async function moduleGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { role, module: userModule } = request.user
    if (role === 'AREA_MANAGER' || role === 'OPERATIVE') {
      if (userModule !== requiredModule) {
        return reply.code(403).send({
          error: 'No tienes permisos para acceder a este modulo',
          code: 'MODULE_FORBIDDEN',
        })
      }
    }
  }
}

/**
 * Combina requireRole + requireModule en un array listo para preHandler.
 *
 * Cubre el patron mas comun: "al menos X nivel, y si es AREA_MANAGER/OPERATIVE
 * debe ser del modulo Y".
 *
 * Ejemplos:
 *   preHandler: requireRoleAndModule('AREA_MANAGER', 'NIRA')
 *   → AREA_MANAGER.NIRA ✅ | AREA_MANAGER.ARI ❌ | BRANCH_ADMIN ✅ | OPERATIVE.NIRA ❌
 *
 *   preHandler: requireRoleAndModule('OPERATIVE', 'KIRA')
 *   → OPERATIVE.KIRA ✅ | OPERATIVE.ARI ❌ | AREA_MANAGER.KIRA ✅ | BRANCH_ADMIN ✅
 */
export function requireRoleAndModule(minRole: Role, requiredModule: string): [PreHandler, PreHandler] {
  return [requireRole(minRole), requireModule(requiredModule)]
}

// ─────────────────────────────────────────────────────────────────────────────
// Atajos para roles frecuentes
// ─────────────────────────────────────────────────────────────────────────────

/** Solo el equipo NEXOR (endpoints /v1/admin). */
export const requireSuperAdmin = (): PreHandler => requireRole('SUPER_ADMIN')

/** Dueno / gerente general — acciones de configuracion del tenant. */
export const requireTenantAdmin = (): PreHandler => requireRole('TENANT_ADMIN')

/** Encargado de sucursal o superior. */
export const requireBranchAdmin = (): PreHandler => requireRole('BRANCH_ADMIN')

/** Jefe de area o superior (cualquier modulo). */
export const requireAreaManager = (): PreHandler => requireRole('AREA_MANAGER')

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades para los servicios
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve el branchId que debe aplicarse como filtro WHERE en las queries.
 *
 * - BRANCH_ADMIN: solo ve su sucursal → devuelve su branchId
 * - AREA_MANAGER / OPERATIVE: estan asignados a una sucursal → devuelve su branchId
 * - TENANT_ADMIN / SUPER_ADMIN: ven todas las sucursales → devuelve undefined
 *
 * Uso en servicios:
 *   const branchId = getBranchFilter(request.user)
 *   const clients = await prisma.client.findMany({
 *     where: { tenantId, ...(branchId ? { branchId } : {}) },
 *   })
 */
export function getBranchFilter(user: {
  role: Role
  branchId: string | null
}): string | undefined {
  if (user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN') {
    return undefined
  }
  return user.branchId ?? undefined
}

/**
 * Devuelve true si el usuario puede ver datos de la sucursal indicada.
 * Util para validar que un BRANCH_ADMIN no accede a datos de otra sucursal.
 *
 * Uso antes de devolver un recurso especifico (GET /branches/:id):
 *   if (!canAccessBranch(request.user, branch.id)) {
 *     return reply.code(403).send({ error: '...', code: 'FORBIDDEN' })
 *   }
 */
export function canAccessBranch(
  user: { role: Role; branchId: string | null },
  targetBranchId: string,
): boolean {
  if (user.role === 'TENANT_ADMIN' || user.role === 'SUPER_ADMIN') {
    return true
  }
  return user.branchId === targetBranchId
}
