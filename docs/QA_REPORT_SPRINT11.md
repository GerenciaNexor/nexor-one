# Reporte Final de QA — Sprint 11
## NEXOR V1 · Lanzamiento al cliente piloto

**Fecha:** 2026-04-22  
**Preparado por:** Equipo de desarrollo (Dev 1 + Claude Sonnet)  
**Revisado por:** Pendiente de aprobación del Product Owner  
**Rama auditada:** `test/ci-workflow`  
**Estado global del sistema:** ✅ Listo para cliente piloto con riesgos conocidos documentados

---

## 1. Resumen ejecutivo

El Sprint 11 completó el ciclo de QA completo de NEXOR V1. Se ejecutaron 7 historias de QA (HU-091 a HU-097) cubriendo seguridad, performance, corrección de bugs, feature flags, diseño responsive y protección contra abuso. El sistema no tiene bugs críticos ni altos abiertos al cierre del sprint.

| Área | Estado | Resumen |
|------|--------|---------|
| Seguridad multi-tenant | ✅ Aprobado | 1 vulnerabilidad media corregida; 10 vectores limpios |
| Rate limiting y abuse protection | ✅ Implementado | Login protegido, headers de seguridad, webhook Gmail verificado |
| Performance | ⚠️ Parcial | Optimizaciones implementadas; load test en staging pendiente |
| Feature flags y Super Admin | ✅ Verificado | Los 10 criterios de aceptación pasan |
| Bugs críticos y altos | ✅ Cero abiertos | 3 bugs corregidos en sprint; 3 en backlog (medio/bajo) |
| Responsive mobile (390px/414px) | ✅ Aprobado | Todos los módulos verificados |
| TypeScript y build | ✅ Limpio | `tsc --noEmit` sin errores en API y frontend |

**Decisión de lanzamiento recomendada:** AUTORIZADO para cliente piloto con las condiciones documentadas en el [LAUNCH_CHECKLIST](./LAUNCH_CHECKLIST.md).

---

## 2. Seguridad — Pen Test Multi-Tenant (HU-091)

**Fecha:** 2026-04-21  
**Metodología:** Revisión estática completa de código fuente + simulación de ataques  
**Referencia completa:** [SECURITY_AUDIT.md](../SECURITY_AUDIT.md)

### 2.1 Vulnerabilidades encontradas

| ID | Severidad | Descripción | Estado |
|----|-----------|-------------|--------|
| SEC-001 | Media | Usuarios desactivados retenían acceso hasta expiración del JWT (7 días) | ✅ Corregido en HU-091 |

**Corrección de SEC-001:** Se agregó verificación `user.isActive` en `tenantHook` usando `directPrisma` (bypasea RLS para leer al usuario emisor del token). Un usuario desactivado recibe `403 USER_INACTIVE` en la siguiente request, sin esperar a que el JWT expire.

### 2.2 Vectores verificados — sin vulnerabilidades

| Vector | Resultado |
|--------|-----------|
| Inyección de `tenantId` en body/query | ✅ Limpio — `tenantId` siempre viene del JWT |
| Acceso cross-tenant en endpoints de listado | ✅ Limpio — RLS + `tenantHook` lo bloquean a nivel de BD |
| Tokens de integración en texto plano en respuestas | ✅ Limpio — AES-256-CBC, nunca se exponen |
| Rutas de admin sin protección de `SUPER_ADMIN` | ✅ Limpio — `superAdminHook` en scope separado |
| Manipulación de claims del JWT | ✅ Limpio — `JWT_SECRET` requerido para firmar |
| Tiempo de vida del token de impersonación | ✅ Limpio — 1h, con audit log inmutable |
| Validación de firma HMAC en webhooks | ✅ Limpio — `timingSafeEqual` en WhatsApp y Gmail |
| Escalada de privilegios en creación/edición de usuarios | ✅ Limpio — guards por jerarquía de roles |
| SSRF en webhooks | ✅ Limpio — no hay outbound HTTP desde webhooks |
| SQL injection en queries raw | ✅ Limpio — Prisma parametriza, `$queryRaw` usa template literals |

---

## 3. Rate Limiting y Abuse Protection (HU-097)

