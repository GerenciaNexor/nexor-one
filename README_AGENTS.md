# README_AGENTS — Motor de Agentes IA en NEXOR V1

> Este documento explica cómo funciona el sistema de agentes de NEXOR, qué es el AgentRunner, cómo se definen las tools, y las reglas que nadie puede romper sin comprometer la integridad del sistema.

---

## Concepto fundamental

NEXOR tiene **dos tipos de inteligencia**:

**IA Analítica** — El sistema ya tiene los datos, la IA los analiza y genera recomendaciones. Ejemplo: "Estos 3 proveedores son los más eficientes este mes."

**IA Agéntica** — El agente recibe un mensaje externo (WhatsApp, email), interpreta la intención, y **ejecuta acciones reales en la base de datos** sin intervención humana. Ejemplo: Un cliente escribe "quiero agendar el viernes" y el agente crea la cita, la guarda en la DB y envía la confirmación.

La IA agéntica es la que hace a NEXOR diferente. Es también la más crítica — un bug puede crear datos incorrectos en la empresa de un cliente real.

---

## Los 4 agentes de NEXOR V1

| Agente | Módulo | Personalidad | Función principal |
|--------|--------|-------------|-------------------|
| **ARI** | Ventas | Persuasiva y enfocada | Capturar leads, crear cotizaciones, notificar vendedores |
| **NIRA** | Compras | Analítica y metódica | Alertar reabastecimiento, evaluar proveedores |
| **KIRA** | Inventario | Estructurada y meticulosa | Consultar stock, registrar movimientos, alertar críticos |
| **Agenda** | Agendamiento | Amable y eficiente | Consultar disponibilidad, crear citas, confirmar |

Cada agente tiene su propio **system prompt** que define su personalidad, su contexto dentro del tenant, y sus reglas de comportamiento.

---

## El AgentRunner

El `AgentRunner` es el servicio central que orquesta el bucle de tool use. Vive en `apps/api/src/modules/agents/agent.runner.ts`.

### Cómo funciona (bucle tool use)

```
AgentRunner.run(input)
    ↓
1. Carga el system prompt del módulo con el contexto del tenant
2. Llama a Claude API con: system prompt + mensaje del usuario + catálogo de tools
    ↓
3. Claude responde con una de dos cosas:
   a) stop_reason: "end_turn"  → Claude terminó, tiene respuesta final → FIN
   b) stop_reason: "tool_use"  → Claude quiere ejecutar una tool
    ↓
4. Si tool_use:
   a) AgentRunner ejecuta la tool contra la DB real
   b) Guarda en agentLog: tool usada, input, output, timestamp
   c) Devuelve el resultado a Claude
   d) Vuelve al paso 2
    ↓
5. El bucle tiene un límite de MAX_TURNS = 10
   Si se alcanza sin respuesta final → responder con fallback al humano
    ↓
6. Guardar todo el log en la tabla agent_logs
7. Devolver respuesta final al canal de origen
```

### Límite de turnos (MAX_TURNS)

El límite de 10 turnos existe para dos razones:
1. **Costo:** Cada turno es una llamada a Claude API (costo por token)
2. **Seguridad:** Un bucle infinito podría generar miles de registros en la DB

Si se alcanzan los 10 turnos sin respuesta final, el agente debe responder: *"No pude completar esta solicitud automáticamente. Un asesor te contactará pronto."* y crear una notificación interna urgente.

---

## Definición de una Tool

Una tool es una función de TypeScript que el agente puede llamar. Se define con tres partes:

**1. Descripción para Claude** (JSON Schema que Claude lee)
```typescript
{
  name: "consultar_stock",
  description: "Consulta el stock actual de un producto en una o todas las sucursales del tenant",
  input_schema: {
    type: "object",
    properties: {
      productId: { type: "string", description: "ID del producto a consultar" },
      branchId:  { type: "string", description: "ID de la sucursal. Si no se provee, devuelve todas." }
    },
    required: ["productId"]
  }
}
```

**2. Implementación real** (TypeScript que ejecuta la query)
```typescript
async function consultar_stock({ productId, branchId }: { productId: string, branchId?: string }, tenantId: string) {
  const where = branchId
    ? { productId, branchId, product: { tenantId } }
    : { productId, product: { tenantId } }

  const stocks = await prisma.stock.findMany({
    where,
    include: { branch: { select: { name: true } } }
  })

  return stocks.map(s => ({
    branchName: s.branch.name,
    quantity: s.quantity
  }))
}
```

**3. Registro** (en el catálogo de tools del módulo)
```typescript
export const KIRA_TOOLS = [
  consultar_stock,
  registrar_entrada,
  registrar_salida,
  alertar_equipo,
  crear_solicitud_compra
]
```

---

## Catálogo de tools por módulo (V1)

### ARI — Tools de ventas

| Tool | Parámetros | Qué hace |
|------|-----------|---------|
| `buscar_cliente` | `phone` o `email` | Busca si existe un cliente en el CRM del tenant |
| `crear_lead` | `name, phone, source, intent, branchId` | Crea cliente + deal en etapa inicial |
| `mover_etapa_deal` | `dealId, stageId` | Avanza el deal en el pipeline |
| `crear_cotizacion` | `clientId, items[]` | Genera cotización con productos del catálogo |
| `notificar_vendedor` | `message, branchId` | Crea notificación in-app para el equipo de ventas |
| `consultar_stock_producto` | `productName o productId` | Verifica disponibilidad antes de cotizar |

