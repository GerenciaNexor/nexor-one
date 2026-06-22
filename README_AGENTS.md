# README_AGENTS — Motor de Agentes IA en NEXOR V1

> Este documento explica cómo funciona el sistema de agentes de NEXOR, qué es el AgentRunner, cómo se definen las tools, y las reglas que nadie puede romper sin comprometer la integridad del sistema.

---

## Concepto fundamental

NEXOR tiene **dos tipos de inteligencia**:

**IA Analítica** — El sistema ya tiene los datos, la IA los analiza y genera recomendaciones. Ejemplo: "Estos 3 proveedores son los más eficientes este mes."

**IA Agéntica** — El agente recibe un mensaje externo (WhatsApp, email), interpreta la intención, y **ejecuta acciones reales en la base de datos** sin intervención humana. Ejemplo: Un cliente escribe "quiero agendar el viernes" y el agente crea la cita, la guarda en la DB y envía la confirmación.

La IA agéntica es la que hace a NEXOR diferente. Es también la más crítica — un bug puede crear datos incorrectos en la empresa de un cliente real.

---

## Los agentes de NEXOR V1

| Agente | Módulo | Personalidad | Función principal |
|--------|--------|-------------|-------------------|
| **ARI** | Ventas | Persuasiva y enfocada | Capturar leads, crear cotizaciones, notificar vendedores |
| **NIRA** | Compras | Analítica y metódica | Alertar reabastecimiento, evaluar proveedores |
| **KIRA** | Inventario | Estructurada y meticulosa | Consultar stock, registrar movimientos, alertar críticos |
| **Agenda** | Agendamiento | Amable y eficiente | Consultar disponibilidad, crear citas, confirmar |
| **VERA** | Finanzas | Precisa y estratégica | Consultar transacciones y KPIs financieros (solo consulta) |

Cada agente tiene su propio **system prompt** que define su personalidad, su contexto dentro del tenant, y sus reglas de comportamiento.

Además de las tools propias de cada módulo, existe un grupo **EMPRESA** de tools compartidas
(consultar usuarios y sucursales del tenant) que están disponibles para todos los agentes.

### Modelo de Claude

El modelo por defecto es **configurable por env** (`CLAUDE_MODEL`). El default en código es
`claude-opus-4-6` (ver `apps/api/src/modules/agents/agent.runner.ts`), aunque el `.env.example`
sugiere `claude-opus-4-5`. PENDIENTE: confirmar/alinear el default exacto entre código y `.env.example`.

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
  registrar_movimiento,
  alertar_equipo,
  crear_solicitud_compra
]
```

---

## Catálogo de tools por módulo (V1)

### ARI — Tools de ventas

| Tool | Qué hace |
|------|---------|
| `buscar_cliente` | Busca si existe un cliente en el CRM del tenant |
| `crear_lead` | Crea cliente + deal en etapa inicial |
| `consultar_clientes` | Lista/consulta clientes del CRM |
| `consultar_deals` | Consulta deals (oportunidades) del pipeline |
| `consultar_cotizaciones` | Consulta cotizaciones del tenant |
| `consultar_stock_producto` | Verifica disponibilidad de un producto antes de cotizar |
| `notificar_vendedor` | Crea notificación in-app para el equipo de ventas |
| `consultar_reporte_ventas` | Devuelve el reporte/resumen de ventas |

### NIRA — Tools de compras

| Tool | Qué hace |
|------|---------|
| `listar_proveedores` | Lista proveedores, opcionalmente filtrados por producto |
| `comparar_precios` | Historial de precios por proveedor. **Marca el proveedor preferido (`preferido=true`) y lo lista primero** (HU-123) |
| `crear_borrador_oc` | Crea borrador de OC pendiente de aprobación. `supplierId` es **opcional**: si se omite usa el **proveedor preferido** y deja constancia en las notas (HU-123) |
| `consultar_presupuesto` | Verifica presupuesto disponible del mes |
| `notificar_jefe_compras` | Notificación in-app urgente al AREA_MANAGER de NIRA |
| `consultar_ordenes_compra` | Consulta órdenes de compra del tenant |
| `consultar_ranking_proveedores` | Ranking por score Precio/Entrega/Calidad (0-10). Entrega y Calidad salen de las calificaciones al recibir la OC; Precio del histórico. Un eje sin datos devuelve `"sin datos"`, no 0 (HU-125) |
| `consultar_reporte_costos` | Devuelve el reporte/resumen de costos |

**Proveedor preferido (HU-123).** Cada producto puede tener un proveedor preferido y el tenant
uno **global** de respaldo. La resolución que aplican las tools es:

```
preferido del producto (products.preferred_supplier_id, si está activo)
  → preferido global del tenant (tenants.default_supplier_id, si está activo)
  → comportamiento actual (sin preferencia)
