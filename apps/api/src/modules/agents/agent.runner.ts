/**
 * AgentRunner — HU-049
 *
 * Núcleo del motor de agentes IA de NEXOR.
 * Orquesta el bucle tool-use con Claude API:
 *   1. Carga contexto del tenant y system prompt del módulo
 *   2. Llama a Claude con el mensaje y el catálogo de tools
 *   3. Si Claude quiere ejecutar una tool → la ejecuta y devuelve el resultado
 *   4. Repite hasta end_turn o MAX_TURNS
 *   5. Guarda el log inmutable en agent_logs (SIEMPRE, incluso en error)
 *
 * Reglas que nunca se rompen:
 *   - El log se guarda aunque el agente falle
 *   - Las tools son las únicas puertas de entrada a la DB
 *   - Cada tool valida tenantId antes de escribir
 *   - Stock nunca puede quedar negativo (validado en la tool)
 *   - MAX_TURNS = 10 no puede ser modificado por el tenant
 */

import Anthropic from '@anthropic-ai/sdk'
import { directPrisma, withTenantContext, runInTenantTransaction } from '../../lib/prisma'
import { demoModel, demoAiWhere, demoAiExhaustedMessage, effectiveAiQuota } from '../../lib/demo-limits'
import { getSystemPrompt, getVolatileContext, type TenantContext } from './prompts'
import { buildConversationTurns } from './agent-history'
import { getAgentTenantContext } from './tenant-context'
import { KIRA_TOOLS    } from './tools/kira.tools'
import { NIRA_TOOLS    } from './tools/nira.tools'
import { ARI_TOOLS     } from './tools/ari.tools'
import { ATENCION_TOOLS } from './tools/atencion.tools'
import { AGENDA_TOOLS  } from './tools/agenda.tools'
import { VERA_TOOLS    } from './tools/vera.tools'
import { EMPRESA_TOOLS } from './tools/empresa.tools'
import type { AgentModule, AgentChannel, AgentRunnerInput, AgentRunnerResult, AgentTool, ToolDetail, FallbackReason } from './types'

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_TURNS    = 10
const MAX_RETRIES  = 3
const FALLBACK_MSG = 'No pude completar esta solicitud automáticamente. Un asesor te contactará pronto.'

// ── HU-192 — Modelo del agente (no-demo): estrategia HÍBRIDA de costo ──────────
// La mayoría de consultas del agente son de DATOS (recordatorios, stock, ventas…): Haiku basta y es
// ~15x más barato que Opus. Solo se escala a Sonnet cuando la consulta amerita razonamiento. NUNCA
// Opus. Todo configurable por env para ajustar EN CALIENTE (sin redeploy):
//   CLAUDE_MODEL_AGENT          → modelo base           (default Haiku 4.5)
//   CLAUDE_MODEL_AGENT_COMPLEX  → modelo de escalado     (default Sonnet 4.5)
//   AGENT_ESCALATE = auto|never|always                   (default auto)
// OJO: el base NO se encadena a CLAUDE_MODEL (que en prod apunta a Opus): el default barato es a propósito.
const DEFAULT_AGENT_MODEL         = 'claude-haiku-4-5-20251001'
const DEFAULT_AGENT_MODEL_COMPLEX = 'claude-sonnet-4-5-20250929'

// Heurística conservadora de complejidad: se escala a Sonnet solo si la consulta pide análisis /
// razonamiento, es muy larga o multiparte. Ante la duda → Haiku (menor costo). Ajustable con AGENT_ESCALATE.
const COMPLEX_HINTS = /(analiz|an[aá]lisis|compar|por qu[eé]|recomiend|recomendaci|proyect|tendenci|estrategi|explica|eval[uú]|optimiz|deber[ií]a|convien|razon|proyecci)/i
function isComplexQuery(message: string): boolean {
  if (COMPLEX_HINTS.test(message)) return true
  if (message.length > 320) return true
  return (message.match(/\?/g) ?? []).length >= 3
}

