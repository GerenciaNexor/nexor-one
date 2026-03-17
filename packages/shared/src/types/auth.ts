/**
 * Roles del sistema — definidos aqui una sola vez.
 * Deben estar sincronizados con el enum Role del schema de Prisma.
 *
 * SUPER_ADMIN    — Acceso total a todos los tenants (solo equipo NEXOR)
 * TENANT_ADMIN   — Administrador de una empresa cliente
 * BRANCH_ADMIN   — Administrador de una sucursal
 * AREA_MANAGER   — Responsable de un modulo (ej: jefe de compras)
 * OPERATIVE      — Usuario operativo (vendedor, bodeguero, etc.)
 */
export type Role =
  | 'SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'BRANCH_ADMIN'
  | 'AREA_MANAGER'
  | 'OPERATIVE'

/** Payload que viaja dentro del JWT firmado por el backend. */
export interface AuthUser {
  userId: string
  tenantId: string
  branchId: string
  role: Role
  /** Modulo principal del usuario (para AREA_MANAGER y OPERATIVE). */
  module?: string
}

/** Payload completo del JWT, incluyendo claims estandar. */
export interface JWTPayload extends AuthUser {
  /** Issued at — timestamp Unix en segundos. */
  iat: number
  /** Expiration — timestamp Unix en segundos. */
  exp: number
}
