# Bugs — Sprint 11 (QA interno)

> Documento de referencia histórica. Todos los bugs encontrados durante el proceso de QA del Sprint 11 (HU-091–HU-094) están registrados aquí con severidad, módulo afectado, pasos de reproducción y estado de corrección.

---

## Leyenda de severidad

| Nivel | Definición |
|-------|------------|
| **Crítico** | Compromete seguridad de datos o bloquea una funcionalidad core sin workaround |
| **Alto** | Afecta la experiencia del usuario significativamente; tiene workaround pero es necesario corregirlo en el sprint |
| **Medio** | Comportamiento incorrecto pero no bloquea flujos; puede ir al backlog |
| **Bajo** | Inconsistencia menor, mejora cosmética o deuda técnica |

---

## Bugs corregidos en Sprint 11

---

### BUG-001 — AgentRunner: RLS bloquea consulta de feature flag en contexto webhook

| Campo | Detalle |
|-------|---------|
| **Severidad** | Crítico |
| **Módulo** | Agentes IA / Webhooks |
| **HU que lo introdujo** | HU-094 (feature flag check en AgentRunner) |
| **Archivo** | `apps/api/src/modules/agents/agent.runner.ts` |

**Descripción:**
Al agregar el check de feature flag en `runAgent()` se usó `prisma` (cliente con RLS). El AgentRunner es invocado desde el handler de webhooks (WhatsApp/Gmail) que corre SIN `tenantHook`, por lo que `set_config('app.current_tenant_id', ...)` nunca se ejecuta antes de la query. La política RLS de `feature_flags` es:

```sql
USING (tenant_id::text = NULLIF(current_setting('app.current_tenant_id', TRUE), ''))
```

Sin el set_config previo, `current_setting(...)` retorna `''`, `NULLIF('', '')` retorna `NULL`, y la comparación `tenant_id = NULL` bloquea TODAS las filas. El resultado: `featureFlag` siempre es `null` → `!featureFlag?.enabled` siempre `true` → el agente devuelve "módulo desactivado" para TODAS las solicitudes de WhatsApp/Gmail.

**Pasos para reproducir:**
1. Enviar un mensaje de WhatsApp al número conectado con KIRA activo
2. El agente responde: "El módulo KIRA no está activo para este tenant"
3. El módulo SÍ está activo — es un falso positivo del RLS

**Corrección:**
Cambiar `prisma.featureFlag.findFirst` a `directPrisma.featureFlag.findFirst`. El cliente `directPrisma` usa `DIRECT_DATABASE_URL` (rol postgres superuser) que siempre bypasea RLS. La cláusula `WHERE tenantId = ?` mantiene el aislamiento a nivel de aplicación.

**Estado:** ✅ Corregido en HU-095

---

### BUG-002 — Toggle feature flag: módulo inválido causa 500 en lugar de 400

| Campo | Detalle |
|-------|---------|
| **Severidad** | Alto |
| **Módulo** | Panel Admin / Super Admin |
| **HU que lo introdujo** | HU-094 (endpoint PUT /v1/admin/tenants/:id/feature-flags/:module) |
| **Archivo** | `apps/api/src/modules/admin/routes.ts` |

**Descripción:**
El endpoint `PUT /v1/admin/tenants/:id/feature-flags/:module` documenta en el schema OpenAPI que `module` debe ser uno de `['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA']`, pero la validación AJV está deshabilitada en toda la API (usa Zod por ruta). Sin validación del path parameter, un valor inválido como `PUT /v1/admin/tenants/xyz/feature-flags/INEXISTENTE` llega a `toggleFeatureFlag` que lo pasa al `WHERE tenantId_module` de Prisma. Prisma no encuentra el registro y lanza un error sin `statusCode`, retornando HTTP 500.

**Pasos para reproducir:**
```
PUT /v1/admin/tenants/valid-id/feature-flags/MODULO_FALSO
Authorization: Bearer <super-admin-token>
Body: { "enabled": true }

→ HTTP 500 Internal Server Error
```

**Corrección:**
Agregar validación Zod explícita para el path parameter `module` antes de llamar al servicio:
```typescript
const paramsSchema = z.object({ module: z.enum(['ARI', 'NIRA', 'KIRA', 'AGENDA', 'VERA']) })
```
Retorna `400 VALIDATION_ERROR` para valores inválidos.

**Estado:** ✅ Corregido en HU-095

---

### BUG-003 — toggleFeatureFlag: P2025 no manejado → 500 cuando falta el registro

| Campo | Detalle |
|-------|---------|
| **Severidad** | Medio |
| **Módulo** | Panel Admin / Super Admin |
| **HU que lo introdujo** | HU-094 |
| **Archivo** | `apps/api/src/modules/admin/service.ts` |

**Descripción:**
Si el registro `feature_flag` para un módulo no existe en la base de datos (p.ej. un tenant creado manualmente sin pasar por el onboarding), `featureFlag.update(...)` lanza `PrismaClientKnownRequestError` con código `P2025` ("Record to update not found"). Este error no tiene `statusCode`, por lo que el handler retorna HTTP 500 en lugar de 404.

**Pasos para reproducir:**
1. Crear un tenant directamente en DB sin sus feature_flag records
2. Llamar `PUT /v1/admin/tenants/:id/feature-flags/KIRA` con `{ "enabled": true }`
3. → HTTP 500

