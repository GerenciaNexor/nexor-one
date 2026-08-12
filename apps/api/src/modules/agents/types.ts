/**
 * Tipos compartidos del motor de agentes IA.
 */

import type Anthropic from '@anthropic-ai/sdk'

// ─── Input / Output del AgentRunner ──────────────────────────────────────────

export type AgentModule  = 'KIRA' | 'NIRA' | 'ARI' | 'AGENDA' | 'VERA' | 'ATENCION' | 'INTERNO'
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
  /**
   * Historial previo de la conversación (memoria por sesión — HU-183). Solo lo usa el canal
   * internal (chat del dashboard): son los mensajes anteriores del mismo chat, en orden
   * cronológico, para que el agente recuerde el contexto. WhatsApp/Gmail no lo envían.
   */
  history?:      { role: 'user' | 'assistant'; content: string }[]
  /**
   * Alcance del agente interno unificado (module='INTERNO', HU-187), derivado del ROL del usuario:
   *   - internalFull:  módulos con acceso total (todas sus tools).
   *   - internalRead:  módulos con acceso de solo lectura (solo tools de consulta).
   *   - internalAreas: etiquetas legibles de las áreas accesibles (para el prompt).
   * El agente NUNCA obtiene tools de un módulo fuera de este alcance → no puede consultar áreas
   * para las que el usuario no tiene permiso.
   */
  internalFull?:  AgentModule[]
  internalRead?:  AgentModule[]
  internalAreas?: string[]
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
  /** Canal por el que llega el mensaje (whatsapp/gmail/internal) — HU-195: origen real de la cita. */
  channel?:  string
}

// ─── Definición de una Tool ───────────────────────────────────────────────────

export interface AgentTool {
  /** Esquema que Claude lee para decidir cuándo y cómo llamar la tool */
  definition: Anthropic.Tool
  /** Función real que ejecuta la lógica contra la DB */
  execute: (input: Record<string, unknown>, tenantId: string, ctx?: ExecutionContext) => Promise<unknown>
}
