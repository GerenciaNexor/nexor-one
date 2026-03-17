import type { Role } from './auth'

/** Empresa cliente del SaaS (nivel raiz del multi-tenancy). */
export interface Tenant {
  id: string
  name: string
  /** Identificador unico en la URL. Ejemplo: "farmacia-lopez" */
  slug: string
  email: string
  phone?: string
  createdAt: Date
  updatedAt: Date
}

/** Sucursal dentro de un tenant. Un tenant puede tener multiples sucursales. */
export interface Branch {
  id: string
  tenantId: string
  name: string
  address?: string
  phone?: string
  /** Si es true, es la sucursal principal del tenant. */
  isMain: boolean
  createdAt: Date
  updatedAt: Date
}

/** Usuario del sistema. Pertenece a un tenant y a una sucursal. */
export interface User {
  id: string
  tenantId: string
  branchId: string
  name: string
  email: string
  role: Role
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