```

`comparar_precios` lo marca y lo ordena primero; `crear_borrador_oc` lo propone por defecto. El
`system prompt` de NIRA ([prompts.ts](./apps/api/src/modules/agents/prompts.ts)) indica al agente
recomendarlo primero —es una recomendación, no un bloqueo: puede proponer otro con justificación.
Se gestiona desde la UI (detalle de producto en KIRA y página de Proveedores en NIRA) o vía API
(`PUT /v1/kira/products/:id` con `preferredSupplierId`, y `GET/PUT /v1/nira/preferred-supplier`).

### KIRA — Tools de inventario

| Tool | Qué hace |
|------|---------|
| `consultar_stock` | Stock actual por sucursal |
| `listar_alertas_activas` | Productos bajo el mínimo ahora mismo |
| `registrar_movimiento` | Registra un movimiento de stock (entrada/salida/ajuste) |
| `alertar_equipo` | Notificación in-app al equipo |
| `crear_solicitud_compra` | Crea solicitud/alerta en NIRA para reabastecimiento |
| `consultar_movimientos` | Consulta el historial de movimientos de stock |
| `consultar_rotacion_productos` | Devuelve la rotación de productos |
| `consultar_lotes` | Consulta lotes (número de lote y caducidad) |
| `consultar_reporte_abc` | Devuelve el reporte de clasificación ABC |

### AGENDA — Tools de agendamiento

| Tool | Qué hace |
|------|---------|
| `ver_servicios` | Lista los tipos de servicio configurados |
| `ver_profesionales` | Lista los profesionales disponibles |
| `ver_horarios` | Lista los horarios/slots disponibles |
| `crear_cita` | Crea la cita y envía confirmación |
| `cancelar_cita` | Cancela cita y notifica al cliente |
| `consultar_citas` | Consulta citas del tenant |
| `consultar_disponibilidad_hoy` | Devuelve la disponibilidad del día actual |

### VERA — Tools de finanzas (solo consulta)

| Tool | Qué hace |
|------|---------|
| `consultar_transacciones` | Consulta transacciones (ingresos/egresos) del tenant |
| `consultar_kpis_financieros` | Devuelve los KPIs financieros |

### EMPRESA — Tools compartidas (disponibles en todos los módulos)

| Tool | Qué hace |
|------|---------|
| `consultar_usuarios` | Consulta los usuarios del tenant |
| `consultar_sucursales` | Consulta las sucursales del tenant |

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

> **Carga del contexto (HU-115 / BUG-004):** el AgentRunner corre desde el worker, **sin `tenantHook`**, así que `app.current_tenant_id` no está seteado. Por eso la carga de tenant + sucursales se centraliza en el helper `getAgentTenantContext(tenantId)` ([apps/api/src/modules/agents/tenant-context.ts](apps/api/src/modules/agents/tenant-context.ts)), que usa `withTenantContext` para que RLS no descarte las sucursales. Antes, consultar `branches` con el cliente `prisma` normal devolvía vacío y el agente omitía las sucursales.

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