export function agentModel(message: string): string {
  const base    = process.env['CLAUDE_MODEL_AGENT']         ?? DEFAULT_AGENT_MODEL
  const complex = process.env['CLAUDE_MODEL_AGENT_COMPLEX'] ?? DEFAULT_AGENT_MODEL_COMPLEX
  const mode    = (process.env['AGENT_ESCALATE'] ?? 'auto').toLowerCase()
  if (mode === 'never')  return base
  if (mode === 'always') return complex
  return isComplexQuery(message) ? complex : base
}

// ─── Selector de tools por módulo ─────────────────────────────────────────────

/** Catálogo de tools por módulo interno de negocio. */
const MODULE_CATALOG: Record<'KIRA' | 'NIRA' | 'ARI' | 'AGENDA' | 'VERA', AgentTool[]> = {
  KIRA: KIRA_TOOLS, NIRA: NIRA_TOOLS, ARI: ARI_TOOLS, AGENDA: AGENDA_TOOLS, VERA: VERA_TOOLS,
}

/** Una tool es de SOLO LECTURA si consulta/lista/ve (no modifica datos). */
const READ_ONLY_TOOL = /^(consultar|listar|ver|buscar|comparar)_/

/**
 * Catálogo del agente interno UNIFICADO (HU-187): unión de las tools de los módulos permitidos por
 * el ROL del usuario. Los módulos con acceso TOTAL aportan todas sus tools; los de SOLO LECTURA solo
 * sus tools de consulta. Incluye EMPRESA_TOOLS (sucursales/usuarios, con sus propios guards por rol).
 * El agente jamás recibe tools de un módulo fuera del alcance → no puede consultar áreas sin permiso.
 */
export function buildInternalTools(full: AgentModule[], read: AgentModule[]): AgentTool[] {
  const byName = new Map<string, AgentTool>()
  for (const m of full) {
    if (m in MODULE_CATALOG) for (const t of MODULE_CATALOG[m as keyof typeof MODULE_CATALOG]) byName.set(t.definition.name, t)
  }
  for (const m of read) {
    if (m in MODULE_CATALOG) for (const t of MODULE_CATALOG[m as keyof typeof MODULE_CATALOG]) {
      if (READ_ONLY_TOOL.test(t.definition.name) && !byName.has(t.definition.name)) byName.set(t.definition.name, t)
    }
  }
  for (const t of EMPRESA_TOOLS) byName.set(t.definition.name, t)
  return [...byName.values()]
}

function getToolsForModule(module: AgentModule): AgentTool[] {
  // ATENCION (HU-180) es de cara al CLIENTE: NO hereda EMPRESA_TOOLS en bloque, porque
  // consultar_usuarios expone datos de empleados (frontera de información). Su catálogo ya
  // es autosuficiente e incluye consultar_sucursales (público).
  if (module === 'ATENCION') return ATENCION_TOOLS
  // INTERNO (HU-187) usa buildInternalTools según el rol; runAgent lo maneja aparte. Defensivo:
  if (module === 'INTERNO')  return [...EMPRESA_TOOLS]

  const moduleTools: AgentTool[] = (() => {
    switch (module) {
      case 'KIRA':     return KIRA_TOOLS
      case 'NIRA':     return NIRA_TOOLS
      case 'ARI':      return ARI_TOOLS
      case 'AGENDA':   return AGENDA_TOOLS
      case 'VERA':     return VERA_TOOLS
    }
  })()
  // Las tools de empresa (sucursales, usuarios) se agregan a los módulos INTERNOS.
  return [...moduleTools, ...EMPRESA_TOOLS]
}

// ─── Cliente Anthropic (singleton lazy) ───────────────────────────────────────

let anthropicClient: Anthropic | null = null

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env['ANTHROPIC_API_KEY']
    if (!apiKey) throw new Error('[AgentRunner] ANTHROPIC_API_KEY no está configurada.')
    anthropicClient = new Anthropic({ apiKey })
  }
  return anthropicClient
}

// ─── Prompt caching del historial ─────────────────────────────────────────────

