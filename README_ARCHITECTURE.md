# README_ARCHITECTURE — Arquitectura del Sistema NEXOR V1

> Este documento explica el **por qué** de cada decisión técnica, cómo fluye una request de punta a punta, y cómo están organizadas todas las piezas. Léelo antes de tocar cualquier archivo del proyecto.

---

## Visión general

NEXOR es un SaaS multi-tenant de gestión empresarial con IA agéntica. Significa que:

1. **Multi-tenant:** Muchas empresas comparten la misma aplicación y base de datos, perfectamente aisladas entre sí.
2. **IA agéntica:** Los agentes no solo analizan datos — escuchan canales externos (WhatsApp, email), interpretan la intención del mensaje y ejecutan acciones reales dentro del sistema sin intervención humana.
3. **SaaS:** Los clientes acceden vía web, no instalan nada. El equipo NEXOR opera la infraestructura.

---

## Stack tecnológico

| Capa | Tecnología | Por qué se eligió |
|------|-----------|-------------------|
| Frontend | Next.js 14 (App Router) | SSR, routing limpio por módulo, tipado compartido con backend |
| UI | Tailwind CSS + Shadcn/ui | Componentes que el equipo posee (no es una librería externa pesada) |
| Estado cliente | Zustand | Simple, sin boilerplate, suficiente para V1 |
| Backend | Fastify + TypeScript | 3x más rápido que Express, tipado nativo, ecosistema maduro |
| ORM | Prisma | Migraciones controladas, tipos auto-generados, RLS nativo |
| Base de datos | PostgreSQL | Row-Level Security para multi-tenancy, JSONB, robusto y maduro |
| Caché y jobs | Redis + BullMQ | Jobs en background confiables con reintentos automáticos |
| IA | Claude API (Anthropic) | Tool use nativo, contexto largo, agentes sin fine-tuning en V1 |
| Monorepo | Turborepo + pnpm | Build incremental, tipos compartidos entre frontend y backend |
| CI/CD | GitHub Actions | Integrado con el repositorio, sin costos adicionales |
| Infra V1 | Railway + Vercel | Despliegue simple, Postgres incluido, sin over-engineering |
| Emails | Resend | API moderna, plantillas, logs de entrega |
| Monitoreo | Sentry | Alertas de errores en tiempo real |

---

## Estructura del monorepo

```
nexor/                          ← Raíz del proyecto
│
├── apps/
│   ├── api/                    ← Backend Fastify (Node.js)
│   │   ├── src/
│   │   │   ├── app.ts          ← Entry point del servidor
│   │   │   ├── modules/        ← Un directorio por módulo de negocio
│   │   │   │   ├── auth/       ← routes, service, schema
│   │   │   │   ├── tenants/
│   │   │   │   ├── users/
│   │   │   │   ├── webhooks/   ← WhatsApp y Gmail
│   │   │   │   ├── agents/     ← AgentRunner y tools
│   │   │   │   ├── ari/
│   │   │   │   ├── nira/
│   │   │   │   ├── kira/
│   │   │   │   ├── agenda/
│   │   │   │   └── vera/
│   │   │   ├── plugins/        ← JWT, CORS, rate-limit, tenant middleware
│   │   │   └── jobs/           ← Workers de BullMQ
│   │   └── prisma/             ← Schema, migraciones y seed
│   │
│   └── web/                    ← Frontend Next.js
│       └── src/
│           ├── app/
│           │   ├── (auth)/     ← Rutas públicas (login)
│           │   └── (dashboard)/← Rutas protegidas por módulo
│           ├── components/     ← UI components
│           ├── hooks/          ← Custom hooks (useAuth, useTenant)
│           └── lib/            ← API client, utils
│
└── packages/
    ├── shared/                 ← Tipos TypeScript compartidos
    │   └── src/types/          ← AuthUser, Tenant, Branch, etc.
    └── ui/                     ← Componentes compartidos (V2)
```

**Regla de oro:** Los tipos que usa tanto el frontend como el backend van en `packages/shared`. Nunca duplicar un tipo.

---

## Patrón multi-tenancy

NEXOR usa **base de datos compartida con aislamiento por `tenant_id`**.

### Cómo funciona

1. Cada tabla de negocio tiene un campo `tenant_id` (FK a la tabla `tenants`).
2. PostgreSQL tiene **Row-Level Security (RLS)** activado en todas las tablas de negocio.
3. Antes de cada query, el middleware de Fastify inyecta el `tenant_id` del usuario autenticado en la sesión de PostgreSQL mediante `SET LOCAL app.current_tenant_id = 'xxx'`.
4. La política de RLS filtra automáticamente todas las queries por ese `tenant_id`.

### Por qué este patrón y no otros

