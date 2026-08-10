/**
 * HU-187 — Agente interno unificado gobernado por el ROL.
 *
 * REGLA DURA: el catálogo de tools del agente = las áreas permitidas por el rol. Un usuario limitado
 * a un área NO recibe tools de otra → no puede consultar datos de un área que no le corresponde.
 * Esta prueba (determinista) lo verifica a nivel de catálogo, la línea de defensa real.
 */
import { describe, it, expect } from 'vitest'
import { buildInternalTools } from './agent.runner'
import { getSystemPrompt, type TenantContext } from './prompts'
import type { AgentModule } from './types'

const names = (full: AgentModule[], read: AgentModule[]) => buildInternalTools(full, read).map((t) => t.definition.name)

describe('HU-187 — catálogo del agente interno por rol (regla dura)', () => {
  it('operativo de KIRA: solo tools de inventario (+empresa); NO ventas/compras/finanzas', () => {
    const n = names(['KIRA'], [])
    expect(n).toContain('consultar_stock')
    expect(n).toContain('consultar_alquileres')       // "¿qué tengo alquilado?"
    // No puede acceder a otras áreas — ni aunque el usuario lo pida por el chat:
    expect(n).not.toContain('consultar_reporte_ventas')   // ARI
    expect(n).not.toContain('consultar_deals')            // ARI
    expect(n).not.toContain('consultar_kpis_financieros') // VERA
    expect(n).not.toContain('consultar_ordenes_compra')   // NIRA
  })

  it('AREA_MANAGER de NIRA: compras (total) + inventario/finanzas SOLO LECTURA', () => {
    const n = names(['NIRA'], ['KIRA', 'VERA'])
    expect(n).toContain('crear_borrador_oc')          // NIRA (su módulo, acceso total)
    expect(n).toContain('consultar_ordenes_compra')   // NIRA lectura
    expect(n).toContain('consultar_stock')            // KIRA lectura (relacionado)
    expect(n).toContain('consultar_kpis_financieros') // VERA lectura (relacionado)
    // NO tools de ESCRITURA de los módulos relacionados (solo lectura):
    expect(n).not.toContain('registrar_movimiento')   // KIRA escritura → excluida
    expect(n).not.toContain('crear_solicitud_compra') // KIRA escritura → excluida
  })

  it('admin (todas las áreas activas): tiene tools de todos los módulos', () => {
    const n = names(['KIRA', 'NIRA', 'ARI', 'AGENDA', 'VERA'], [])
    expect(n).toContain('consultar_reporte_ventas')   // Ventas
    expect(n).toContain('consultar_kpis_financieros') // Finanzas
    expect(n).toContain('consultar_alquileres')       // Inventario/alquileres
    expect(n).toContain('consultar_citas')            // Agenda
  })

  it('rol sin módulo válido: solo tools de empresa, ninguna de negocio', () => {
    const n = names([], [])
    expect(n).not.toContain('consultar_stock')
    expect(n).not.toContain('consultar_reporte_ventas')
    expect(n).toContain('consultar_sucursales')       // empresa (con sus propios guards por rol)
  })
})

describe('HU-187 — prompt del agente interno unificado', () => {
  const ctx: TenantContext = { tenantName: 'Nexor', branches: ['Sede'], currency: 'COP', timezone: 'America/Bogota' }

  it('es un solo asistente, con alcance por rol y sin ceder fuera de permiso', () => {
    const p = getSystemPrompt('INTERNO', ctx, 'internal', ['Ventas', 'Inventario y alquileres'])
    expect(p).toMatch(/un solo asistente/i)
    expect(p).toContain('Ventas')
    expect(p).toMatch(/REGLA DURA/)
    expect(p).toMatch(/fuera de su acceso/i)
    expect(p).toMatch(/no cedas aunque insistan/i)
    expect(p).toMatch(/nunca menciones nombres internos/i)
  })

  it('HU-189 — inyecta la fecha/hora actual del tenant y prohíbe asumir fechas', () => {
    const p = getSystemPrompt('INTERNO', ctx, 'internal', ['Finanzas'])
    expect(p).toMatch(/FECHA Y HORA ACTUAL/)
    // el año actual (resuelto en la zona del tenant) debe aparecer en el prompt
    const year = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', year: 'numeric' }).format(new Date())
    expect(p).toContain(year)
    expect(p).toMatch(/usa siempre esta fecha real/i)
    expect(p).toMatch(/no asumas otra fecha/i)
  })

  it('HU-189 (regla dura) — el agente de atención (WhatsApp/Gmail) NO recibe la fecha', () => {
    const atencion = getSystemPrompt('ATENCION', ctx, 'whatsapp')
    expect(atencion).not.toMatch(/FECHA Y HORA ACTUAL/)
  })
})