/**
 * Devuelve una COPIA de `messages` con cache_control en el último bloque del último mensaje, sin
 * mutar el array persistente (que se sigue creciendo en el bucle). Esto fija un punto de cache al
 * final del prefijo actual: dentro de un mismo request multi-turno, el turno N+1 lee el prefijo del
 * turno N a tarifa de cache en vez de re-cobrarlo completo. Un solo breakpoint (sumado al del system
 * estable = 2, dentro del límite de 4). Si el contenido es string, se normaliza a bloque de texto.
 */
function markLastMessageForCache(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages
  const out = messages.slice()
  const last = out[out.length - 1]!
  const blocks = (typeof last.content === 'string'
    ? [{ type: 'text', text: last.content }]
    : last.content.slice()) as Anthropic.ContentBlockParam[]
  if (blocks.length === 0) return messages
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: 'ephemeral' } } as Anthropic.ContentBlockParam
  out[out.length - 1] = { ...last, content: blocks }
  return out
}

// ─── Llamada a Claude con reintento exponencial ───────────────────────────────

async function callClaude(
  client:     Anthropic,
  model:      string,
  system:     Anthropic.TextBlockParam[],
  messages:   Anthropic.MessageParam[],
  tools:      Anthropic.Tool[],
  attempt = 1,
): Promise<Anthropic.Message> {
  // Prompt caching (HU-192): el bloque `system` estable ya viene marcado con cache_control en el
  // caller → Anthropic cachea, por jerarquía, TODAS las tools + el system estable (el payload fijo
  // ~6.3k tokens). Además marcamos el ÚLTIMO mensaje para cachear el prefijo del HISTORIAL: así, en
  // el bucle multi-turno, cada turno lee el prefijo previo a 0.1x en vez de re-cobrarlo completo.
  const messagesToSend = markLastMessageForCache(messages)
  try {
    return await client.messages.create({
      model,
      max_tokens: 1024,
      system,
      messages: messagesToSend,
      tools: tools.length > 0 ? tools : undefined,
    })
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw err
    const delay = Math.pow(2, attempt) * 1000
    await new Promise((r) => setTimeout(r, delay))
    return callClaude(client, model, system, messages, tools, attempt + 1)
  }
}

// ─── Guardar log (siempre, aunque falle) ─────────────────────────────────────

export async function saveLog(params: {
  tenantId:     string
  module:       AgentModule
  channel:      AgentChannel
  inputMessage: string
  reply:        string | null
  toolsUsed:    string[]
  toolDetails:  ToolDetail[]
  turnCount:    number
  durationMs:   number
}): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // HU-119 (BUG-004, 2ª instancia): el AgentRunner corre desde el worker sin
      // tenantHook, así que app.current_tenant_id no está seteado. withTenantContext
      // lo inyecta para que RLS permita el INSERT bajo el rol de aplicación (nexor_app),
      // no solo en dev con superusuario. El AgentLog SIEMPRE debe guardarse.
      await withTenantContext(params.tenantId, (tx) =>
        tx.agentLog.create({
          data: {
            tenantId:     params.tenantId,
            module:       params.module,
            channel:      params.channel,
            inputMessage: params.inputMessage,
            reply:        params.reply,
            toolsUsed:    params.toolsUsed,
            toolDetails:  params.toolDetails as object[],
            turnCount:    params.turnCount,
            durationMs:   params.durationMs,
          },
        }),
      )
      return
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        // Log de emergencia si Prisma falla — nunca silencio
        console.error('[AgentRunner] CRÍTICO: no se pudo guardar agent_log', err)
      }
    }
  }
}

// ─── Notificación de fallback al equipo humano ────────────────────────────────

const FALLBACK_REASON_LABEL: Record<FallbackReason, string> = {
  max_turns: 'límite de turnos alcanzado',
  api_error: 'error de Claude API',
}

const CHANNEL_LABEL: Record<AgentChannel, string> = {
  whatsapp: 'WhatsApp',
  gmail:    'Gmail',
  internal: 'Chat interno',
}