### NIRA — Tools de compras

| Tool | Parámetros | Qué hace |
|------|-----------|---------|
| `listar_proveedores` | `productId?` | Lista proveedores, opcionalmente filtrados por producto |
| `comparar_cotizaciones` | `productId` | Devuelve historial de precios por proveedor |
| `crear_borrador_oc` | `supplierId, items[], branchId` | Crea borrador de OC pendiente de aprobación |
| `consultar_presupuesto` | `branchId?` | Verifica presupuesto disponible del mes |
| `notificar_jefe_compras` | `message` | Notificación in-app urgente al AREA_MANAGER de NIRA |

### KIRA — Tools de inventario

| Tool | Parámetros | Qué hace |
|------|-----------|---------|
| `consultar_stock` | `productId, branchId?` | Stock actual por sucursal |
| `listar_alertas_activas` | — | Productos bajo el mínimo ahora mismo |
| `registrar_entrada` | `productId, branchId, quantity, notes` | Entrada manual de stock |
| `registrar_salida` | `productId, branchId, quantity, notes` | Salida manual de stock |
| `crear_solicitud_compra` | `productId, quantity` | Crea alerta en NIRA para reabastecimiento |
| `notificar_equipo` | `message, module` | Notificación in-app al equipo |

### AGENDA — Tools de agendamiento

| Tool | Parámetros | Qué hace |
|------|-----------|---------|
| `ver_horarios_disponibles` | `branchId, date, serviceTypeId?` | Lista slots disponibles para el día |
| `crear_cita` | `branchId, clientName, phone, startAt, serviceTypeId?` | Crea la cita y envía confirmación |
| `cancelar_cita` | `appointmentId, reason?` | Cancela cita y notifica al cliente |
| `reagendar_cita` | `appointmentId, newStartAt` | Cambia la fecha/hora de una cita |
| `buscar_cita_cliente` | `phone` | Busca citas activas de un número de teléfono |

---

## AgentLog — Estructura obligatoria

Cada vez que el AgentRunner termina de procesar un mensaje, **debe** guardar un registro en la tabla `agent_logs`. Sin excepción.

```typescript
await prisma.agentLog.create({
  data: {
    tenantId: input.tenantId,
    module: input.module.toUpperCase(),
    channel: input.channel,
    inputMessage: input.message,
    reply: result.reply,
    toolsUsed: result.toolsUsed,           // ["buscar_cliente", "crear_lead"]
    toolDetails: result.logs,              // Array con input/output de cada tool
    turnCount: turnCount,
    durationMs: Date.now() - startTime
  }
})
```

**Por qué es obligatorio:**
- **Auditoría:** Si un cliente reclama que el sistema creó algo incorrecto, el log permite reconstruir exactamente qué pasó
- **Mejora continua:** Los logs de V1 son el dataset de entrenamiento para fine-tuning en V2
- **Debugging:** Si el agente se comporta mal, el log muestra exactamente en qué tool falló y por qué

---

## System Prompts — Estructura

El system prompt de cada agente tiene 4 secciones:

```
1. ROL Y PERSONALIDAD
   "Eres ARI, el agente comercial de [Nombre del tenant]. Eres persuasiva y enfocada..."

2. CONTEXTO DEL NEGOCIO (se inyecta dinámicamente)
   "La empresa tiene X sucursales: [lista]. Los módulos activos son: [lista]."

3. REGLAS DE COMPORTAMIENTO
   - Siempre verifica si el cliente existe antes de crear uno nuevo
   - Si no puedes completar una tarea, crea una notificación para el equipo
   - Responde siempre en el mismo idioma que el cliente
   - Nunca inventes información (precios, stock, disponibilidad) — siempre consulta

4. LÍMITES
   - No compartas información de otros clientes
   - No tomes decisiones financieras por encima de X monto sin aprobación humana
   - Si el cliente está molesto, escala inmediatamente a un humano
```

El contexto del negocio se inyecta en cada llamada con datos reales del tenant (nombre de la empresa, sucursales, nombre del módulo). Esto es lo que hace que el agente "conozca" a la empresa.

---

## Manejo de errores

El AgentRunner debe manejar estos casos sin caerse:

| Situación | Comportamiento esperado |
|-----------|------------------------|
| Claude API no responde | Reintentar 3 veces con backoff exponencial. Si falla, responder con fallback al humano |
| Una tool lanza un error | Capturar el error, incluirlo en el tool_result como error, dejar que Claude decida cómo proceder |
| Se alcanzan MAX_TURNS | Responder con fallback, crear notificación urgente interna |
| Tool intenta escribir stock negativo | La tool debe rechazarlo con un error claro — nunca el agente debe dejar qty < 0 |
| Tenant sin feature flag activo | El AgentRunner no debe procesar mensajes de módulos desactivados |

---

## Reglas que nunca se rompen

1. **El AgentLog siempre se guarda, aunque el agente falle.** Si el agente falla en el intento 3, guardar los 3 intentos.

2. **Las tools son las únicas puertas de entrada a la DB desde el agente.** Claude nunca ejecuta queries directamente — siempre a través de una tool controlada.

3. **Cada tool valida el `tenantId` antes de escribir.** Una tool no puede escribir datos en un tenant diferente al del input.

4. **Stock nunca puede quedar en negativo.** La tool de salida de stock debe verificar antes de ejecutar.

5. **El agente siempre responde al canal de origen.** Si llegó por WhatsApp, responde por WhatsApp. Nunca silencio.
