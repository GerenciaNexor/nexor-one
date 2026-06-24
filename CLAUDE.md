# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Documentación extensa en español en los `README_*.md` de la raíz. Empieza por
> [README_ARCHITECTURE.md](./README_ARCHITECTURE.md) y [README_DEVELOPMENT.md](./README_DEVELOPMENT.md).

## Qué es NEXOR

SaaS multi-tenant de gestión empresarial con IA agéntica. Monorepo Turborepo + pnpm:
backend Fastify (`apps/api`, Railway) + frontend Next.js 14 App Router (`apps/web`, Vercel),
PostgreSQL + Redis, agentes Claude (Anthropic) que operan en WhatsApp y Gmail.

Módulos de negocio: **ARI** (CRM/ventas), **NIRA** (compras), **KIRA** (inventario),
**AGENDA** (citas), **VERA** (finanzas).

## Comandos

Desde la raíz (Turborepo orquesta todos los paquetes):

```bash
pnpm dev          # API (:3001) + web (:3000) con hot-reload
pnpm build
pnpm lint
pnpm type-check
pnpm test:e2e     # Playwright (paquete @nexor/e2e)
pnpm test:load    # k6 (paquete @nexor/load-tests)
```

Por paquete con `--filter`:

```bash
pnpm --filter @nexor/api dev
pnpm --filter @nexor/api test                    # vitest (unit)
pnpm --filter @nexor/api test src/lib/encryption.test.ts   # un solo archivo
pnpm --filter @nexor/api test:watch
pnpm --filter @nexor/web dev
```

### Base de datos (apps/api, Prisma)

```bash
pnpm --filter @nexor/api db:setup     # migrate dev + setup-rls + seed (primer arranque)
pnpm --filter @nexor/api db:migrate   # prisma migrate dev
pnpm --filter @nexor/api db:rls       # re-aplicar RLS — OBLIGATORIO tras cualquier restore
pnpm --filter @nexor/api db:reset     # reset + RLS + seed
pnpm --filter @nexor/api db:studio
```

`prisma migrate` y los seeds **no** disparan RLS automáticamente: `setup-rls.ts` debe correrse
aparte. Tras restaurar un backup en Railway, RLS no se preserva — re-aplícalo siempre.

`setup-rls.ts` cubre **26 tablas de negocio** (incluye bandeja, carga masiva y chat —
`conversations`, `conversation_messages`, `bulk_upload_logs` desde HU-114; `chat_messages` desde
HU-117; `supplier_ratings` desde HU-125; `client_ratings` desde HU-126; `dashboard_daily_rollups`
desde HU-127). `db:rls` es la **fuente única de verdad** del RLS: re-aplica todas las políticas
tras un restore.

### E2E (un proyecto/archivo concreto)

```bash
pnpm --filter @nexor/api db:seed-e2e
pnpm --filter @nexor/e2e exec playwright test --project=security
pnpm --filter @nexor/e2e exec playwright test tests/kira.spec.ts
```

## Multi-tenancy — la regla crítica del proyecto

Una sola base de datos compartida, aislada por `tenant_id` vía **Row-Level Security** de PostgreSQL.

- El `tenant_id` **siempre** sale del JWT (`{ userId, tenantId, branchId, role, module }`),
  nunca del body del request.
- **Contexto por-request (HU-122):** cada handler protegido corre dentro de una **transacción
  interactiva** que hace `SET LOCAL app.current_tenant_id` al inicio; el cliente transaccional se
  expone vía **AsyncLocalStorage**, así contexto y queries comparten la **misma conexión** y RLS
  filtra de forma confiable incluso bajo concurrencia. El wrapper está en el scope `/v1` de
  [apps/api/src/app.ts](apps/api/src/app.ts) (`onRoute` → `runInTenantTransaction`); el
  `tenantHook` ([apps/api/src/plugins/tenant.ts](apps/api/src/plugins/tenant.ts)) ya **no** usa
  `set_config(..., false)` de sesión (era inseguro sobre el pool).
- **Dos clientes Prisma** en [apps/api/src/lib/prisma.ts](apps/api/src/lib/prisma.ts):
  - `prisma` — proxy consciente del request: dentro de una request enruta cada query por la
    transacción del tenant (RLS); fuera de request usa el cliente base. Úsalo en módulos/servicios.
  - `directPrisma` — conecta como superuser (`DIRECT_DATABASE_URL`) y **bypasea RLS**. Solo en auth
    (login/refresh/logout), webhooks/worker, guards de feature-flag y scripts de seed/migración,
    siempre con filtro `tenantId` explícito.
  - `withTenantContext(tenantId, fn)` — transacción con `SET LOCAL` para escrituras/lecturas
    **fuera de una request** (worker/agente, seeds). Mismo mecanismo, un solo patrón.
  - Rutas con I/O externo o transacción propia (p. ej. `dashboard/kpis`, `ocr`) optan por salir del
    wrapper con `config: { tenantTx: false }`.

