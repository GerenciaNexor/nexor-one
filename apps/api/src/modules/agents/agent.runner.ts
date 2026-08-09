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
import { getSystemPrompt, type TenantContext } from './prompts'
import { getAgentTenantContext } from './tenant-context'
import { KIRA_TOOLS    } from './tools/kira.tools'
import { NIRA_TOOLS    } from './tools/nira.tools'
import { ARI_TOOLS, ATENCION_TOOLS } from './tools/ari.tools'
import { AGENDA_TOOLS  } from './tools/agenda.tools'
import { VERA_TOOLS    } from './tools/vera.tools'
import { EMPRESA_TOOLS } from './tools/empresa.tools'
import type { AgentModule, AgentChannel, AgentRunnerInput, AgentRunnerResult, AgentTool, ToolDetail, FallbackReason } from './types'

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_TURNS    = 10
const MAX_RETRIES  = 3
const FALLBACK_MSG = 'No pude completar esta solicitud automáticamente. Un asesor te contactará pronto.'

// ─── Selector de tools por módulo ─────────────────────────────────────────────

function getToolsForModule(module: AgentModule): AgentTool[] {
  const moduleTools: AgentTool[] = (() => {
    switch (module) {
      case 'KIRA':     return KIRA_TOOLS
      case 'NIRA':     return NIRA_TOOLS
      case 'ARI':      return ARI_TOOLS
      case 'AGENDA':   return AGENDA_TOOLS
      case 'VERA':     return VERA_TOOLS
      case 'ATENCION': return ATENCION_TOOLS
    }
  })()
  // Las tools de empresa (sucursales, usuarios) se agregan a todos los módulos
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

// ─── Llamada a Claude con reintento exponencial ───────────────────────────────

async function callClaude(
  client:     Anthropic,
  model:      string,
  system:     string,
  messages:   Anthropic.MessageParam[],
  tools:      Anthropic.Tool[],
  attempt = 1,
): Promise<Anthropic.Message> {
  try {
    return await client.messages.create({
      model,
      max_tokens: 1024,
      system,
      messages,
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
  const agentTools = getToolsForModule(input.module)
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
  const featureFlag = input.module === 'ATENCION'
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
  // fuera de demo, el modelo normal (CLAUDE_MODEL). No hardcodeado disperso.
  const model = isDemo ? demoModel() : (process.env['CLAUDE_MODEL'] ?? 'claude-opus-4-6')

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
  const systemPrompt = getSystemPrompt(input.module, tenantCtx, input.channel)

  // ── 3. Bucle de conversación ───────────────────────────────────────────────
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: input.message },
  ]

  const toolDetails: ToolDetail[]  = []
  const toolsUsed:   string[]      = []
  let   turnCount     = 0
  let   finalReply    = FALLBACK_MSG
  let   hitMaxTurns   = false
  let   fallbackReason: FallbackReason | undefined

  try {
    while (turnCount < MAX_TURNS) {
      turnCount++

      const response = await callClaude(
        client,
        model,
        systemPrompt,
        messages,
        agentTools.map((t) => t.definition),
      )

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