| Patrón | Ventajas | Desventajas | Decisión |
|--------|----------|-------------|----------|
| DB por tenant | Aislamiento total | Costoso de operar, migraciones complejas | ❌ Descartado |
| Schema por tenant | Buen aislamiento | Caro con muchos tenants, migraciones lentas | ❌ Descartado |
| **tenant_id compartido + RLS** | **Económico, fácil de operar, buen aislamiento** | Requiere disciplina en el código | **✅ Elegido** |

### Flujo del JWT

```
Login exitoso
→ Backend genera JWT con payload: { userId, tenantId, branchId, role, module }
→ Frontend guarda el token en localStorage
→ En cada request: header Authorization: Bearer <token>
→ Middleware extrae tenantId del JWT
→ Inyecta tenantId en la sesión de Prisma
→ RLS filtra automáticamente
```

---

## Arquitectura de capas del backend

Cada módulo sigue la misma estructura de 3 capas:

```
Request HTTP
    ↓
routes.ts      ← Valida el schema del request con Zod, llama al service
    ↓
service.ts     ← Lógica de negocio, reglas, llama al repositorio
    ↓
Prisma         ← Query a PostgreSQL (con tenant_id automático por RLS)
    ↓
Response HTTP
```

**Regla:** La lógica de negocio va en el service, nunca en las routes. Las routes solo validan input y delegan.

---

## Motor de agentes de IA (AgentRunner)

Esta es la pieza más crítica y diferenciadora de NEXOR. Un error aquí puede tener consecuencias en datos reales de los clientes.

### Concepto

Claude API soporta **tool use**: puedes darle al modelo un catálogo de funciones (tools) que puede ejecutar, y el modelo decide cuándo y cuáles usar según el mensaje que recibe. El AgentRunner es el bucle que orquesta ese proceso.

### Flujo completo

```
Canal externo (WhatsApp/Gmail)
    ↓
Webhook Fastify (/webhook/whatsapp o /webhook/gmail)
    ↓
Identifica tenant por el número/email del canal (tabla integrations)
    ↓
Pone mensaje en cola BullMQ (responde 200 inmediatamente)
    ↓
Worker procesa el mensaje
    ↓
AgentRunner.run({ tenantId, module, channel, message })
    ↓
Bucle tool use:
  1. Llama Claude API con: system prompt + mensaje + catálogo de tools
  2. Claude responde: "quiero usar la tool X con estos parámetros"
  3. AgentRunner ejecuta la tool X contra la DB real
  4. Devuelve resultado a Claude
  5. Repite hasta que Claude da respuesta final o se alcanzan MAX_TURNS (10)
    ↓
AgentLog: guarda todo (tools usadas, inputs, outputs, duración)
    ↓
Respuesta enviada de vuelta al canal original
    ↓
Notificación in-app al equipo interno del tenant
```

### Por qué Claude API y no otro modelo

- Tool use nativo y robusto desde el primer día
- Contexto de 200k tokens (suficiente para pasar historial completo de un cliente)
- Español de alta calidad (crítico para Colombia y Latinoamérica)
- No requiere fine-tuning para V1 — funciona bien con system prompts

### AgentLog — Por qué es obligatorio

Toda acción del agente que modifique datos en la DB **debe** quedar registrada en `agent_logs` con:
- Qué tool usó y con qué parámetros
- Qué resultado obtuvo
- Cuántos turnos tardó
- El mensaje original y la respuesta final

Sin esto: no hay auditoría, no se pueden detectar comportamientos incorrectos, y no hay datos para mejorar el modelo en V2.

---

## Sistema de notificaciones in-app

Las notificaciones son generadas por tres fuentes:

1. **Jobs de BullMQ** — por ejemplo, el worker que revisa stock crítico cada hora
2. **Módulos de negocio** — cuando un deal cambia de etapa, cuando se aprueba una OC
3. **AgentRunner** — cuando el agente crea un lead, agenda una cita, etc.

Todas van a la tabla `notifications` en PostgreSQL. El frontend las consume cada vez que el usuario carga el dashboard y muestra un badge de no leídas.

**V2:** Esta arquitectura está diseñada para migrar a push notifications móviles sin cambiar la tabla ni la lógica — solo se agrega un canal de entrega adicional.

---

## Flujo de un mensaje WhatsApp entrante (ejemplo completo)

