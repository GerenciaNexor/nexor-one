# Checklist de Lanzamiento — Cliente Piloto
## NEXOR V1 · Sprint 11 → Sprint 12

**Fecha de preparación:** 2026-04-22  
**Responsable de ejecución:** Dev 1 + equipo de operaciones  
**Aprobación requerida:** Product Owner

> **Regla:** Ningún paso puede saltarse sin aprobación explícita del Product Owner documentada en este archivo. Si se aprueba saltarse un paso, se debe anotar el motivo y la firma del PO.

---

## Estado global

| Fase | Pasos | Completados | Estado |
|------|-------|-------------|--------|
| 1 — Infraestructura y base de datos | 5 | 0 | ⬜ Pendiente |
| 2 — Variables de entorno y secretos | 7 | 0 | ⬜ Pendiente |
| 3 — Load test en staging | 3 | 0 | ⬜ Pendiente |
| 4 — Configuración del cliente piloto | 6 | 0 | ⬜ Pendiente |
| 5 — Integraciones del cliente piloto | 4 | 0 | ⬜ Pendiente |
| 6 — Usuarios y capacitación | 4 | 0 | ⬜ Pendiente |
| 7 — Verificación final pre-go-live | 6 | 0 | ⬜ Pendiente |

---

## Fase 1 — Infraestructura y base de datos

### 1.1 Backup de producción pre-migración

> **Regla innegociable:** siempre hacer backup ANTES de migrar.

```bash
DATABASE_URL="postgresql://postgres:<password>@turntable.proxy.rlwy.net:28927/railway" \
  pnpm --filter @nexor/api db:backup
```

Verificar que el backup es válido:
```bash
pg_restore --list backups/nexor_YYYYMMDD_HHMMSS.dump | head -30
# Debe mostrar la lista de tablas — si está vacío, el backup es inválido
```

- [ ] Backup generado: `backups/nexor_______________.dump`
- [ ] Backup verificado con `pg_restore --list` — muestra tablas correctamente
- [ ] Fecha y hora del backup anotada: _______________
- [ ] Backup copiado a ubicación secundaria (local): _______________

---

### 1.2 Migración de índices de performance

La migración `20260422000000_perf_indexes` agrega los índices de KIRA y AGENDA implementados en HU-093. Debe aplicarse en producción.

```bash
DATABASE_URL="postgresql://..." pnpm --filter @nexor/api exec prisma migrate deploy
```

- [ ] Migración ejecutada sin errores
- [ ] Verificar que los índices existen:
  ```sql
  SELECT indexname FROM pg_indexes WHERE tablename IN ('products', 'appointments');
  -- Debe incluir: products_tenant_id_is_active_idx, appointments_tenant_id_start_at_idx
  ```
- [ ] Índices verificados en producción

---

### 1.3 Re-aplicar RLS post-migración

Cualquier migración con DDL puede requerir re-aplicar las políticas RLS.

```bash
DATABASE_URL="postgresql://..." pnpm --filter @nexor/api db:rls
```

- [ ] RLS re-aplicado sin errores
- [ ] Verificar con query de prueba:
  ```sql
  -- Conectar como nexor_app (no postgres), sin set_config → debe devolver 0 filas
  SELECT count(*) FROM products;
  ```

---

### 1.4 Health check de producción

```bash
curl https://api.nexor.co/health
# Respuesta esperada: {"success":true,"data":{"version":"1.0.0","db":"connected"}}
```

- [ ] Health check responde `200` con `"db":"connected"`
- [ ] Latencia del health check: ___ ms (debe ser < 500ms)

---

### 1.5 Verificar Sentry en producción

- [ ] Ir a Sentry → proyecto NEXOR → verificar que llegan eventos de test
- [ ] No hay errores activos sin investigar en el dashboard de Sentry

---

## Fase 2 — Variables de entorno y secretos

Verificar en Railway (API) que todas las variables obligatorias están configuradas:

### 2.1 Variables de infraestructura