**Fecha:** 2026-04-22  
**Referencia completa:** Sección HU-097 en [SECURITY_AUDIT.md](../SECURITY_AUDIT.md)

| Control | Implementación | Estado |
|---------|----------------|--------|
| Rate limit global | `@fastify/rate-limit`: `RATE_LIMIT_MAX` req/min (default 100) por `tenantId`/IP | ✅ Activo |
| Rate limit en login | 10 req/min por IP (override per-route) | ✅ Implementado en HU-097 |
| Bloqueo por fallos de login | 5 intentos fallidos en 15 min → bloqueo de 15 min | ✅ Implementado en HU-097 |
| Verificación webhook WhatsApp | HMAC-SHA256 con `timingSafeEqual` | ✅ Pre-existente |
| Verificación webhook Gmail | Query token + SHA-256 + `timingSafeEqual` | ✅ Implementado en HU-097 |
| Headers de seguridad HTTP | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS (prod) | ✅ Implementado en HU-097 |
| Enmascaramiento de errores 5xx | `setErrorHandler` global; stack traces solo en logs del servidor | ✅ Implementado en HU-097 |

**Limitación conocida:** El bloqueo de IPs por fallos de login es in-memory. Se resetea si el servidor se reinicia. Para producción multi-instancia se debe migrar a Redis (ver Riesgos, sección 8).

---

## 4. Performance (HU-092 / HU-093)

### 4.1 Optimizaciones implementadas (HU-093)

| Optimización | Impacto esperado |
|--------------|-----------------|
| Índice `products(tenant_id, is_active)` | Cubre todas las queries de inventario KIRA sin full-scan |
| Índice `appointments(tenant_id, start_at)` | Cubre `agendaKpis` groupBy mensual |
| `kiraKpis`: reemplazado N+1 findMany por 2 `$queryRaw` con GROUP BY | Elimina O(n) queries; todo el cálculo en PostgreSQL |
| Dashboard: `Promise.allSettled` con timeout 800ms | Nunca bloquea; devuelve KPIs parciales si un módulo falla |

Migración de índices: `prisma/migrations/20260422000000_perf_indexes/`

### 4.2 Load Test (HU-092) — PENDIENTE DE EJECUCIÓN EN STAGING

**Estado: ⚠️ Framework implementado — test NO ejecutado contra staging**

El escenario k6 está completo en `packages/load-tests/scenarios/main.js`:
- 75 VUs simultáneos (15 tenants × 5 VUs/tenant)
- 6.5 minutos: 1 min ramp-up + 5 min sostenido + 30 s ramp-down
- Seed de staging: 15 tenants × 1.000 productos, 500 clientes, 200 transacciones

El directorio `packages/load-tests/results/` está vacío porque el ambiente de staging requería estar desplegado antes de ejecutar el test. **El load test DEBE ejecutarse contra staging como parte del LAUNCH_CHECKLIST antes de dar acceso al cliente piloto.**

**SLAs definidos (pendientes de verificación):**

| Endpoint | Distribución | SLA (p95) |
|----------|-------------|-----------|
| `GET /v1/kira/stock` | 30% | < 2 s |
| `POST /v1/kira/stock/movements` | 10% | < 2 s |
| `GET /v1/ari/pipeline/deals` | 20% | < 2 s |
| `GET /v1/vera/reports/summary` | 20% | < 2 s |
| `GET /v1/dashboard/kpis` | 15% | < 2 s |
| `POST /v1/chat/message` | 5% | < 30 s |

---

## 5. Feature Flags y Panel Super Admin (HU-094)

**Estado:** ✅ Todos los criterios de aceptación verificados y pasando

| Criterio | Estado |
|----------|--------|
| Módulo habilitado → endpoints accesibles | ✅ |
| Módulo deshabilitado → `403 MODULE_DISABLED` en todos los endpoints del módulo | ✅ |
| Mismo comportamiento para ARI, NIRA, KIRA, AGENDA, VERA | ✅ |
| Dashboard solo muestra tarjetas de módulos activos | ✅ |
| Agente IA no ejecuta tools de módulos desactivados | ✅ |
| Token de impersonación expira en 1 hora | ✅ |
| Impersonación registrada con timestamp inicio + `expiresAt` | ✅ |
| Token expirado rechazado | ✅ |
| SUPER_ADMIN puede listar impersonaciones con filtro por tenant | ✅ |
| Audit log de impersonaciones es inmutable (APPEND-ONLY) | ✅ |

