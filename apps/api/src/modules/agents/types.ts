/**
 * Tipos compartidos del motor de agentes IA.
 */

import type Anthropic from '@anthropic-ai/sdk'

// ─── Input / Output del AgentRunner ──────────────────────────────────────────

export type AgentModule  = 'KIRA' | 'NIRA' | 'ARI' | 'AGENDA' | 'VERA'
export type AgentChannel = 'whatsapp' | 'gmail' | 'internal'
/** Razón por la que el agente respondió con el mensaje de fallback. */
export type FallbackReason = 'max_turns' | 'api_error'

export interface AgentRunnerInput {
  tenantId:      string
  module:        AgentModule
  channel:       AgentChannel
  /** Mensaje de texto del remitente */
  message:       string
  /** phone/email del remitente — para saber a quién responder */
  senderId:      string
  /** ID de integración activa del canal */
  integrationId: string
  /** ID del usuario autenticado (solo canal internal) */
  userId?:       string
  /** Rol del usuario — permite a las tools aplicar restricciones de acceso */
  userRole?:     string
}

export interface AgentRunnerResult {
  /** Respuesta final que se enviará al remitente */
  reply:           string
  /** Nombres de las tools ejecutadas */
  toolsUsed:       string[]
  /** Detalle completo de cada llamada a tool */
  toolDetails:     ToolDetail[]
  turnCount:       number
  durationMs:      number
  /** true si el agente alcanzó MAX_TURNS sin respuesta final */
  hitMaxTurns:     boolean
  /** Razón del fallback cuando el agente no pudo resolver la solicitud. undefined en ejecuciones exitosas. */
  fallbackReason?: FallbackReason
}

export interface ToolDetail {
  tool:      string
  input:     unknown
  output:    unknown
  error?:    string
  timestamp: string
}

// ─── Contexto de ejecución ────────────────────────────────────────────────────

/** Contexto del usuario pasado a cada tool para control de acceso por rol. */
export interface ExecutionContext {
  userId?:   string
  userRole?: string
}

// ─── Definición de una Tool ───────────────────────────────────────────────────

export interface AgentTool {
  /** Esquema que Claude lee para decidir cuándo y cómo llamar la tool */
  definition: Anthropic.Tool
  /** Función real que ejecuta la lógica contra la DB */
  execute: (input: Record<string, unknown>, tenantId: string, ctx?: ExecutionContext) => Promise<unknown>
}
