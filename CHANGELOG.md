# Changelog

Todos los cambios notables de NEXOR V1 están documentados aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Las versiones corresponden a los sprints de desarrollo del producto.

---

## [Sprint 11] — 2026-04 · Feature flags, Super Admin y optimizaciones de rendimiento

### Added
- **Enforcement de feature flags en API** (HU-094): `requireFeatureFlag(module)` en `lib/guards.ts` aplicado como `addHook('preHandler', ...)` en cada módulo (ARI, NIRA, KIRA, AGENDA, VERA). Devuelve `403 MODULE_DISABLED` si el módulo no está activo para el tenant, independientemente del rol del usuario.
- **Feature flag check en AgentRunner** (HU-094): el agente IA verifica que el módulo esté habilitado antes de ejecutar cualquier tool. Si está deshabilitado, devuelve mensaje de error y registra el intento en `agent_logs` con `tool: '__module_disabled__'`.
- **Endpoint `PUT /v1/admin/tenants/:id/feature-flags/:module`** (HU-094): el SUPER_ADMIN puede activar o desactivar cualquier módulo de cualquier tenant desde el panel de administración.
- **Endpoint `GET /v1/admin/impersonations`** (HU-094): historial paginado de todas las impersonaciones realizadas. Filtra `agent_logs` por `channel='admin'` y `toolsUsed contains 'impersonate'`. Acepta `?tenantId=` para filtrar por empresa.
- **`expiresAt` en audit log de impersonaciones** (HU-094): el campo `toolDetails` de cada impersonación ahora incluye `expiresAt` (timestamp ISO del momento de expiración del token, 1h después de la emisión) además del `timestamp` de creación ya existente.
- **Índices de rendimiento para KIRA** (HU-093): `products(tenant_id, is_active)` — cubre todas las queries de inventario; `appointments(tenant_id, start_at)` — cubre `agendaKpis` groupBy sin `branch_id`. Migración: `20260422000000_perf_indexes`.
- **kiraKpis sin N+1** (HU-093): reemplazadas las queries `findMany` con nested relations por dos agregados `$queryRaw` (GROUP BY HAVING para `productos_stock_critico`, SUM::float8 para `valor_inventario_total`). Todo el cálculo aritmético ocurre en PostgreSQL.
- **Auditoría de seguridad multi-tenant** (HU-091): `SECURITY_AUDIT.md` con 11 vectores analizados — SEC-001 (usuarios desactivados con JWT activo) corregido en `tenantHook` con `directPrisma.user.findUnique` previo al `set_config`.
- **Load testing con k6** (HU-092): `packages/load-tests/` con 75 VUs, 15 tenants, seed de staging, métricas por endpoint y reporte HTML.

### Fixed
- **SEC-001**: usuarios desactivados mantenían acceso hasta expiración del JWT (7 días). Corregido agregando verificación `user.isActive` en `tenantHook` usando `directPrisma` antes del `set_config` de RLS.

### Verified — HU-094

| Criterio | Estado | Detalle |
|----------|--------|---------|
| Módulo KIRA habilitado → endpoints accesibles | ✅ | `requireFeatureFlag('KIRA')` retorna 200 cuando `enabled=true` |
| Módulo KIRA deshabilitado → `403 MODULE_DISABLED` | ✅ | Todos los endpoints bajo `/v1/kira` devuelven 403 |
| Mismo comportamiento para NIRA, ARI, AGENDA, VERA | ✅ | `addHook` aplicado en los 5 módulos |
| Dashboard solo muestra tarjetas de módulos activos | ✅ | `GET /v1/dashboard/kpis` filtra por `featureFlag.enabled=true` desde el inicio |
| Agente IA no ejecuta tools de módulos desactivados | ✅ | Check en `runAgent()` antes del bucle tool-use; log registrado |
| Token de impersonación expira en 1 hora | ✅ | `app.jwt.sign(..., { expiresIn: '1h' })` en `POST /v1/admin/tenants/:id/impersonate` |
| Impersonación registrada con timestamp inicio + expiración | ✅ | `toolDetails.timestamp` (inicio) + `toolDetails.expiresAt` (T+1h) en `agent_logs` |
| Token expirado rechazado | ✅ | JWT estándar — verificación en `tenantHook` → `401 UNAUTHORIZED` |
| SUPER_ADMIN puede listar impersonaciones | ✅ | `GET /v1/admin/impersonations` con paginación y filtro por tenant |
| Audit log inmutable | ✅ | `agent_logs` es APPEND-ONLY — no existe endpoint de eliminación ni modificación |

