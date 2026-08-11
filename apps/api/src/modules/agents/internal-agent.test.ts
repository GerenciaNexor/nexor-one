/**
 * HU-187 — Agente interno unificado gobernado por el ROL.
 *
 * REGLA DURA: el catálogo de tools del agente = las áreas permitidas por el rol. Un usuario limitado
 * a un área NO recibe tools de otra → no puede consultar datos de un área que no le corresponde.
 * Esta prueba (determinista) lo verifica a nivel de catálogo, la línea de defensa real.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { buildInternalTools, agentModel as pickAgentModel } from './agent.runner'
import { getSystemPrompt, getVolatileContext, type TenantContext } from './prompts'
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

  it('HU-189 — las instrucciones de fecha siguen en el prompt (estable, cacheable)', () => {
    const p = getSystemPrompt('INTERNO', ctx, 'internal', ['Finanzas'])
    expect(p).toMatch(/usa siempre esa fecha real/i)
    expect(p).toMatch(/no asumas otra fecha/i)
    // HU-192: la fecha/hora AL MINUTO ya NO va en el bloque estable (rompería el cache): solo la
    // referencia; el valor real se inyecta aparte vía getVolatileContext.
    expect(p).not.toMatch(/FECHA Y HORA ACTUAL \(America/)
  })

  it('HU-192 — getVolatileContext trae la fecha real SOLO para INTERNO (fuera del cache)', () => {
    const vol = getVolatileContext('INTERNO', ctx)
    expect(vol).toMatch(/FECHA Y HORA ACTUAL/)
    const year = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', year: 'numeric' }).format(new Date())
    expect(vol).toContain(year)
    // Regla dura HU-189/HU-180: el agente de atención NO recibe fecha.
    expect(getVolatileContext('ATENCION', ctx)).toBe('')
    expect(getVolatileContext('KIRA', ctx)).toBe('')
  })
})

describe('HU-192 — selección de modelo híbrida (env)', () => {
  const OLD = { ...process.env }
  afterEach(() => { process.env = { ...OLD } })

  it('default: consulta simple → base (Haiku); no usa Opus jamás', () => {
    delete process.env['CLAUDE_MODEL_AGENT']; delete process.env['CLAUDE_MODEL_AGENT_COMPLEX']; delete process.env['AGENT_ESCALATE']
    const m = pickAgentModel('¿qué recordatorios tengo?')
    expect(m).toContain('haiku')
    expect(m).not.toContain('opus')
  })

  it('auto: consulta compleja (analiza/compara) → escala a Sonnet', () => {
    delete process.env['AGENT_ESCALATE']
    expect(pickAgentModel('analiza la rentabilidad y compara sucursales')).toContain('sonnet')
  })

  it('AGENT_ESCALATE=never fuerza siempre el base (Haiku) aunque sea compleja', () => {
    process.env['AGENT_ESCALATE'] = 'never'
    expect(pickAgentModel('analiza y compara todo')).toContain('haiku')
  })

  it('AGENT_ESCALATE=always fuerza Sonnet aunque sea simple', () => {
    process.env['AGENT_ESCALATE'] = 'always'
    expect(pickAgentModel('hola')).toContain('sonnet')
  })

  it('configurable en caliente por env', () => {
    process.env['CLAUDE_MODEL_AGENT'] = 'modelo-x'
    expect(pickAgentModel('hola')).toBe('modelo-x')
  })
})

describe('HU-190 — cobertura completa del agente interno', () => {
  const ctx: TenantContext = { tenantName: 'Nexor', branches: ['Sede'], currency: 'COP', timezone: 'America/Bogota' }

  it('compras (NIRA): incluye alquileres ENTRANTES — "¿qué he alquilado de un externo?"', () => {
    const n = names(['NIRA'], [])
    expect(n).toContain('consultar_alquileres_entrantes')
    // y sigue distinguiéndose de los alquileres SALIENTES (KIRA), que NIRA no tiene:
    expect(n).not.toContain('consultar_alquileres')
  })

  it('finanzas (VERA): presupuestos y centros de costo son consultables', () => {
    const n = names(['VERA'], [])
    expect(n).toContain('consultar_presupuestos')
    expect(n).toContain('consultar_centros_costo')
  })

  it('admin: ve alquileres entrantes Y salientes (cobertura total, nada oculto)', () => {
    const n = names(['KIRA', 'NIRA', 'ARI', 'AGENDA', 'VERA'], [])
    expect(n).toContain('consultar_alquileres')            // salientes (lo que prestamos)
    expect(n).toContain('consultar_alquileres_entrantes')  // entrantes (lo que alquilamos de un tercero)
    expect(n).toContain('consultar_presupuestos')
    expect(n).toContain('consultar_centros_costo')
  })

  it('las tools nuevas son de lectura → entran también en el scope relacionado (read)', () => {
    // Un jefe de compras (NIRA) con VERA relacionado en solo-lectura ve presupuestos/centros de costo:
    const n = names(['NIRA'], ['VERA'])
    expect(n).toContain('consultar_presupuestos')
    expect(n).toContain('consultar_centros_costo')
  })

  it('recordatorios: consultables por CUALQUIER rol (tool transversal de empresa)', () => {
    expect(names(['KIRA'], [])).toContain('consultar_recordatorios')          // operativo
    expect(names([], [])).toContain('consultar_recordatorios')                 // sin módulo
    expect(names(['KIRA', 'NIRA', 'ARI', 'AGENDA', 'VERA'], [])).toContain('consultar_recordatorios') // admin
  })

  it('inyecta el rol del usuario para no gastar un turno preguntando "¿eres admin?"', () => {
    const p = getSystemPrompt('INTERNO', ctx, 'internal', ['Ventas'], 'TENANT_ADMIN')
    expect(p).toMatch(/administrador de la empresa/i)
    expect(p).toMatch(/nunca le preguntes si es admin/i)
    // Sin rol → no se agrega la línea (compatibilidad).
    expect(getSystemPrompt('INTERNO', ctx, 'internal', ['Ventas'])).not.toMatch(/nunca le preguntes si es admin/i)
  })

  it('el prompt interno prohíbe negar la existencia y protege solo los secretos', () => {
    const p = getSystemPrompt('INTERNO', ctx, 'internal', ['Compras y alquileres entrantes'])
    expect(p).toMatch(/no existe en el sistema/i)     // aparece en la PROHIBICIÓN de decirlo
    expect(p).toMatch(/secretos de seguridad/i)
    expect(p).toMatch(/contraseñas, tokens/i)
  })
})