```
Cliente escribe por WhatsApp: "Quiero comprar 20 shampoo"
    ↓
Meta envía POST a https://api.nexor.app/webhook/whatsapp
    ↓
Fastify verifica firma HMAC del request
    ↓
Extrae phone_number_id del payload de Meta
    ↓
Busca en tabla integrations: SELECT * FROM integrations WHERE channel='WHATSAPP' AND identifier='phone_number_id'
    ↓
Identifica tenant_id: "Farmacia López" con tenantId "clxabc"
    ↓
Pone en cola BullMQ: { tenantId, module: 'ari', channel: 'whatsapp', message: 'Quiero comprar 20 shampoo', from: '+573001234567' }
    ↓
Responde 200 OK a Meta (en < 1 segundo, Meta requiere esto)
    ↓
Worker BullMQ procesa el mensaje:
    ↓
AgentRunner.run() con system prompt de ARI + tools del módulo ARI
    ↓
Claude decide: usar tool buscar_cliente(phone: '+573001234567')
    ↓
Tool ejecuta: SELECT * FROM clients WHERE tenant_id='clxabc' AND whatsapp_id='+573001234567'
    ↓
Resultado: cliente no encontrado
    ↓
Claude decide: usar tool crear_lead({ name: 'Desconocido', phone: '+573001234567', source: 'whatsapp', intent: 'compra 20 shampoo' })
    ↓
Tool ejecuta: INSERT INTO clients + INSERT INTO deals
    ↓
Claude decide: usar tool notificar_equipo({ message: 'Nuevo lead por WhatsApp: quiere comprar 20 shampoo' })
    ↓
Tool ejecuta: INSERT INTO notifications para todos los vendedores del tenant
    ↓
Claude genera respuesta final: "¡Hola! Recibí tu solicitud de 20 shampoo. Un asesor te contactará muy pronto. 😊"
    ↓
AgentRunner guarda todo en agent_logs
    ↓
Fastify envía la respuesta de vuelta a Meta → WhatsApp del cliente
```

---

## Webhook unificado — Un endpoint para todos los tenants

NEXOR tiene **un solo endpoint** para todos los mensajes de WhatsApp de todos los tenants (`/webhook/whatsapp`). Meta siempre envía al mismo lugar.

La clave para identificar a qué tenant pertenece cada mensaje es el campo `phone_number_id` que Meta incluye en cada notificación. Ese ID está guardado en la tabla `integrations` junto al `tenant_id` correspondiente.

**Por qué esto importa:** Si se cambiara el diseño y cada tenant tuviera su propio endpoint, habría que crear una URL por cliente en Meta, lo cual es imposible de operar a escala.

---

## Feature flags

Cada tenant tiene una fila por módulo en la tabla `feature_flags`. El frontend consulta estos flags al cargar el dashboard y solo muestra los módulos activos.

Esto permite:
- Activar módulos a medida que el cliente los contrata
- Desactivar un módulo sin borrar datos
- En V2: cobrar por módulo activo

---

## Jobs en background (BullMQ + Redis)

Los jobs permiten ejecutar tareas sin bloquear los requests HTTP.

| Job | Frecuencia | Propósito |
|-----|-----------|-----------|
| `stock-alerts` | Cada hora | Detectar productos bajo mínimo y crear notificaciones |
| `process-whatsapp-message` | Inmediato (cola) | Procesar mensajes entrantes de WhatsApp con el agente |
| `process-gmail-message` | Inmediato (cola) | Procesar emails entrantes con el agente |
| `supplier-scores` | Diariamente | Recalcular scores de todos los proveedores |
| `appointment-reminders` | Cada hora | Enviar recordatorios de citas próximas |
| `abc-classification` | Semanalmente | Recalcular clasificación ABC del inventario |

---

## Seguridad

| Mecanismo | Implementación |
|-----------|---------------|
| Autenticación | JWT firmado con HS256, expira en 7 días |
| Autorización | Middleware verifica rol contra la acción solicitada |
| Multi-tenancy | RLS en PostgreSQL + tenant_id en JWT |
| Tokens de integración | Cifrado AES-256 antes de guardar en DB |
| Rate limiting | 100 req/min por tenant (no por IP) |
| Webhook WhatsApp | Verificación de firma HMAC-SHA256 de Meta |
| Audit log | Toda acción del Super Admin y del agente queda registrada |
| Variables de entorno | Nunca en el código — solo en .env (gitignored) |

---

## Decisiones de diseño que NO se deben cambiar sin consenso del equipo

1. **El `tenant_id` siempre viene del JWT, nunca del body del request.** Si viene del body, un usuario podría suplantar otro tenant.

2. **El AgentLog es inmutable (append-only).** Nunca actualizar ni eliminar un registro de `agent_logs`.

3. **Los `stock_movements` son inmutables.** Para corregir un error, se crea un movimiento de ajuste, no se edita el original.

4. **Los tokens de integración siempre cifrados.** Nunca devolver `token_encrypted` en una response de la API.

5. **El webhook siempre responde 200 inmediatamente.** La lógica va en el worker, no en el webhook handler.