---

## [Sprint 10] — 2026-04 · CI/CD, Tests E2E y documentación OpenAPI

### Added
- **Workflow E2E en GitHub Actions** (`.github/workflows/e2e.yml`): corre en cada PR a `main`; levanta PostgreSQL 16 y Redis 7 como Docker services, ejecuta migraciones y seeds, compila API y frontend, ejecuta la suite completa de Playwright y sube reporte HTML + capturas de fallos como artefactos.
- **Suite de tests E2E con Playwright** (`packages/e2e/`): 7 archivos de tests cubriendo autenticación y protección de rutas, flujo de inventario KIRA, flujo de órdenes de compra NIRA, flujo de deals ARI, aislamiento multi-tenant, seguridad (HU-086 — 35 casos de prueba sobre aislamiento de datos), y verificación de documentación OpenAPI (HU-087).
- **Seed E2E** (`prisma/seed-e2e.ts`): crea un segundo tenant (`admin@empresa-b.nexor.co`) para pruebas de aislamiento multi-tenant y un usuario `SUPER_ADMIN` para los tests de seguridad. Idempotente.
- **Documentación OpenAPI** (`plugins/swagger.ts` + `lib/openapi.ts`): spec OpenAPI 3.0 generado automáticamente en `GET /documentation`; Swagger UI interactivo en `GET /documentation/ui`. Solo activo fuera de producción. Todos los endpoints documentados con `summary`, `tags`, `security` y schemas de request/response.
- **Módulo Dashboard** (`modules/dashboard/`): endpoint `GET /v1/dashboard/kpis` que agrega KPIs de todos los módulos activos en paralelo (`Promise.allSettled`, timeout 800 ms por módulo). Nunca devuelve 500 aunque todos los módulos fallen.
- **Backup semanal automatizado** (`.github/workflows/backup.yml`): ejecuta `pg_dump` contra producción cada domingo a las 02:00 UTC, sube el `.dump` como artefacto con retención de 90 días y envía notificación de éxito/fallo por email vía Resend.
- **Componente Toast** (`web/src/components/ui/Toast.tsx`): notificaciones no bloqueantes para feedback de acciones en el frontend.

### Changed
- Todos los `routes.ts` del API actualizados con schemas OpenAPI completos (`z2j()`, `bearerAuth`, `stdErrors`).
- `setSchemaController` corregido a `() => () => () => true` (3 niveles) para deshabilitar AJV correctamente y permitir que Zod valide en cada handler sin interferencia.

---

## [Sprint 9] — 2026-03 · Dashboard ejecutivo, notificaciones y flujos cruzados

### Added
- **Dashboard ejecutivo**: KPIs en tiempo real por módulo (ventas, inventario, compras, agenda, finanzas). OPERATIVE y AREA_MANAGER solo ven los KPIs de su módulo asignado.
- **Módulo de notificaciones** (`/v1/notifications`): notificaciones in-app generadas por jobs, módulos de negocio y el AgentRunner. Badge de no leídas en el header del frontend.
- **Integraciones** (`/v1/integrations`): conexión y gestión de WhatsApp Business (token cifrado AES-256) y Gmail (OAuth2). Job de salud que verifica tokens activos cada 7 días.
- **Flujos cruzados verificados** (HU-083):
  - OC recibida → stock actualizado en KIRA (transacción atómica)
  - Deal ganado → ingreso automático en VERA
  - OC aprobada → egreso automático en VERA
  - Cotización aceptada → ingreso automático en VERA
  - Stock crítico → notificación a KIRA y NIRA

### Changed
- Dashboard rediseñado: layout full-width, greeting personalizado, shortcuts por módulo.
- Módulo ARI: el agente registra interacciones en `agent_interactions` al cerrar un deal.

---