## Arquitectura del backend

Cada módulo en [apps/api/src/modules/](apps/api/src/modules/) sigue 3 capas:
`routes.ts` (valida con Zod, delega) → `service.ts` (lógica de negocio) → Prisma.
**La lógica de negocio va en el service, nunca en las routes.** El `index.ts` de cada módulo
exporta el plugin Fastify que registra sus rutas. Los módulos ARI/NIRA/KIRA/etc. se subdividen
en subdirectorios por área (p. ej. `ari/clients`, `ari/pipeline`, `ari/quotes`).

Además de los módulos de negocio (ARI/NIRA/KIRA/AGENDA/VERA) y `agents`, existen módulos de soporte:
`inbox` (bandeja unificada WhatsApp/Gmail), `ocr` (extracción de documentos),
`bulk-upload` (carga masiva Excel) y `chat` (asistente interno del dashboard).

Autorización: combina `requireRole` + `requireModule` (ver [apps/api/src/lib/guards.ts](apps/api/src/lib/guards.ts)),
normalmente vía `requireRoleAndModule('AREA_MANAGER', 'NIRA')` en el `preHandler` de la ruta.

### Motor de agentes IA (lo más delicado — toca datos reales)

[apps/api/src/modules/agents/agent.runner.ts](apps/api/src/modules/agents/agent.runner.ts) orquesta
el bucle de tool use de Claude. Catálogos de tools por módulo en
[apps/api/src/modules/agents/tools/](apps/api/src/modules/agents/tools/). Flujo:

```
Webhook WhatsApp/Gmail → responde 200 YA → encola en BullMQ → worker → AgentRunner
  (bucle: Claude pide tool → se ejecuta contra la DB → resultado → repite, máx 10 turnos)
  → AgentLog (auditoría obligatoria) → respuesta al canal + notificación in-app
```

- El webhook **siempre responde 200 inmediatamente**; el trabajo va al worker
  ([apps/api/src/lib/worker.ts](apps/api/src/lib/worker.ts), cola `incoming-messages`).
- BullMQ necesita una conexión Redis **separada** de la Queue.
- Toda acción del agente que modifique datos **debe** quedar en `agent_logs`.

Jobs programados (schedulers BullMQ) en [apps/api/src/jobs/](apps/api/src/jobs/), arrancados desde
[apps/api/src/app.ts](apps/api/src/app.ts).

## Arquitectura del frontend (apps/web)

Next.js 14 App Router. Rutas agrupadas en [apps/web/src/app/](apps/web/src/app/):
`(auth)` (login público) y `(dashboard)` (todo lo autenticado).

- **Cliente HTTP**: [apps/web/src/lib/api-client.ts](apps/web/src/lib/api-client.ts) — `apiClient.get/post/put/delete`.
  Inyecta el `Bearer` token desde el store y, ante un `401`, limpia la sesión y redirige a `/login`.
  Toda llamada al backend pasa por aquí; no uses `fetch` suelto.
- **Estado global**: Zustand en [apps/web/src/store/](apps/web/src/store/) (`auth`, `chat`).
  `auth` persiste en `localStorage` (`nexor-auth`); usa `_hasHydrated` para no renderizar antes de
  leer el token (evita parpadeos/SSR mismatch en Next.js).
- `API_URL` sale de `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`).

## Reglas que no se rompen (del README)

1. `tenant_id` siempre del JWT, nunca del body.
2. `agent_logs` y `stock_movements` son **inmutables** (append-only) — no se editan ni eliminan.
   Todo `stock_movement` registra **quién** (`user_id`), **cómo** (`type`) y **por qué** (`reason`,
   obligatorio) — HU-128. El stock **nunca queda negativo** (toda salida valida disponibilidad; la
   venta se bloquea si falta stock). En ventas se congelan `sale_price_frozen`/`cost_price_frozen`.
3. Tokens de integración (WhatsApp, Gmail) siempre cifrados — nunca en responses de la API
   (cifrado en [apps/api/src/lib/encryption.ts](apps/api/src/lib/encryption.ts); `ENCRYPTION_KEY`
   se valida al arrancar y el server hace `process.exit(1)` si falta).
4. El webhook responde 200 al instante; la lógica va en el worker.
5. Cambios que rompen la API van en `/v2/` — `/v1/` no se toca.

## Tipos compartidos

Lo que usan frontend y backend va en `packages/shared/src/types` (`@nexor/shared`).
Nunca duplicar un tipo entre `apps/api` y `apps/web`.