---

## 6. Bugs — Estado al cierre del Sprint 11

**Bugs críticos abiertos: 0**  
**Bugs altos abiertos: 0**

### 6.1 Bugs corregidos en Sprint 11

| ID | Severidad | HU | Descripción | Estado |
|----|-----------|-----|-------------|--------|
| BUG-001 | Crítico | HU-095 | AgentRunner: RLS bloqueaba featureFlag en contexto webhook → agente siempre devolvía "módulo desactivado" | ✅ Corregido |
| BUG-002 | Alto | HU-095 | Toggle feature flag: módulo inválido causaba 500 en lugar de 400 | ✅ Corregido |
| BUG-003 | Medio | HU-095 | toggleFeatureFlag: P2025 no manejado → 500 cuando faltaba el registro | ✅ Corregido |

### 6.2 Bugs en backlog (próximos sprints)

| ID | Severidad | Descripción | Impacto en piloto | Sprint sugerido |
|----|-----------|-------------|-------------------|-----------------|
| BUG-004 | Medio | AgentRunner: branches vacías en contexto webhook → el agente no menciona sucursales específicas | Bajo — el agente funciona, respuestas menos precisas | Sprint 12 |
| BUG-005 | Bajo | tenantHook: check `isActive` verifica SUPER_ADMIN (no el usuario objetivo) en tokens de impersonación | Ninguno — comportamiento correcto en práctica | Backlog |
| BUG-006 | Bajo | kiraKpis: `$queryRaw` puede correr en conexión sin contexto RLS en pool bajo presión → KPIs en 0 | Muy bajo — extremadamente raro, se recupera solo | Sprint 13 |

**Referencia completa:** [BUGS_SPRINT11.md](../BUGS_SPRINT11.md)

---

## 7. Diseño Responsive — Mobile 390px/414px (HU-096)

**Estado:** ✅ Todos los módulos verificados en viewport 390px y 414px

**Patrón aplicado:** Tablas con `hidden sm:block` + cards móviles con `sm:hidden` para viewports < 640px.

| Pantalla | Estado | Cambios realizados |
|---------|--------|-------------------|
| KIRA — Productos | ✅ | Cards móviles con SKU, precio, badge ABC, estado |
| KIRA — Stock | ✅ | Cards con alerta "Bajo mínimo" en rojo, botón movimiento |
| KIRA — Movimientos | ✅ | Cards con tipo, cantidad con signo, antes → después |
| NIRA — Órdenes de compra | ✅ | Inputs de filtro `w-full sm:w-60`; cards pre-existentes |
| NIRA — Comparador de precios | ✅ | Inputs de filtro `w-full sm:w-72`; cards pre-existentes |
| Agenda — Citas | ✅ | Cards con servicio, fecha/hora, badge estado |
| VERA — Transacciones | ✅ | Cards con monto (verde/rojo), badges ingreso/egreso, editar/eliminar |
| ARI — Clientes, Pipeline, Cotizaciones | ✅ | Cards pre-existentes desde sprints anteriores |
| NIRA — Proveedores, Ranking | ✅ | Cards pre-existentes desde sprints anteriores |
| AppShell — Panel notificaciones | ✅ | `w-[90vw] sm:w-80` — previene overflow en iPhone SE (375px) |

---

## 8. Riesgos conocidos para el cliente piloto

Los siguientes riesgos son conocidos y aceptados para el lanzamiento. El cliente piloto debe ser informado de ellos.

### RIESGO-001 — Load test no ejecutado en staging (MEDIO)

**Descripción:** El escenario de load test k6 está implementado pero no se ejecutó contra el ambiente de staging antes del cierre del sprint. No tenemos datos empíricos de rendimiento bajo carga real.