- [ ] `DATABASE_URL` — conexión a PostgreSQL de producción
- [ ] `DIRECT_DATABASE_URL` — conexión directa (sin pooling) para `directPrisma`
- [ ] `REDIS_URL` — conexión a Redis de producción
- [ ] `JWT_SECRET` — mínimo 32 caracteres, generado aleatoriamente
- [ ] `ENCRYPTION_KEY` — 32 bytes en hex (para AES-256, integraciones)

### 2.2 Variables de integraciones

- [ ] `GMAIL_WEBHOOK_SECRET` — secreto para verificar webhooks de Gmail (**NUEVO — HU-097**). Debe coincidir con el token en la URL de Pub/Sub
- [ ] `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` — para OAuth2 de Gmail
- [ ] `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` — para WhatsApp Business del cliente piloto

### 2.3 Variables de notificaciones

- [ ] `RESEND_API_KEY` — para envío de emails (recordatorios de citas, backup, alertas)

### 2.4 Actualizar URL de Pub/Sub para Gmail

Con `GMAIL_WEBHOOK_SECRET` definido, actualizar la URL de push en Google Cloud Console:

- [ ] Ir a Google Cloud Console → Pub/Sub → suscripción del tenant piloto → Editar
- [ ] Actualizar la URL: `https://api.nexor.co/webhook/gmail?token=<GMAIL_WEBHOOK_SECRET>`
- [ ] Guardar y verificar que Pub/Sub acepta la nueva URL

---

## Fase 3 — Load Test en Staging

> Esta fase DEBE completarse antes del go-live. Es el único riesgo bloqueante del lanzamiento.
> Ver RIESGO-001 en [QA_REPORT_SPRINT11.md](./QA_REPORT_SPRINT11.md).

### 3.1 Preparar ambiente de staging con datos representativos

```bash
# Apuntar al ambiente de staging
BASE_URL=https://staging.nexor.app

# Poblar BD con 15 tenants de prueba
pnpm --filter @nexor/api db:seed:staging
```

- [ ] Staging desplegado y accesible en `https://staging.nexor.app`
- [ ] Seed de staging ejecutado: 15 tenants × 1.000 productos, 500 clientes, 200 transacciones

### 3.2 Smoke test

```bash
pnpm test:load:smoke
# Equivalente: k6 run packages/load-tests/scenarios/smoke.js
```

- [ ] Smoke test pasa (3 VUs, ~2 min) — todos los endpoints responden 200

### 3.3 Load test completo

```bash
BASE_URL=https://staging.nexor.app k6 run packages/load-tests/scenarios/main.js
# Reportes generados en packages/load-tests/results/
```

**Resultados obtenidos (completar después de ejecutar):**

| Endpoint | p95 medido | SLA (p95) | Estado |
|----------|-----------|-----------|--------|
| `GET /v1/kira/stock` | ___ ms | < 2.000 ms | ⬜ |
| `POST /v1/kira/stock/movements` | ___ ms | < 2.000 ms | ⬜ |
| `GET /v1/ari/pipeline/deals` | ___ ms | < 2.000 ms | ⬜ |
| `GET /v1/vera/reports/summary` | ___ ms | < 2.000 ms | ⬜ |
| `GET /v1/dashboard/kpis` | ___ ms | < 2.000 ms | ⬜ |
| `POST /v1/chat/message` | ___ ms | < 30.000 ms | ⬜ |
| Tasa de errores | ___% | < 0.1% | ⬜ |

- [ ] Todos los thresholds en verde (sin ✗ en el output de k6)
- [ ] Reporte HTML guardado en `packages/load-tests/results/`
- [ ] Reporte incluido en el PR del sprint

> **Si algún threshold falla:** el lanzamiento queda bloqueado hasta corregir el problema de performance. Ver README_ARCHITECTURE.md sección Performance para índices SQL recomendados.

---

## Fase 4 — Configuración del cliente piloto

### 4.1 Crear el tenant del cliente piloto

```bash
# Usando el panel Super Admin en /v1/admin
# O vía script de onboarding desde Excel
pnpm --filter @nexor/api db:onboard --file docs/NEXOR_Onboarding_Template.xlsx
```

- [ ] Tenant creado con:
  - Nombre de la empresa: _______________
  - Slug único: _______________
  - Plan/módulos contratados: _______________