export async function notifyFallback(
  tenantId: string,
  module:   AgentModule,
  channel:  AgentChannel,
  message:  string,
  reason:   FallbackReason,
): Promise<void> {
  try {
    // HU-119: misma raíz que saveLog — bajo el rol de aplicación (nexor_app) RLS
    // bloquearía la lectura de users y el INSERT en notifications sin contexto de
    // tenant. withTenantContext lo inyecta para todo el bloque.
    await withTenantContext(tenantId, async (tx) => {
      const managers = await tx.user.findMany({
        where:  { tenantId, role: { in: ['AREA_MANAGER', 'TENANT_ADMIN'] } },
        select: { id: true },
      })
      if (managers.length === 0) return

      await tx.notification.createMany({
        data: managers.map((u) => ({
          tenantId,
          userId:  u.id,
          module,
          type:    'agente_fallback',
          title:   `⚠️ Agente ${module} — atención requerida`,
          message: `El agente no pudo resolver una solicitud por ${FALLBACK_REASON_LABEL[reason]}. Canal: ${CHANNEL_LABEL[channel]}. Mensaje: "${message.slice(0, 200)}".`,
        })),
      })
    })
  } catch (err) {
    console.error('[AgentRunner] No se pudo crear notificación de fallback:', err)
  }
}

// ─── AgentRunner.run ──────────────────────────────────────────────────────────

