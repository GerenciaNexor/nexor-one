/**
 * HU-180 — Agente de atención al cliente para canales externos.
 *
 * Garantías de cara al cliente que NO deben regresionar (causa raíz de HU-179):
 *   - El prompt de ATENCION habla en nombre de la empresa y es consciente del canal.
 *   - NO se identifica como asistente interno de inventario ni asume "usuario en el dashboard".
 *   - Sus tools son seguras de cara al cliente (sin escritura de inventario).
 */
import { describe, it, expect } from 'vitest'
import { getSystemPrompt, type TenantContext } from './prompts'
import { ATENCION_TOOLS } from './tools/ari.tools'

const ctx: TenantContext = { tenantName: 'Demo SAS', branches: ['Sede Principal'], currency: 'COP' }

describe('HU-180 — prompt del agente de atención (ATENCION)', () => {
  it('habla en nombre de la empresa y se presenta como atención al cliente', () => {
    const p = getSystemPrompt('ATENCION', ctx, 'whatsapp')
    expect(p).toContain('Demo SAS')
    expect(p).toMatch(/atenci[oó]n al cliente/i)
  })

  it('es consciente del canal (WhatsApp vs correo)', () => {
    expect(getSystemPrompt('ATENCION', ctx, 'whatsapp')).toContain('WhatsApp')
    expect(getSystemPrompt('ATENCION', ctx, 'gmail')).toContain('correo')
  })

  it('NO se identifica como asistente interno de inventario ni asume el dashboard', () => {
    const p = getSystemPrompt('ATENCION', ctx, 'gmail')
    expect(p).not.toMatch(/asistente de inventario/i)
    expect(p).not.toMatch(/en el dashboard/i)
  })

  it('prohíbe explícitamente responder "no manejo esto"', () => {
    expect(getSystemPrompt('ATENCION', ctx, 'whatsapp')).toMatch(/NUNCA/)
  })

  it('los prompts internos siguen intactos (KIRA = inventario)', () => {
    expect(getSystemPrompt('KIRA', ctx)).toMatch(/asistente de inventario/i)
  })
})

describe('HU-180 — tools del agente de atención', () => {
  const names = ATENCION_TOOLS.map((t) => t.definition.name)

  it('reutiliza solo tools seguras de cara al cliente', () => {
    expect(names).toEqual(
      expect.arrayContaining(['buscar_cliente', 'consultar_stock_producto', 'crear_lead', 'notificar_vendedor']),
    )
  })

  it('NO incluye ninguna tool de escritura de inventario/compras', () => {
    expect(names.some((n) => /movimiento|ajuste|crear_solicitud_compra|crear_borrador/i.test(n))).toBe(false)
  })
})