- [ ] Feature flags activados según módulos contratados:
  - [ ] `ARI` — activado: SÍ / NO
  - [ ] `NIRA` — activado: SÍ / NO
  - [ ] `KIRA` — activado: SÍ / NO
  - [ ] `AGENDA` — activado: SÍ / NO
  - [ ] `VERA` — activado: SÍ / NO

### 4.2 Crear sucursales

- [ ] Sucursales creadas según la información del cliente:
  | Nombre | Dirección | Responsable |
  |--------|-----------|-------------|
  | ___ | ___ | ___ |
  | ___ | ___ | ___ |

### 4.3 Seed del cliente piloto

Cargar el catálogo inicial usando la plantilla Excel de onboarding:

- [ ] Plantilla Excel completada por el cliente o equipo de operaciones
- [ ] Datos importados sin errores:
  - Productos/servicios: ___ registros
  - Clientes iniciales: ___ registros
  - Proveedores: ___ registros

### 4.4 Verificar aislamiento multi-tenant

```bash
# Login con el admin del tenant piloto
curl -X POST https://api.nexor.co/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@<cliente>.nexor.co","password":"<password>"}'

# Usar el token retornado para verificar que solo ve sus datos
curl -H "Authorization: Bearer <token>" https://api.nexor.co/v1/kira/products
# Solo debe ver los productos del tenant piloto
```

- [ ] Login del admin del tenant piloto funciona
- [ ] Los endpoints solo devuelven datos del tenant piloto
- [ ] El tenant piloto NO puede ver datos de otros tenants (verificar con dos tenants)

### 4.5 Verificar feature flags

- [ ] Los módulos activos son accesibles (responden 200 en un endpoint de listado)
- [ ] Los módulos inactivos devuelven `403 MODULE_DISABLED`

### 4.6 Verificar el dashboard

- [ ] `GET /v1/dashboard/kpis` devuelve KPIs para los módulos activos del tenant
- [ ] Los módulos inactivos no aparecen en el dashboard

---

## Fase 5 — Integraciones del cliente piloto

### 5.1 WhatsApp Business

- [ ] Número de WhatsApp Business del cliente registrado en Meta Business
- [ ] Token de acceso configurado en la integración del tenant (cifrado con AES-256)
- [ ] Webhook verificado: enviar mensaje de prueba y confirmar que llega al AgentRunner
- [ ] Agente responde correctamente al mensaje de prueba

### 5.2 Gmail (si aplica)

- [ ] OAuth2 completado: el admin del tenant autorizó el acceso a Gmail
- [ ] Pub/Sub configurado con la URL correcta (incluyendo `?token=<GMAIL_WEBHOOK_SECRET>`)
- [ ] Enviar email de prueba a la cuenta conectada y confirmar que llega al worker
- [ ] El agente procesa el email correctamente

### 5.3 Recordatorios de citas (si AGENDA está activo)

- [ ] Tipos de servicio creados con duración y precio
- [ ] Disponibilidad configurada por sucursal y profesional
- [ ] Crear cita de prueba para mañana y verificar que el job `appointment-reminders` la procesa
- [ ] Email de recordatorio recibido en la dirección del cliente de prueba

### 5.4 Alertas de presupuesto (si VERA está activo)

- [ ] Presupuestos mensuales creados por sucursal
- [ ] Verificar que el job `budget-alerts` está activo

---

## Fase 6 — Usuarios y capacitación

### 6.1 Crear usuarios con sus roles correctos

Crear los usuarios según la plantilla entregada por el cliente:

| Nombre | Email | Rol | Módulo | Sucursal |
|--------|-------|-----|--------|----------|
| ___ | ___ | TENANT_ADMIN | — | — |
| ___ | ___ | BRANCH_ADMIN | — | ___ |
| ___ | ___ | AREA_MANAGER | KIRA | ___ |
| ___ | ___ | OPERATIVE | KIRA | ___ |

- [ ] Todos los usuarios creados
- [ ] Cada usuario puede hacer login correctamente
- [ ] Cada usuario solo ve los datos y módulos de su rol (verificar al menos 2 roles)

### 6.2 Contraseñas iniciales