## [Sprint 8] — 2026-02 · Motor de agentes de IA (AgentRunner)

### Added
- **AgentRunner** (HU-049): bucle de tool use sobre Claude API. Interpreta mensajes de canales externos, ejecuta herramientas contra la BD real, guarda todo en `agent_logs` (inmutable). Máximo 10 turnos por conversación.
- **Chat interno** (`/v1/chat`): interfaz de chat directamente en el dashboard para que el equipo consulte al agente IA interno (ARI, NIRA, KIRA, AGENDA, VERA según módulo del usuario).
- **Webhooks unificados** (`/webhook/whatsapp`, `/webhook/gmail`): un solo endpoint para todos los tenants; la identidad del tenant se resuelve por `phone_number_id` o email del canal.
- **Worker BullMQ** (`lib/worker.ts`): procesa la cola `incoming-messages` con concurrencia 5.
- **Logs de agentes** (`/v1/agent-logs`): historial de sesiones del agente con tools usadas, inputs y outputs. Solo lectura.

---

## [Sprint 7] — 2026-01 · VERA — Finanzas

### Added
- **Módulo VERA** — Finanzas (`/v1/vera`):
  - Transacciones: ingresos y egresos manuales y automáticos (de ARI y NIRA). Solo las manuales son editables/eliminables.
  - Categorías de transacción: 5 categorías por defecto (Ventas, Servicios, Compras, Gastos operativos, Otros). Las `isDefault` son inmutables.
  - Centros de costo para análisis financiero por área o proyecto.
  - Presupuestos mensuales por sucursal con porcentaje ejecutado.
  - Reportes: resumen financiero, evolución mensual, desglose por categoría, exportación CSV.
- **Job `budget-alerts`**: alerta cuando el gasto mensual supera el 80% y el 100% del presupuesto.
- **Job `quote-expiry`**: vence cotizaciones expiradas y notifica por las próximas a vencer.

---

## [Sprint 6] — 2025-12 · AGENDA — Agendamiento de citas

### Added
- **Módulo AGENDA** — Agendamiento (`/v1/agenda`):
  - Tipos de servicio con duración, precio y profesionales asignados.
  - Disponibilidad por sucursal y profesional (bloques por día de semana).
  - Cálculo de slots libres en tiempo real (`GET /v1/agenda/slots`) — el agente lo usa para proponer horarios.
  - Fechas bloqueadas (feriados, vacaciones).
  - Citas con estados: `scheduled → confirmed → attended | no_show | cancelled`.
  - Cancelación sin login por link de email (token de un solo uso, 48 h).
- **Job `appointment-reminders`**: envía recordatorios automáticos 24 h antes de cada cita.

---

## [Sprint 5] — 2025-11 · ARI — CRM y pipeline de ventas

### Added
- **Módulo ARI** — Ventas (`/v1/ari`):
  - CRM: clientes con historial de interacciones, deals y cotizaciones.
  - Pipeline de ventas Kanban con etapas configurables por tenant.
  - Deals con valor, responsable, fecha de cierre estimada y notas.
  - Cotizaciones numeradas (COT-YYYY-NNN) con líneas de productos, descuentos y fecha de validez.
  - Al aceptar una cotización o cerrar un deal ganado: genera `transaction` de ingreso en VERA automáticamente.
  - Consulta de stock cross-branch antes de cotizar (integración con KIRA).
  - Interacciones con tipo, dirección (inbound/outbound) y canal.
  - Reportes de ventas: conversión por etapa, ventas por vendedor, valor del pipeline.
- **Job `overdue-deliveries`**: detecta OC de NIRA con fecha de entrega vencida y notifica.

---

## [Sprint 4] — 2025-10 · NIRA — Compras y proveedores

### Added
- **Módulo NIRA** — Compras (`/v1/nira`):
  - Proveedores con ficha técnica y score calculado diariamente (precio histórico + puntualidad + calidad).
  - Órdenes de compra con flujo `draft → submitted → approved → sent → partial → delivered`.
  - Solo el `AREA_MANAGER` de NIRA puede aprobar OC.
  - Al aprobar una OC: genera `transaction` de egreso en VERA automáticamente.
  - Al recibir mercancía: genera `stock_movement` de entrada en KIRA por cada ítem.
  - Comparador de cotizaciones por producto entre proveedores con historial de precios.
  - Creación de OC borrador desde alertas de stock crítico de KIRA.
  - Reportes: costos por proveedor, ranking de proveedores, gastos del período.
