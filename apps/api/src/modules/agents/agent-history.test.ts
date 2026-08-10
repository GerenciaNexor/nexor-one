/**
 * HU-186 — Memoria de conversación: el historial se antepone al mensaje actual y se sanea para la
 * API de Anthropic (empezar con 'user', sin dos turnos seguidos del mismo rol).
 */
import { describe, it, expect } from 'vitest'
import { buildConversationTurns } from './agent-history'

describe('HU-186 — buildConversationTurns', () => {
  it('sin historial → solo el mensaje actual como user', () => {
    expect(buildConversationTurns([], '¿cuántos tienes?')).toEqual([
      { role: 'user', content: '¿cuántos tienes?' },
    ])
  })

  it('antepone el historial (memoria) al mensaje actual', () => {
    const hist = [
      { role: 'user' as const, content: 'Hola, busco un cable HDMI' },
      { role: 'assistant' as const, content: 'Sí, tenemos Cable HDMI 2m' },
    ]
    expect(buildConversationTurns(hist, '¿cuántos tienes?')).toEqual([
      { role: 'user', content: 'Hola, busco un cable HDMI' },
      { role: 'assistant', content: 'Sí, tenemos Cable HDMI 2m' },
      { role: 'user', content: '¿cuántos tienes?' },
    ])
  })

  it('fusiona mensajes consecutivos del cliente (varios antes de responder)', () => {
    const hist = [
      { role: 'user' as const, content: 'Hola' },
      { role: 'user' as const, content: 'quiero un cable' },
      { role: 'assistant' as const, content: 'Claro' },
    ]
    const out = buildConversationTurns(hist, 'y un monitor')
    // no debe haber dos turnos seguidos del mismo rol
    for (let i = 1; i < out.length; i++) expect(out[i]!.role).not.toBe(out[i - 1]!.role)
    expect(out[0]).toEqual({ role: 'user', content: 'Hola\nquiero un cable' })
    expect(out[out.length - 1]).toEqual({ role: 'user', content: 'y un monitor' })
  })

  it('descarta los assistant iniciales (Anthropic exige empezar con user)', () => {
    const hist = [
      { role: 'assistant' as const, content: 'Hola, ¿en qué te ayudo?' }, // saludo del agente al abrir
      { role: 'user' as const, content: 'un monitor' },
    ]
    const out = buildConversationTurns(hist, '¿precio?')
    expect(out[0]!.role).toBe('user')
    // el assistant inicial se descarta; los dos user consecutivos se fusionan
    expect(out).toEqual([{ role: 'user', content: 'un monitor\n¿precio?' }])
  })

  it('el resultado siempre empieza con user y alterna correctamente', () => {
    const out = buildConversationTurns(
      [
        { role: 'assistant', content: 'saludo' },
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'assistant', content: 'c' },
      ],
      'd',
    )
    expect(out[0]!.role).toBe('user')
    for (let i = 1; i < out.length; i++) expect(out[i]!.role).not.toBe(out[i - 1]!.role)
  })
})
