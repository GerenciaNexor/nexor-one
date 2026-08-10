/**
 * CreateUserSchema — el módulo NO aplica a los admins (acceden a todas las áreas) y sí es obligatorio
 * para Jefe de Área y Operativo. El frontend envía module=null para los admins; el schema debe aceptarlo.
 */
import { describe, it, expect } from 'vitest'
import { CreateUserSchema } from './schema'

const base = { email: 'p@x.com', name: 'Pepe', password: '12345678' }

describe('CreateUserSchema — módulo por rol', () => {
  it('TENANT_ADMIN con module=null → válido (accede a todas las áreas)', () => {
    expect(CreateUserSchema.safeParse({ ...base, role: 'TENANT_ADMIN', module: null, branchId: null }).success).toBe(true)
  })

  it('BRANCH_ADMIN con module=null → válido', () => {
    expect(CreateUserSchema.safeParse({ ...base, role: 'BRANCH_ADMIN', module: null, branchId: 'b1' }).success).toBe(true)
  })

  it('AREA_MANAGER con module=ARI → válido', () => {
    expect(CreateUserSchema.safeParse({ ...base, role: 'AREA_MANAGER', module: 'ARI', branchId: 'b1' }).success).toBe(true)
  })

  it('AREA_MANAGER sin módulo (null) → inválido', () => {
    const r = CreateUserSchema.safeParse({ ...base, role: 'AREA_MANAGER', module: null, branchId: 'b1' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]!.path).toContain('module')
  })

  it('OPERATIVE sin módulo → inválido', () => {
    expect(CreateUserSchema.safeParse({ ...base, role: 'OPERATIVE', branchId: 'b1' }).success).toBe(false)
  })
})