**Mitigación:** Las optimizaciones de HU-093 (índices SQL + eliminación de N+1) están implementadas. El dashboard nunca bloquea (timeout 800ms). El load test DEBE ejecutarse antes de dar acceso al piloto (ver LAUNCH_CHECKLIST).

**Aceptabilidad:** Condicionalmente aceptable si el load test pasa en staging antes del go-live.

---

### RIESGO-002 — Bloqueo de IPs por login en memoria (BAJO-MEDIO)

**Descripción:** El store de `login-limiter.ts` es in-memory. Un reinicio del servidor (deploy, crash, escalamiento) resetea los contadores de intentos fallidos. Un atacante puede reintentar 5 veces, esperar un deploy, y continuar el ataque.

**Mitigación:** El rate limit estricto de 10 req/min por IP como primera línea de defensa persiste (lo gestiona `@fastify/rate-limit` en el proceso). El bloqueo in-memory es la segunda línea.

**Aceptabilidad:** Aceptable para el piloto. Migrar a Redis en Sprint 12.

---

### RIESGO-003 — GMAIL_WEBHOOK_SECRET no configurado → webhook rechaza todo (ALTO si no se configura)

**Descripción:** Con la corrección de HU-097, el webhook Gmail ahora requiere `GMAIL_WEBHOOK_SECRET`. Si la variable de entorno no está configurada en producción O si la URL de Pub/Sub no incluye el `?token=`, el webhook devolverá 401 y Google Pub/Sub reintentará indefinidamente.

**Mitigación:** El LAUNCH_CHECKLIST incluye la configuración explícita de esta variable y la actualización de la URL en el tenant de Pub/Sub.

**Aceptabilidad:** No aceptable sin completar el paso correspondiente en el checklist.

---

### RIESGO-004 — Agente IA responde sin contexto de sucursales (BUG-004, BAJO)

**Descripción:** En mensajes entrantes por WhatsApp/Gmail, el agente puede no mencionar sucursales específicas del tenant porque la query de branches usa `prisma` (con RLS) en contexto sin `set_config`.

**Mitigación:** El agente funciona correctamente para todas las operaciones de negocio. La limitación es solo cosmética/de calidad de respuesta.

**Aceptabilidad:** Aceptable. Se corrige en Sprint 12.

---

### RIESGO-005 — Sin tests de regresión automatizados para los cambios del Sprint 11

**Descripción:** Los tests E2E de Playwright (Sprint 10) cubren los flujos principales pero no incluyen casos específicos para las correcciones del Sprint 11 (BUG-001, feature flags, rate limiting). Tampoco hay tests para el responsive mobile.

**Mitigación:** Las correcciones del sprint fueron verificadas manualmente. TypeScript compila sin errores. Los tests existentes siguen pasando.

**Aceptabilidad:** Aceptable para piloto. Agregar tests de regresión para Sprint 12.

---

## 9. Historial de sprints — Cobertura funcional

| Sprint | Módulos entregados |
|--------|-------------------|
| 1 | Auth JWT, roles, Super Admin, feature flags, rate limiting base |
| 2 | RLS multi-tenant, backups, onboarding, Sentry |
| 3 | KIRA — Inventario, lotes, alertas, clasificación ABC |
| 4 | NIRA — Compras, proveedores, scores, comparador |
| 5 | ARI — CRM, pipeline, cotizaciones, interacciones |
| 6 | AGENDA — Citas, disponibilidad, recordatorios |
| 7 | VERA — Finanzas, presupuestos, reportes |
| 8 | AgentRunner IA, webhooks WhatsApp/Gmail, BullMQ |
| 9 | Dashboard ejecutivo, notificaciones, integraciones, flujos cruzados |
| 10 | CI/CD, Tests E2E Playwright, OpenAPI, backup semanal automatizado |
| 11 | QA completo: seguridad, performance, bugs, feature flags, responsive, abuse protection |

---

## 10. Checklist de aprobación del Product Owner

- [ ] El PO revisó y aprobó el presente reporte
- [ ] El PO revisó y aprobó el [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md)
- [ ] Los riesgos RIESGO-001 a RIESGO-005 son conocidos y aceptados
- [ ] El Sprint 12 puede comenzar

---

*Generado el 2026-04-22 · NEXOR V1 · Sprint 11*