- [ ] Contraseñas temporales comunicadas a los usuarios de forma segura (no por email en texto plano)
- [ ] Se instruyó a los usuarios para cambiar su contraseña en el primer login

### 6.3 Capacitación planificada

- [ ] Sesión de capacitación agendada para el equipo del cliente
- [ ] Fecha y hora: _______________
- [ ] Participantes confirmados: _______________
- [ ] Módulos a cubrir en la capacitación: _______________

### 6.4 Documentación entregada al cliente

- [ ] Guía de usuario básica entregada (o enlace al manual)
- [ ] Contacto de soporte comunicado al cliente (email/WhatsApp de emergencia)

---

## Fase 7 — Verificación final pre-go-live

### 7.1 Smoke test de producción

Ejecutar los checks críticos contra producción con el tenant del cliente piloto:

```bash
# Health check
curl https://api.nexor.co/health

# Login del admin del cliente piloto
curl -X POST https://api.nexor.co/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@<cliente>.nexor.co","password":"<password>"}'
```

- [ ] Health check: `{"success":true,"data":{"db":"connected"}}`
- [ ] Login del admin piloto: devuelve token JWT
- [ ] Dashboard KPIs carga correctamente
- [ ] Al menos un endpoint de cada módulo activo responde 200

### 7.2 Verificar headers de seguridad

```bash
curl -I https://api.nexor.co/health
```

- [ ] `X-Content-Type-Options: nosniff` presente
- [ ] `X-Frame-Options: SAMEORIGIN` presente
- [ ] `Strict-Transport-Security: max-age=31536000` presente (solo en HTTPS/producción)

### 7.3 Verificar rate limiting en login

```bash
# Enviar 11 requests consecutivos al login con credenciales inválidas
for i in {1..11}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.nexor.co/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done
# Las primeras 10 deben devolver 401
# La 11ava debe devolver 429
```

- [ ] Request 11 devuelve 429 (rate limit por IP)
- [ ] Después de 5 fallos consecutivos: request devuelve 429 con `"code":"IP_BLOCKED"`

### 7.4 Backup automático semanal

- [ ] Secretos de GitHub configurados para el workflow de backup:
  - `DATABASE_URL_PROD`
  - `RESEND_API_KEY`
  - `BACKUP_NOTIFY_EMAIL`
- [ ] Ejecutar el workflow manualmente una vez y verificar que el artefacto `.dump` se genera

### 7.5 Monitoreo activo

- [ ] Sentry configurado y recibiendo eventos de producción
- [ ] Alertas de Sentry configuradas (email a _______________)
- [ ] Railway monitoring habilitado para CPU y memoria

### 7.6 Aprobación final del PO

- [ ] El Product Owner leyó el [QA_REPORT_SPRINT11.md](./QA_REPORT_SPRINT11.md)
- [ ] Los 5 riesgos documentados son conocidos y aceptados
- [ ] El PO autoriza el acceso al cliente piloto

**Firma del PO:** _______________  
**Fecha de autorización:** _______________

---

## Pasos post-go-live (primeros 7 días)

Estas tareas deben ejecutarse en los primeros 7 días tras el lanzamiento:

- [ ] Monitorear Sentry diariamente — investigar y corregir cualquier error nuevo
- [ ] Recoger feedback del cliente piloto en sesión de seguimiento (día 3-5)
- [ ] Verificar que los jobs automáticos corrieron correctamente:
  - `stock-alerts` (cada hora)
  - `abc-classification` (lunes)
  - `supplier-scores` (diario)
  - `appointment-reminders` (si AGENDA activo)
  - `budget-alerts` (si VERA activo)
- [ ] Abrir tickets en Sprint 12 para los bugs del backlog (BUG-004, BUG-005, BUG-006)
- [ ] Planificar migración del `login-limiter` a Redis (RIESGO-002)

---

## Excepciones aprobadas

*Completar si algún paso se salta con aprobación del PO:*

| Paso | Motivo | Aprobado por | Fecha |
|------|--------|--------------|-------|
| — | — | — | — |

---

*Versión 1.0 · 2026-04-22 · NEXOR V1 · Sprint 11*