**Corrección:**
Capturar el error `P2025` específicamente en `toggleFeatureFlag` y relanzarlo como `{ statusCode: 404, code: 'NOT_FOUND' }`.

**Estado:** ✅ Corregido en HU-095

---

## Bugs documentados — Backlog (Medio / Bajo)

---

### BUG-004 — AgentRunner: branches vacías en contexto webhook por RLS

| Campo | Detalle |
|-------|---------|
| **Severidad** | Medio |
| **Módulo** | Agentes IA / Webhooks |
| **HU de origen** | Pre-existente (anterior a Sprint 11) |
| **Archivo** | `apps/api/src/modules/agents/agent.runner.ts:201` |

**Descripción:**
`prisma.branch.findMany({ where: { tenantId } })` en `runAgent()` también corre sin contexto RLS (mismo problema que BUG-001). Devuelve array vacío → Claude no conoce las sucursales del tenant → el agente puede generar respuestas sin mencionar sucursales específicas. No bloquea el flujo pero reduce la calidad de las respuestas.

**Workaround:** El agente funciona sin contexto de sucursales; simplemente no las menciona.

**Corrección propuesta:** Usar `directPrisma` también para `tenant` y `branches` en `runAgent`, o mejor, crear un helper `getAgentTenantContext(tenantId)` que use `directPrisma` para todas las queries de contexto inicial.

**Sprint sugerido:** Sprint 12 — mejora de calidad del agente

---

### BUG-005 — SEC-001 fix: user.isActive check en tenantHook no distingue tokens de impersonación

| Campo | Detalle |
|-------|---------|
| **Severidad** | Bajo |
| **Módulo** | Auth / tenantHook |
| **HU de origen** | HU-091 (SEC-001 fix) |
| **Archivo** | `apps/api/src/plugins/tenant.ts:59` |

**Descripción:**
El token de impersonación contiene `userId: SUPER_ADMIN_id` y `tenantId: target_tenant_id`. En `tenantHook`, se verifica `directPrisma.user.findUnique({ where: { id: userId } })` donde `userId` es el del SUPER_ADMIN. El check pasa porque el SUPER_ADMIN siempre está activo. El propósito del check (detectar usuarios desactivados) no aplica aquí porque el SUPER_ADMIN no puede ser desactivado por definición.

Esto NO es un bug de seguridad: el token fue emitido correctamente por el endpoint de impersonación y el SUPER_ADMIN es activo. El comportamiento es correcto. Sin embargo, semánticamente el check verifica al "emisor" del token (SUPER_ADMIN) en lugar del "destinatario" (tenant objetivo).

**Impacto:** Ninguno en práctica; el flujo funciona correctamente.

**Mejora propuesta:** Incluir un campo `impersonation: true` en el JWT payload para distinguirlo explícitamente y skipear el check `isActive` del userId emisor. Agregar en el futuro si se requiere mayor claridad semántica.

**Sprint sugerido:** Backlog sin fecha — mejora no urgente

---

### BUG-006 — kiraKpis: $queryRaw corre en posible conexión sin contexto RLS

| Campo | Detalle |
|-------|---------|
| **Severidad** | Bajo |
| **Módulo** | Dashboard / KIRA |
| **HU de origen** | HU-093 |
| **Archivo** | `apps/api/src/modules/dashboard/service.ts` |

**Descripción:**
Las queries `$queryRaw` de `kiraKpis` usan `prisma` (sujeto a RLS) con filtro explícito `WHERE p.tenant_id = ${tenantId}`. Si por conexión-pool rara vez se obtiene una conexión sin `app.current_tenant_id` seteado, RLS bloquea las filas y los KPIs devuelven 0 en lugar del valor real. El timeout de 800ms del dashboard oculta el error (retorna `null` con campo `error`).

Esto es una manifestación del problema arquitectónico pre-existente de `set_config` a nivel de sesión vs. pooling de conexiones. En práctica, con pool pequeño y Node.js single-threaded, la misma conexión se reutiliza.

**Workaround:** Ninguno necesario en la mayoría de los casos; se manifiesta raramente.

**Corrección propuesta:** Refactorizar `kiraKpis` y todos los servicios del dashboard para usar `withTenantContext` en un bloque transaccional único, garantizando misma conexión para RLS y queries.

**Sprint sugerido:** Sprint 13 — hardening de arquitectura

---

## Resumen

| ID | Severidad | Estado | Descripción breve |
|----|-----------|--------|-------------------|
| BUG-001 | Crítico | ✅ Corregido | AgentRunner: RLS bloquea featureFlag → agente siempre "módulo desactivado" |
| BUG-002 | Alto | ✅ Corregido | Toggle flag: módulo inválido causa 500 en lugar de 400 |
| BUG-003 | Medio | ✅ Corregido | toggleFeatureFlag: P2025 no manejado → 500 en lugar de 404 |
| BUG-004 | Medio | 📋 Backlog | AgentRunner: branches vacías en contexto webhook por RLS |
| BUG-005 | Bajo | 📋 Backlog | tenantHook: check isActive verifica SUPER_ADMIN en tokens de impersonación |
| BUG-006 | Bajo | 📋 Backlog | kiraKpis: $queryRaw puede correr en conexión sin contexto RLS |

**Bugs críticos abiertos al cierre del Sprint 11:** 0  
**Bugs altos abiertos al cierre del Sprint 11:** 0
