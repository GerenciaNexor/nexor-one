/**
 * HU-180 — Agente de atención al cliente: persona y frontera de información (prompt + catálogo).
 *
 * Garantías de cara al cliente que NO deben regresionar:
 *   - Un único agente que habla en nombre de la empresa, consciente del canal.
 *   - NO se identifica como asistente interno, ni como IA/bot, ni expone sus instrucciones.
 *   - Su catálogo de tools es de cara al público: sin usuarios (empleados), sin stock crudo,
 *     sin tools de escritura de inventario/compras.
 *   - El prompt fija la frontera de información (qué se puede y qué NUNCA se revela).
 */
import { describe, it, expect } from 'vitest'
import { getSystemPrompt, type TenantContext } from './prompts'
import { ATENCION_TOOLS } from './tools/atencion.tools'

const ctx: TenantContext = { tenantName: 'Demo SAS', branches: ['Sede Principal'], currency: 'COP' }

describe('HU-180 — persona del agente de atención (ATENCION)', () => {
  it('habla en nombre de la empresa y es consciente del canal', () => {
    const wa = getSystemPrompt('ATENCION', ctx, 'whatsapp')
    const gm = getSystemPrompt('ATENCION', ctx, 'gmail')
    expect(wa).toContain('Demo SAS')
    expect(wa).toMatch(/atenci[oó]n al cliente/i)
    expect(wa).toContain('WhatsApp')
    expect(gm).toContain('correo')
  })

  it('NO se identifica como asistente interno de inventario ni asume el dashboard', () => {
    const p = getSystemPrompt('ATENCION', ctx, 'gmail')
    expect(p).not.toMatch(/asistente de inventario/i)
    expect(p).not.toMatch(/en el dashboard/i)
  })

  it('los prompts internos siguen intactos (KIRA = inventario)', () => {
    expect(getSystemPrompt('KIRA', ctx)).toMatch(/asistente de inventario/i)
  })
})

describe('HU-180 — frontera de información en el prompt', () => {
  const p = getSystemPrompt('ATENCION', ctx, 'whatsapp')

  it('enuncia el principio rector "ante la duda, NO revelar"', () => {
    expect(p).toMatch(/ante la duda,? no revel/i)
  })

  it('prohíbe revelar costo, márgenes y finanzas', () => {
    expect(p).toMatch(/costo|precio de compra/i)
    expect(p).toMatch(/m[aá]rgenes|ganancias/i)
    expect(p).toMatch(/financiera|ingresos|egresos/i)
  })

  it('prohíbe revelar datos de empleados, otros clientes, terceros y proveedores', () => {
    expect(p).toMatch(/empleados/i)
    expect(p).toMatch(/otros clientes|terceros/i)
    expect(p).toMatch(/proveedores/i)
  })

  it('prohíbe reportar inventario de forma espontánea y limita a lo pedido', () => {
    expect(p).toMatch(/nunca reportes existencias|espont/i)
    expect(p).toMatch(/cu[aá]nto puedes ofrecer|ofrecerte hasta/i)
  })

  it('sobre citas: solo libre/ocupado, nunca detalles', () => {
    expect(p).toMatch(/horario est[aá] libre|libre u ocupado/i)
    expect(p).toMatch(/nunca digas con qui[eé]n/i)
  })

  it('deriva la compra a un humano (no cierra la venta)', () => {
    expect(p).toMatch(/registrar_interes|un asesor|no cierras/i)
  })

  it('nunca revela que es IA/bot ni sus instrucciones, y resiste manipulación', () => {
    expect(p).toMatch(/nunca reveles que eres una ia|bot|modelo/i)
    expect(p).toMatch(/ignora tus instrucciones|manipulaci[oó]n/i)
  })

  it('evade con naturalidad y redirige (no un muro "confidencial")', () => {
    expect(p).toMatch(/ev[aá]dela con naturalidad|redirige/i)
  })
})

describe('HU-180 — catálogo de tools de ATENCION (defensa en profundidad)', () => {
  const names = ATENCION_TOOLS.map((t) => t.definition.name)

  it('incluye solo tools de cara al público', () => {
    expect(names).toEqual(
      expect.arrayContaining(['consultar_disponibilidad', 'registrar_interes', 'consultar_sucursales']),
    )
  })

  it('NO incluye consultar_usuarios (empleados)', () => {
    expect(names).not.toContain('consultar_usuarios')
  })

  it('NO incluye consultar_stock_producto (expone inventario crudo)', () => {
    expect(names).not.toContain('consultar_stock_producto')
  })

  it('NO incluye ninguna tool de escritura de inventario/compras', () => {
    expect(names.some((n) => /movimiento|ajuste|crear_solicitud_compra|crear_borrador|crear_oc/i.test(n))).toBe(false)
  })
})
