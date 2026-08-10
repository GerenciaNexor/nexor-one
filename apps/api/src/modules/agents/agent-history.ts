/**
 * Memoria de conversación → turnos para la API de Anthropic (HU-186).
 *
 * El agente recibe el historial previo (últimos N mensajes) como contexto. La API de Anthropic exige:
 *   - el primer mensaje debe ser 'user' (el system prompt va aparte),
 *   - no puede haber dos mensajes seguidos del mismo rol.
 * Un cliente externo puede escribir varias veces antes de que se le responda → mensajes 'user'
 * consecutivos; y el hilo puede empezar con una respuesta del negocio → 'assistant' al inicio.
 * Esta función combina el historial con el mensaje actual y lo sanea: descarta los 'assistant'
 * iniciales y fusiona los turnos consecutivos del mismo rol.
 */
import type Anthropic from '@anthropic-ai/sdk'

export interface ConversationTurn {
  role:    'user' | 'assistant'
  content: string
}

export function buildConversationTurns(
  history:        ConversationTurn[] | undefined,
  currentMessage: string,
): Anthropic.MessageParam[] {
  const raw: ConversationTurn[] = [...(history ?? []), { role: 'user', content: currentMessage }]
  const turns: ConversationTurn[] = []

  for (const t of raw) {
    if (turns.length === 0 && t.role !== 'user') continue // Anthropic exige empezar con 'user'
    const last = turns[turns.length - 1]
    if (last && last.role === t.role) last.content += `\n${t.content}` // fusiona consecutivos del mismo rol
    else turns.push({ role: t.role, content: t.content })
  }

  return turns.map((m) => ({ role: m.role, content: m.content }))
}
