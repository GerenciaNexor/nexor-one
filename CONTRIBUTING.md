# Guía de contribución — NEXOR

Gracias por contribuir a NEXOR. Esta guía resume cómo preparar el entorno, los comandos del día a
día, el flujo de ramas/PR y las reglas que no se rompen. Para entender la arquitectura antes de tocar
código, empieza por [README_ARCHITECTURE.md](./README_ARCHITECTURE.md) y, según el área,
[README_FRONTEND.md](./README_FRONTEND.md) o [README_MODULES.md](./README_MODULES.md).

---

## Requisitos

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (el repo fija `pnpm@10.30.0` vía `packageManager`)
- **PostgreSQL** y **Redis** accesibles (Docker Compose incluido, o un servicio gestionado)

---

## Puesta en marcha

```bash
# 1. Instalar dependencias (desde la raíz)
pnpm install

# 2. Configurar variables de entorno
cp .env.example .env        # rellena los valores reales (ver tabla en README_DEVELOPMENT.md)

# 3. Levantar la base de datos (opción Docker)
docker-compose up -d        # Postgres (:5433) + Redis (:6379)

# 4. Migrar + aplicar RLS + seed inicial
pnpm --filter @nexor/api db:setup

# 5. Arrancar todo en modo desarrollo
pnpm dev                    # API (:3001) + web (:3000)
```

> RLS **no** se aplica automáticamente al migrar ni al hacer seed: `setup-rls.ts` se corre aparte
> (incluido en `db:setup`). Tras restaurar un backup, re-aplica RLS con `pnpm --filter @nexor/api db:rls`.

Detalles de entorno, credenciales seed y scripts de base de datos en
[README_DEVELOPMENT.md](./README_DEVELOPMENT.md).

---

## Comandos frecuentes

Desde la raíz (Turborepo orquesta los paquetes):

```bash
pnpm dev          # API + web con hot-reload
pnpm build        # build de todos los paquetes
pnpm lint         # eslint en todos
pnpm type-check   # tsc --noEmit en todos
pnpm test:e2e     # Playwright (@nexor/e2e)
pnpm test:load    # k6 (@nexor/load-tests)
```

Por paquete con `--filter`:

```bash
pnpm --filter @nexor/api dev
pnpm --filter @nexor/api test                              # vitest (unit)
pnpm --filter @nexor/api test src/lib/encryption.test.ts   # un solo archivo
pnpm --filter @nexor/web dev
```

---

## Estructura del monorepo

```
apps/
  api/        Backend Fastify + Prisma (Railway)
  web/        Frontend Next.js 14 (Vercel)
packages/
  shared/     Tipos TypeScript compartidos (@nexor/shared)
  ui/         Componentes UI compartidos (disponible en V2 — PENDIENTE: confirmar estado)
  e2e/        Tests E2E con Playwright (@nexor/e2e)
  load-tests/ Pruebas de carga con k6 (@nexor/load-tests)
```

---

## Flujo de trabajo (ramas y PRs)

Modelo observado en el repositorio (rama principal `main`, integración en `develop`):

1. Crea una rama de trabajo desde `develop` con un prefijo descriptivo:
   `feature/...`, `fix/...`, `test/...`.
2. Haz commits pequeños y descriptivos. **No** trabajes directamente sobre `main`.
3. Antes de abrir el PR, deja el árbol limpio (ver checklist abajo).
4. Abre el PR hacia `develop`. La promoción a `main` se hace por PR desde `develop`.

> No hay una convención de mensajes de commit forzada por tooling. **Recomendado**: mensaje en
> imperativo y, si aplica, referencia a la HU/issue. (PENDIENTE: confirmar si se adopta Conventional Commits.)

### Antes de abrir un PR

```bash
pnpm lint
pnpm type-check
pnpm --filter @nexor/api test     # si tocaste el backend
pnpm test:e2e                     # si tocaste flujos de UI/críticos
```

---

## Reglas que no se rompen

Estas son invariantes del proyecto (ver [README_ARCHITECTURE.md](./README_ARCHITECTURE.md) y
[README.md](./README.md)):

1. **`tenant_id` siempre del JWT**, nunca del body del request.
2. **`agent_logs` y `stock_movements` son inmutables** — solo `INSERT`, jamás `UPDATE`/`DELETE`.
3. **Tokens de integración (WhatsApp/Gmail) siempre cifrados** (AES-256) — nunca en responses de la API.
4. **Los webhooks responden `200` al instante**; el trabajo real va al worker (BullMQ).
5. **Cambios que rompen la API van en `/v2/`** — `/v1/` no se toca.
6. **La lógica de negocio vive en `service.ts`**, no en `routes.ts` (las rutas validan con Zod y delegan).
7. El stock **nunca** queda negativo (validado en el dominio de KIRA).

---

## Convención de nombres de estados

Para evitar vocabularios divergentes entre código, BD, API y documentación (el problema que
resolvió HU-116 en las órdenes de compra), al modelar el `status` de cualquier entidad:

1. **Un único vocabulario por entidad**, documentado junto a su modelo en
   [README_DATABASE.md](./README_DATABASE.md), e idéntico en Prisma, Zod, servicios, endpoints y docs.
2. **`snake_case`, en inglés.** Usa el participio del verbo que produjo el estado
   (`submitted`, `approved`, `received`, `cancelled`) o un sustantivo de fase (`draft`, `partial`).
3. **Nombra el estado según la acción/endpoint que lo genera**: `.../submit` → `submitted`,
   `.../approve` → `approved`, `.../receive` → `received`. Evita sinónimos divergentes
   (`pending_approval` vs `submitted`, `delivered` vs `received`).
4. **Persistencia y validación**: se guarda como `VARCHAR` y se valida con un `z.enum(...)` en la
   capa de API. Documenta la **máquina de transiciones válidas** junto al modelo.
5. **Renombrar un estado expuesto** rompe el contrato `/v1`: aplica la regla de breaking changes
   (versiona en `/v2` o hazlo retrocompatible) e incluye **migración de datos** para los estados
   ya persistidos.

## Mapa de documentación

| Documento | Para qué |
|-----------|----------|
| [README.md](./README.md) | Índice maestro |
| [README_ARCHITECTURE.md](./README_ARCHITECTURE.md) | Decisiones y arquitectura del backend |
| [README_FRONTEND.md](./README_FRONTEND.md) | Arquitectura del frontend (apps/web) |
| [README_DATABASE.md](./README_DATABASE.md) | Modelos, tablas y RLS |
| [README_ENDPOINTS.md](./README_ENDPOINTS.md) | Catálogo de endpoints `/v1` |
| [README_MODULES.md](./README_MODULES.md) | Módulos de negocio y de soporte |
| [README_AGENTS.md](./README_AGENTS.md) | Motor de agentes IA y tools |
| [README_INTEGRATIONS.md](./README_INTEGRATIONS.md) | WhatsApp, Gmail, cifrado |
| [README_ROLES.md](./README_ROLES.md) | Roles y autorización |
| [README_DEVELOPMENT.md](./README_DEVELOPMENT.md) | Entorno, variables, scripts |
| [CLAUDE.md](./CLAUDE.md) | Guía rápida para Claude Code |
```