export async function runAgent(input: AgentRunnerInput): Promise<AgentRunnerResult> {
  const startTime  = Date.now()
  const client     = getAnthropicClient()
  // INTERNO (HU-187): catálogo unificado según el alcance del rol; el resto, tools de su módulo.
  const agentTools = input.module === 'INTERNO'
    ? buildInternalTools(input.internalFull ?? [], input.internalRead ?? [])
    : getToolsForModule(input.module)
  const toolMap    = new Map(agentTools.map((t) => [t.definition.name, t]))

  // ── 1. Verificar que el módulo está habilitado para el tenant ────────────
  // directPrisma: el AgentRunner corre en contexto de webhook (sin tenantHook),
  // por lo que app.current_tenant_id nunca fue seteado. La política RLS bloquearía
  // la query con prisma. directPrisma (superuser) bypasea RLS; el WHERE tenantId
  // garantiza el aislamiento a nivel de aplicación.
  //
  // ATENCION (HU-180) es el agente de atención al cliente para canales externos:
  // no es un módulo de negocio, no tiene FeatureFlag y no se gestiona por tenant.
  // Se exceptúa del gate (siempre disponible: si llegó un mensaje por WhatsApp/Gmail,
  // el canal ya está configurado para el tenant).
  // ATENCION e INTERNO (HU-180/187) no son módulos de negocio con FeatureFlag propio: se exceptúan
  // del gate. INTERNO ya está acotado por el alcance del rol (internalFull/internalRead).
  const featureFlag = (input.module === 'ATENCION' || input.module === 'INTERNO')
    ? { enabled: true }
    : await directPrisma.featureFlag.findFirst({
        where:  { tenantId: input.tenantId, module: input.module as never },
        select: { enabled: true },
      })
  if (!featureFlag?.enabled) {
    const disabledReply = `El módulo ${input.module} no está activo para este tenant. Contacta al administrador de NEXOR.`
    const durationMs = Date.now() - startTime
    await saveLog({
      tenantId:     input.tenantId,
      module:       input.module,
      channel:      input.channel,
      inputMessage: input.message,
      reply:        disabledReply,
      toolsUsed:    [],
      toolDetails:  [{ tool: '__module_disabled__', input: { module: input.module }, output: null, timestamp: new Date().toISOString() }],
      turnCount:    0,
      durationMs,
    })
    return { reply: disabledReply, toolsUsed: [], toolDetails: [], turnCount: 0, durationMs, hitMaxTurns: false, fallbackReason: undefined }
  }

  // ── 1b. HU-144 — Modo demo: modelo más barato + cupo de IA ─────────────────
  // directPrisma: mismo contexto webhook (sin tenantHook) que el resto del runner.
  const tenantDemo = await directPrisma.tenant.findUnique({
    where:  { id: input.tenantId },
    select: { isDemo: true, demoAiQuotaBonus: true },
  })
  const isDemo = !!tenantDemo?.isDemo
  // En demo se fuerza el modelo Claude más barato (configurable por CLAUDE_MODEL_DEMO);
  // fuera de demo, la estrategia híbrida (Haiku por default, Sonnet solo si la consulta lo amerita).
  const model = isDemo ? demoModel() : agentModel(input.message)

  // HU-144/148 — Cupo TOTAL de mensajes de agente en la demo (candado de costo). El contador es
  // PERSISTENTE y a prueba de reseteo: se cuenta desde agent_logs (append-only) para ESTE tenant,
  // no en la sesión ni en el frontend → cubre WhatsApp/Gmail/chat interno por igual. El tope
  // efectivo = base (30) + la ampliación que sólo el SUPER_ADMIN puede conceder (auditada).
  if (isDemo) {
    const quota  = effectiveAiQuota(tenantDemo?.demoAiQuotaBonus)
    const aiUsed = await directPrisma.agentLog.count({ where: demoAiWhere(input.tenantId) })
    if (aiUsed >= quota) {
      const reply      = demoAiExhaustedMessage()  // despedida (invita a gerencia@nexor-one.com)
      const durationMs = Date.now() - startTime
      // Se registra con turnCount 0 (no invocó a Claude) → NO consume cupo adicional ni cuesta tokens.
      await saveLog({
        tenantId:     input.tenantId,
        module:       input.module,
        channel:      input.channel,
        inputMessage: input.message,
        reply,
        toolsUsed:    [],
        toolDetails:  [{ tool: '__demo_ai_quota_exhausted__', input: { used: aiUsed, quota }, output: null, timestamp: new Date().toISOString() }],
        turnCount:    0,
        durationMs,
      })
      return { reply, toolsUsed: [], toolDetails: [], turnCount: 0, durationMs, hitMaxTurns: false, fallbackReason: undefined }
    }
  }

  // ── 2. Contexto del tenant (nombre, sucursales, moneda) ─────────────────────
  // BUG-004: el AgentRunner corre sin tenantHook; getAgentTenantContext usa
  // withTenantContext para que RLS no descarte las sucursales del tenant.
  const tenantCtx: TenantContext = await getAgentTenantContext(input.tenantId)

  // El canal se pasa al prompt: el agente de ATENCION lo usa para saber que atiende a un
  // cliente externo por WhatsApp/Gmail (corrige la ceguera de canal detectada en HU-179).
  // El system se manda en DOS bloques para el prompt caching:
  //  1. Estable (reglas + contexto del tenant) → con cache_control: se cachea junto a las tools.
  //  2. Volátil (fecha/hora al minuto, solo INTERNO) → SIN cache: cambia cada minuto y rompería el
  //     cache si fuera parte del bloque estable. Va pequeño y aparte.
  const stableSystem = getSystemPrompt(input.module, tenantCtx, input.channel, input.internalAreas)
  const volatile     = getVolatileContext(input.module, tenantCtx)
  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: 'text', text: stableSystem, cache_control: { type: 'ephemeral' } },
  ]
  if (volatile) systemBlocks.push({ type: 'text', text: volatile })

  // ── 3. Bucle de conversación ───────────────────────────────────────────────
  // El historial previo (memoria de la conversación — HU-183 interno, HU-186 WhatsApp/Gmail) se
  // antepone al mensaje actual y se sanea para la API de Anthropic (ver buildConversationTurns).
  const messages: Anthropic.MessageParam[] = buildConversationTurns(input.history, input.message)

  const toolDetails: ToolDetail[]  = []
  const toolsUsed:   string[]      = []
  let   turnCount     = 0
  let   finalReply    = FALLBACK_MSG
  let   hitMaxTurns   = false
  let   fallbackReason: FallbackReason | undefined
  // HU-192 — acumuladores de uso para medir el costo real por consulta (observabilidad).
  const usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }

  try {
    while (turnCount < MAX_TURNS) {
      turnCount++

      const response = await callClaude(
        client,
        model,
        systemBlocks,
        messages,
        agentTools.map((t) => t.definition),
      )

      // Acumular uso de tokens (incluye cache write/read del prompt caching).
      const u = response.usage
      usage.input      += u.input_tokens ?? 0
      usage.output     += u.output_tokens ?? 0
      usage.cacheWrite += u.cache_creation_input_tokens ?? 0
      usage.cacheRead  += u.cache_read_input_tokens ?? 0

      // ── 3a. Respuesta final ────────────────────────────────────────────────
      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find((b) => b.type === 'text')
        finalReply = textBlock?.type === 'text' ? textBlock.text : FALLBACK_MSG
        break
      }

      // ── 3b. Tool use ───────────────────────────────────────────────────────
      if (response.stop_reason === 'tool_use') {
        // Añadir respuesta de Claude al historial
        messages.push({ role: 'assistant', content: response.content })

        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue

          const tool = toolMap.get(block.name)
          const timestamp = new Date().toISOString()

          if (!tool) {
            const errMsg = `Tool "${block.name}" no existe en el catálogo de ${input.module}.`
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: errMsg, is_error: true })
            toolDetails.push({ tool: block.name, input: block.input, output: null, error: errMsg, timestamp })
            continue
          }

          if (!toolsUsed.includes(block.name)) toolsUsed.push(block.name)

          try {
            // HU-123/HU-122: el agente corre en el worker (sin transacción por-request).
            // Cada tool se ejecuta dentro de su propia transacción con SET LOCAL para que
            // bajo nexor_app vea/escriba los datos del tenant (RLS). Las llamadas a Claude
            // quedan FUERA de la transacción (no se retiene conexión durante el I/O externo).
            const output = await runInTenantTransaction(input.tenantId, () =>
              tool.execute(
                block.input as Record<string, unknown>,
                input.tenantId,
                { userId: input.userId, userRole: input.userRole },
              ),
            )
            const content = JSON.stringify(output)
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content })
            toolDetails.push({ tool: block.name, input: block.input, output, timestamp })
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: errMsg, is_error: true })
            toolDetails.push({ tool: block.name, input: block.input, output: null, error: errMsg, timestamp })
          }
        }

        messages.push({ role: 'user', content: toolResults })
        continue
      }

      // stop_reason inesperado — salir del bucle
      break
    }

    // ── 4. MAX_TURNS alcanzado ─────────────────────────────────────────────
    if (turnCount >= MAX_TURNS && finalReply === FALLBACK_MSG) {
      hitMaxTurns   = true
      fallbackReason = 'max_turns'
      await notifyFallback(input.tenantId, input.module, input.channel, input.message, 'max_turns')
    }
  } catch (err) {
    console.error('[AgentRunner] Error en el bucle de tool-use:', err)
    finalReply     = FALLBACK_MSG
    fallbackReason = 'api_error'
    await notifyFallback(input.tenantId, input.module, input.channel, input.message, 'api_error')
  }

  // ── 5. Registrar razón de fallback en toolDetails (para auditoría) ────────
  if (fallbackReason) {
    toolDetails.push({
      tool:      '__fallback__',
      input:     { reason: fallbackReason },
      output:    null,
      timestamp: new Date().toISOString(),
    })
  }

  // ── 6. Log inmutable — siempre ────────────────────────────────────────────
  const durationMs = Date.now() - startTime

  // HU-192 — observabilidad de costo: tokens y % de input servido desde cache. Permite VERIFICAR en
  // prod que el caching pega (cacheRead alto) y el modelo usado por consulta (Haiku vs Sonnet).
  const cachedPct = usage.cacheRead + usage.input > 0
    ? Math.round((usage.cacheRead / (usage.cacheRead + usage.input)) * 100)
    : 0
  console.info('[AgentRunner] cost', JSON.stringify({
    module: input.module, model, turns: turnCount,
    inputTokens: usage.input, outputTokens: usage.output,
    cacheWrite: usage.cacheWrite, cacheRead: usage.cacheRead, cachedPct: `${cachedPct}%`,
  }))

  await saveLog({
    tenantId:     input.tenantId,
    module:       input.module,
    channel:      input.channel,
    inputMessage: input.message,
    reply:        finalReply,
    toolsUsed,
    toolDetails,
    turnCount,
    durationMs,
  })

  return { reply: finalReply, toolsUsed, toolDetails, turnCount, durationMs, hitMaxTurns, fallbackReason }
}