- **Job `supplier-scores`**: recalcula scores de todos los proveedores diariamente.

---

## [Sprint 3] — 2025-09 · KIRA — Inventario

### Added
- **Módulo KIRA** — Inventario (`/v1/kira`):
  - Catálogo de productos con SKU, nombre, unidad, stock mínimo, precio de costo y clasificación ABC.
  - Stock por sucursal con visibilidad cruzada (`GET /v1/kira/stock/cross-branch/:productId`).
  - Movimientos de inventario: entradas, salidas y ajustes. Inmutables (los errores se corrigen con ajustes).
  - Lotes con número de lote, fecha de caducidad y stock disponible.
  - Alertas de stock crítico en tiempo real y endpoint para forzar revisión manual.
  - Reportes: clasificación ABC, rotación por producto.
- **Job `stock-alerts`**: revisa stock crítico cada hora y genera notificaciones.
- **Job `abc-classification`**: recalcula clasificación ABC del inventario semanalmente (lunes).

---

## [Sprint 2] — 2025-08 · Infraestructura, RLS, backups y onboarding

### Added
- **Row-Level Security (RLS)** en PostgreSQL: 19 tablas de negocio con política que filtra por `app.current_tenant_id`. El `tenantHook` de Fastify inyecta el `tenant_id` del JWT en cada request.
- **Script de backup manual** (`scripts/db-backup.sh`): `pg_dump` en formato custom con verificación de integridad. Regla innegociable: backup obligatorio antes de cada migración a producción.
- **Script de restauración** (`scripts/db-restore.sh`): con confirmación explícita y re-aplicación de RLS post-restore.
- **Plantilla Excel de onboarding** (HU-019): para que el equipo de operaciones cargue el catálogo inicial de un nuevo cliente.
- **Script de onboarding desde Excel** (HU-020): importa productos, clientes, proveedores, usuarios y configura módulos desde la plantilla Excel.
- **Sentry**: captura de errores y monitoreo en API (Node.js) y frontend (Next.js/browser).
- **Seed inicial**: tenant demo `Farmacia Demo S.A.S.` con usuario `admin@demo.nexor.co` y pipeline de ventas básico.

### Changed
- CI/CD: workflow de deploy corregido para usar la integración nativa de Railway con GitHub (sin Railway CLI).

---

## [Sprint 1] — 2025-07 · Base del sistema y autenticación

### Added
- **Monorepo con Turborepo + pnpm workspaces**: `apps/api` (Fastify), `apps/web` (Next.js 14), `packages/shared` (tipos TypeScript compartidos).
- **Esquema de BD inicial** (Prisma): tablas `tenants`, `branches`, `users`, `feature_flags`, `pipeline_stages`, `refresh_tokens`.
- **Autenticación JWT**:
  - `POST /v1/auth/login` — emite JWT (7 d) + refresh token (30 d).
  - `POST /v1/auth/refresh` — rota el JWT sin re-login.
  - `POST /v1/auth/logout` — invalida el refresh token.
  - `GET /v1/auth/me` — perfil del usuario con feature flags activos.
- **Sistema de roles**: `SUPER_ADMIN`, `TENANT_ADMIN`, `BRANCH_ADMIN`, `AREA_MANAGER`, `OPERATIVE`. Guards en cada endpoint.
- **Panel Super Admin** (`/v1/admin`): listar tenants, activar/desactivar, impersonar para soporte (con audit log).
- **Feature flags por módulo**: cada tenant activa independientemente ARI, NIRA, KIRA, AGENDA y VERA.
- **Gestión de sucursales** (`/v1/branches`) y **usuarios** (`/v1/users`).
- **Rate limiting**: 100 req/min por tenant.
- **CI inicial** (GitHub Actions): `type-check`, `lint`, `build` en cada PR.
- **Despliegue inicial**: API en Railway, frontend en Vercel.
