# README_DEVELOPMENT — Guía de Desarrollo Local NEXOR

> Sigue estos pasos en orden. Si algo no funciona, revisa la sección **Debugging y problemas comunes** al final.

---

## 1. Prerequisitos

| Herramienta | Versión mínima | Cómo verificar |
|-------------|---------------|----------------|
| Node.js | 20.x | `node --version` |
| pnpm | 9.x o 10.x | `pnpm --version` |
| Git | cualquiera | `git --version` |
| PostgreSQL | 15.x | `psql --version` |
| Redis | 7.x | `redis-cli --version` |

**Instalar pnpm** (si no lo tienes):
```bash
npm install -g pnpm
```

> PostgreSQL y Redis pueden correrse localmente o usar servicios cloud como Railway (recomendado para desarrollo).

---

## 2. Instalación desde cero

### 2.1 Clonar el repositorio

```bash
git clone https://github.com/nexor-one/nexor.git
cd nexor
```

### 2.2 Instalar dependencias

```bash
pnpm install
```

Esto instala las dependencias de todos los paquetes del monorepo en un solo comando.

### 2.3 Configurar variables de entorno

```bash
cp .env.example apps/api/.env
```

Edita `apps/api/.env` y configura la conexión a la base de datos (ver opciones abajo).

### 2.4 Levantar PostgreSQL y Redis

**Opción A — Docker Compose:**

```bash
docker-compose up -d
```

Esto levanta PostgreSQL 16 en `localhost:5433` (puerto 5433 para evitar conflictos) y Redis 7 en `localhost:6379`.

```env
DATABASE_URL="postgresql://postgres:password@localhost:5433/nexor_dev"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="dev_secret_32_chars_minimum_for_jwt_signing"
ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000"
```

> **Windows:** Docker Desktop requiere Hyper-V / Virtual Machine Platform habilitado. Si no puedes usar Docker, usa la Opción C.

**Opción B — PostgreSQL + Redis instalados en el sistema:**

```bash
createdb nexor_dev
```

Ajusta `DATABASE_URL` en `apps/api/.env` según tus credenciales locales.

**Opción C — Railway (recomendado en Windows o si no tienes Docker):**

Apunta directamente al ambiente de Railway configurando `DATABASE_URL` y `DIRECT_DATABASE_URL` con las credenciales de la base de datos en Railway. Útil para desarrollo rápido cuando no quieres levantar infraestructura local.

### 2.5 Ejecutar migraciones, RLS y seed (todo en un comando)

```bash
pnpm --filter @nexor/api db:setup
```

Este comando hace tres cosas en orden:
1. `prisma migrate dev` — crea los ≈35 modelos del schema en la BD
2. `tsx prisma/setup-rls.ts` — habilita Row-Level Security en las 23 tablas de negocio
3. `prisma db seed` — carga los datos de prueba

**Datos de prueba creados** (los crea `prisma/seed.ts` — tenant demo "Farmacia Demo" con usuario admin):

| Campo | Valor |
|-------|-------|
| Email | `admin@demo.nexor.co` |
| Contraseña | `Admin123!` |
| Tenant | `Farmacia Demo S.A.S.` |
| Slug | `demo-farmacia` |

**Las 23 tablas de negocio con RLS** (definidas en `prisma/setup-rls.ts` — RLS NO se aplica
automáticamente al migrar/seed, hay que correr el script aparte):

```
agent_logs, appointments, availability, branches, clients, deals, feature_flags,
integrations, interactions, notifications, pipeline_stages, products, purchase_orders,
quotes, service_types, stock_movements, suppliers, transactions, users,
bulk_upload_logs, conversations, conversation_messages, chat_messages
```

> `bulk_upload_logs`, `conversations` y `conversation_messages` se añadieron en HU-114;
> `chat_messages` en HU-117 (Sprint 12) — así `db:rls` es la **fuente única de verdad** del RLS
> y re-aplica todas las políticas tras un restore (la migración de `chat_messages` la sigue
> creando también, de forma idempotente).

### 2.6 Verificar la conexión

```bash
curl http://localhost:3001/health
# {"success":true,"data":{"version":"1.0.0","db":"connected"}}
```

### 2.7 Levantar el entorno de desarrollo

```bash
pnpm dev
```

Esto levanta simultáneamente:
- **API** → [http://localhost:3001](http://localhost:3001)
- **Frontend** → [http://localhost:3000](http://localhost:3000)

Verifica que la API responde:
```bash
curl http://localhost:3001/health
# {"success":true,"data":{"version":"1.0.0"}}
```

---

## 3. Comandos del día a día

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Levanta API y frontend en paralelo con hot-reload |
| `pnpm build` | Compila todos los paquetes para producción |
| `pnpm lint` | Corre ESLint en todos los paquetes |
| `pnpm type-check` | Verifica tipos TypeScript sin emitir archivos |
| `pnpm clean` | Elimina carpetas `dist/` y `.next/` |

**Comandos específicos por paquete** (usar `--filter`):

```bash
# Solo el backend
pnpm --filter @nexor/api dev
pnpm --filter @nexor/api build

# Solo el frontend
pnpm --filter @nexor/web dev
pnpm --filter @nexor/web build

# Solo tipos compartidos
pnpm --filter @nexor/shared type-check
```

**Scripts de base de datos (npm scripts reales de `apps/api/package.json`):**

| Script | Comando subyacente | Para qué sirve |
|--------|--------------------|----------------|
| `db:setup` | `prisma migrate dev && tsx prisma/setup-rls.ts && prisma db seed` | Primer arranque: migra + RLS + seed |
| `db:migrate` | `prisma migrate dev` | Crear/aplicar una migración |
| `db:reset` | `prisma migrate reset --force && tsx prisma/setup-rls.ts && prisma db seed` | Resetear la BD (¡borra todo!) + RLS + seed |
| `db:seed` | `prisma db seed` (→ `tsx prisma/seed.ts`) | Cargar datos demo |
| `db:seed-e2e` | `tsx prisma/seed-e2e.ts` | Seed para tests E2E |
| `db:seed:staging` | `tsx prisma/seed-staging.ts` | Seed de staging (load testing) |
| `db:rls` | `tsx prisma/setup-rls.ts` | Re-aplicar RLS (OBLIGATORIO tras cualquier restore) |
| `db:studio` | `prisma studio` | UI para inspeccionar la BD |
| `db:backup` | `bash ../../scripts/db-backup.sh` | Generar backup (`pg_dump`) |
| `db:restore` | `bash ../../scripts/db-restore.sh` | Restaurar desde un backup |
| `prisma:generate` | `prisma generate` | Regenerar el cliente de Prisma (tras cambios al schema) |
| `onboarding` | `tsx prisma/onboarding.ts` | Alta de cliente nuevo desde Excel (ver `README_ONBOARDING_CLIENT.md`) |

```bash
# Ejemplos de uso
pnpm --filter @nexor/api db:setup
pnpm --filter @nexor/api db:rls
pnpm --filter @nexor/api db:studio

# Crear y aplicar una nueva migración con nombre
pnpm --filter @nexor/api exec prisma migrate dev --name nombre_de_la_migracion
```

**Scripts en `apps/api/prisma/` (no todos están en `package.json`):**

| Archivo | En `package.json` | Qué hace |
|---------|-------------------|----------|
| `seed.ts` | sí (`db:seed`) | Tenant demo "Farmacia Demo S.A.S." + usuario `admin@demo.nexor.co` / `Admin123!` |
| `seed-e2e.ts` | sí (`db:seed-e2e`) | Datos para tests E2E (ver sección 9) |
| `seed-staging.ts` | sí (`db:seed:staging`) | Datos de staging para load testing (ver sección 10) |
| `seed-full-demo.ts` | no | Seed de demo extendido |
| `seed-kira-dev.ts` | no | Seed acotado al módulo KIRA para desarrollo |
| `onboarding.ts` | sí (`onboarding`) | Alta de cliente desde Excel |
| `setup-rls.ts` | sí (`db:rls`) | Habilita Row-Level Security en las 23 tablas |
| `create-admin.ts` | no (one-shot) | Crea el tenant "Nexor" + su usuario y **desactiva el admin demo** |
| `inspect-db.ts` | no | Inspección/diagnóstico de la BD |
| `fix-nexor-flags.ts` | no | Corrige los feature flags del tenant Nexor |

`create-admin.ts` es un script de un solo uso (no está en `package.json`); se corre con:

```bash
pnpm --filter @nexor/api exec tsx --env-file=.env prisma/create-admin.ts
```

---

## 4. Variables de entorno

Todas las variables están documentadas en [`.env.example`](./.env.example) con descripción de para qué sirve cada una.

**Variables obligatorias para desarrollo local:**

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Conexión a PostgreSQL |
| `REDIS_URL` | Conexión a Redis |
| `JWT_SECRET` | Clave para firmar tokens JWT (mínimo 32 caracteres) |
| `ENCRYPTION_KEY` | 32 bytes en hex para AES-256 (integraciones). En dev: `0000...0000` (64 ceros) |
| `NEXT_PUBLIC_API_URL` | URL de la API que usa el frontend |

> `ENCRYPTION_KEY` es **obligatoria** — la API llama a `validateEncryptionKey()` en el arranque y hace `process.exit(1)` si no está definida. Para desarrollo local puedes usar 64 ceros: `0000000000000000000000000000000000000000000000000000000000000000`.

**Variables opcionales** (solo se necesitan si trabajas esas integraciones):
- `ANTHROPIC_API_KEY` — para probar los agentes de IA
- `WHATSAPP_ACCESS_TOKEN` — para probar el webhook de WhatsApp
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — para la integración con Gmail
- `GMAIL_WEBHOOK_SECRET` — secreto para verificar webhooks de Gmail (requerido en producción)
- `RESEND_API_KEY` — para envío de emails

### Tabla canónica de variables del backend

Basada en el archivo real [`.env.example`](./.env.example) de la raíz. Los valores son **solo
placeholders** — nunca commitear secretos reales.

| Variable | Grupo | Descripción | Placeholder de ejemplo |
|----------|-------|-------------|------------------------|
| `DATABASE_URL` | DB | Conexión a PostgreSQL (rol `nexor_app`, sujeto a RLS) — runtime Fastify | `postgresql://USER:PASSWORD@HOST:PORT/DB` |
| `DIRECT_DATABASE_URL` | DB | Conexión directa superuser (bypasea RLS) — migraciones y seeds | `postgresql://USER:PASSWORD@HOST:PORT/DB` |
| `REDIS_URL` | Redis | Conexión a Redis (BullMQ + cache) | `redis://HOST:PORT` |
| `JWT_SECRET` | JWT | Clave para firmar JWT (cadena aleatoria larga, ≥ 32 chars) | `<secreto_aleatorio>` |
| `JWT_EXPIRES_IN` | JWT | Duración del JWT | `7d` |
| `REFRESH_TOKEN_EXPIRES_DAYS` | JWT | Vigencia del refresh token en días (mín. 30) | `30` |
| `PORT` | API | Puerto del servidor de la API | `3001` |
| `HOST` | API | Host de escucha (en prod `0.0.0.0`) | `0.0.0.0` |
| `LOG_LEVEL` | API | Nivel de logs (`trace`…`fatal`) | `info` |
| `NODE_ENV` | API | Ambiente (`development`/`test`/`production`) | `development` |
| `CORS_ORIGIN` | CORS | URL del frontend permitida | `http://localhost:3000` |
| `RATE_LIMIT_MAX` | CORS | Máx. requests por minuto por tenant | `100` |
| `ANTHROPIC_API_KEY` | Claude | API key de Anthropic | `sk-ant-...` |
| `CLAUDE_MODEL` | Claude | Modelo de Claude para los agentes | `<claude-model-id>` |
| `AGENT_MAX_TURNS` | Claude | Máx. turnos por ejecución del agente | `10` |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp | Token permanente de Meta Business | `<token>` |
| `WHATSAPP_VERIFY_TOKEN` | WhatsApp | Clave de verificación del webhook | `<verify_token>` |
| `WHATSAPP_APP_SECRET` | WhatsApp | Secreto de la app de Meta (firma HMAC) | `<app_secret>` |
| `GOOGLE_CLIENT_ID` | Gmail | Client ID OAuth de Google | `<id>.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Gmail | Client Secret OAuth de Google | `<client_secret>` |
| `GOOGLE_REDIRECT_URI` | Gmail | URL de redirección OAuth de Gmail | `http://localhost:3001/v1/integrations/gmail/callback` |
| `GOOGLE_PUBSUB_TOPIC` | Gmail | Topic de Pub/Sub para notificaciones de Gmail | `projects/{PROJECT_ID}/topics/{TOPIC_NAME}` |
| `ENCRYPTION_KEY` | Cifrado | 32 bytes hex para AES-256 (tokens de integración) | `<64_hex_chars>` |
| `RESEND_API_KEY` | Email | API key de Resend | `re_...` |
| `EMAIL_FROM` | Email | Remitente de los emails del sistema | `NEXOR <no-reply@nexor.co>` |
| `SENTRY_DSN` | Monitoreo | DSN de Sentry (opcional en dev) | `<dsn>` |
| `NEXT_PUBLIC_API_URL` | Frontend | URL base de la API que usa el frontend | `http://localhost:3001` |

> **Advertencia — variables leídas por el código pero AUSENTES de `.env.example`** (deberían añadirse):
>
> | Variable | Dónde se usa | PENDIENTE |
> |----------|--------------|-----------|
> | `GMAIL_WEBHOOK_SECRET` | Verificación del webhook de Gmail (`modules/webhooks/gmail.ts`) | PENDIENTE: añadir a `.env.example` |
> | `OCR_MODEL` | Modelo de visión para OCR (`modules/ocr/service.ts`, p. ej. `claude-sonnet-4-x`) | PENDIENTE: añadir a `.env.example` |
> | `API_BASE_URL` | Usado por jobs (`jobs/appointment-reminders.ts`) | PENDIENTE: añadir a `.env.example` |

---

## 5. Estructura de ramas y flujo de PRs

### Ramas

| Rama | Propósito |
|------|-----------|
| `main` | Código en producción. Solo se toca vía PR. |
| `develop` | Rama de integración. Base para los PRs del sprint. |
| `feature/HU-XXX-descripcion` | Rama por historia de usuario. |
| `fix/HU-XXX-descripcion` | Rama para bugfixes. |

### Flujo

```bash
# 1. Crear rama desde develop
git checkout develop
git pull origin develop
git checkout -b feature/HU-002-auth-login

# 2. Desarrollar y hacer commits
git add apps/api/src/modules/auth/
git commit -m "feat(auth): implementar endpoint de login con JWT"

# 3. Abrir PR hacia develop
gh pr create --base develop --title "HU-002: Auth — login y JWT"
```

### Requisitos de un PR para ser aprobado

- [ ] Los criterios de aceptación de la historia están cumplidos
- [ ] `pnpm lint` pasa sin errores
- [ ] `pnpm type-check` pasa sin errores
- [ ] `pnpm build` compila sin errores
- [ ] Al menos un reviewer aprobó el PR

---

## 6. Convenciones de código

### Nombres de archivos y carpetas

- **Carpetas y archivos:** `kebab-case` (ej: `create-order.ts`, `auth-service.ts`)
- **Componentes React:** `PascalCase` (ej: `LoginForm.tsx`, `DashboardHeader.tsx`)
- **Tipos e interfaces:** `PascalCase` (ej: `AuthUser`, `ApiResponse`)

### Estructura de un módulo del backend

Cada módulo en `apps/api/src/modules/<nombre>/` sigue esta estructura:

```
modulo/
├── index.ts          ← Exporta el plugin de Fastify que registra las rutas
├── routes.ts         ← Define las rutas: valida input con Zod, llama al service
├── service.ts        ← Lógica de negocio: reglas, llama a Prisma
└── schema.ts         ← Schemas de Zod para validar requests y responses
```

**Regla:** La lógica de negocio va en `service.ts`, nunca en `routes.ts`.

### Qué va en `packages/shared` y qué no

**SÍ va en shared:**
- Tipos que usa tanto el frontend como el backend (ej: `AuthUser`, `Tenant`, `ApiResponse`)
- Enums compartidos (ej: `Role`, `ModuleName`, `ChannelType`)

**NO va en shared:**
- Tipos que solo usa el backend (ej: tipos internos de Prisma)
- Tipos que solo usa el frontend (ej: props de componentes React)
- Lógica de negocio o funciones — solo tipos

---

## 7. Debugging y problemas comunes

### `pnpm install` falla

```bash
# Limpiar caché y reinstalar
pnpm store prune
rm -rf node_modules
pnpm install
```

### Error de conexión a PostgreSQL

Verifica que `DATABASE_URL` en `.env` es correcta y que PostgreSQL está corriendo:
```bash
psql $DATABASE_URL -c "SELECT 1"
```

### Error: `@prisma/client did not initialize yet`

El cliente de Prisma necesita regenerarse:
```bash
pnpm --filter @nexor/api exec prisma generate
```

### El tipo de `@nexor/shared` no se resuelve

Verifica que el workspace está correctamente instalado:
```bash
pnpm --filter @nexor/api exec node -e "require('@nexor/shared')"
```

Si falla, reinstala:
```bash
pnpm install
```

### Hot-reload no funciona en Windows

tsx y Next.js usan file watchers. En Windows con OneDrive activo puede haber conflictos.
Asegúrate de que el repositorio esté en una carpeta **no sincronizada por OneDrive** o excluye la carpeta del proyecto de la sincronización.

### Puerto 3001 o 3000 en uso

```bash
# Ver qué proceso ocupa el puerto
netstat -ano | findstr :3001   # Windows
lsof -i :3001                  # macOS/Linux

# Matar el proceso (reemplaza PID)
taskkill /PID <PID> /F         # Windows
kill -9 <PID>                  # macOS/Linux
```

---

## 8. Backups y restauración de base de datos

### Política de backups — REGLA INNEGOCIABLE

> **Nunca ejecutar una migración en producción sin haber generado y verificado un backup manual minutos antes.**

Los backups se almacenan en dos ubicaciones distintas para evitar un único punto de falla:

| Nivel | Qué es | Frecuencia | Dónde vive |
|-------|--------|-----------|-----------|
| Automático Railway | Snapshot de PostgreSQL gestionado por Railway | Diario | Panel de Railway → Postgres → Backups |
| Automático externo | `pg_dump` ejecutado por GitHub Actions | Semanal (domingos 02:00 UTC) | GitHub Actions → Artifacts (90 días) |
| Manual | `pg_dump` generado por el desarrollador | Antes de cada migración a producción | Local / descargado manualmente |

---

### Requisitos del sistema para backup/restore local

`pg_dump` y `pg_restore` deben estar instalados:

```bash
# macOS
brew install postgresql

# Ubuntu/Debian
sudo apt install postgresql-client

# Windows — usar WSL o instalar PostgreSQL
# https://www.postgresql.org/download/windows/
```

---

### Generar un backup manual (antes de migrar a producción)

```bash
# Produccion (Railway)
DATABASE_URL="postgresql://postgres:<password>@turntable.proxy.rlwy.net:28927/railway" \
  pnpm --filter @nexor/api db:backup

# Local
DATABASE_URL="postgresql://postgres:password@localhost:5433/nexor_dev" \
  pnpm --filter @nexor/api db:backup
```

El archivo se guarda en `backups/nexor_YYYYMMDD_HHMMSS.dump`.

**Verificar que el backup es válido antes de continuar:**

```bash
pg_restore --list backups/nexor_YYYYMMDD_HHMMSS.dump | head -30
# Debe mostrar una lista de tablas y objetos — si está vacío, el backup es inválido
```

---

### Restaurar desde un backup (emergencia)

> ⚠️ **Este proceso elimina todos los datos actuales. Usar solo ante pérdida real de datos.**

```bash
# 1. Identificar el backup a restaurar
ls -lh backups/

# 2. Restaurar (pedirá confirmación escribiendo 'RESTAURAR')
DATABASE_URL="postgresql://postgres:<password>@turntable.proxy.rlwy.net:28927/railway" \
  pnpm --filter @nexor/api db:restore backups/nexor_YYYYMMDD_HHMMSS.dump

# 3. Obligatorio: Re-aplicar RLS después de restaurar
DATABASE_URL="postgresql://..." pnpm --filter @nexor/api db:rls

# 4. Verificar que los datos se restauraron correctamente
pnpm --filter @nexor/api db:studio
```

---

### Restaurar desde un backup de Railway

1. Ir a Railway → tu proyecto → servicio **Postgres** → pestaña **Backups**
2. Seleccionar el backup más reciente y hacer clic en **Restore**
3. Railway restaura directamente — no se necesita `pg_restore`
4. Después de restaurar, re-aplicar RLS manualmente (Railway no lo preserva):
   ```bash
   DATABASE_URL="postgresql://..." pnpm --filter @nexor/api db:rls
   ```

---

### Restaurar desde un backup semanal de GitHub Actions

1. Ir a GitHub → Actions → workflow **"Backup semanal DB produccion"**
2. Seleccionar la ejecución más reciente exitosa
3. En la sección **Artifacts**, descargar el archivo `.dump`
4. Seguir los pasos de **Restaurar desde un backup** de arriba

---

### Configuración del backup automático semanal

El workflow `.github/workflows/backup.yml` necesita estos secrets en GitHub:

1. Ir a GitHub → Settings → Secrets and variables → Actions
2. Crear los secrets:
   - **`DATABASE_URL_PROD`** → `postgresql://postgres:<password>@turntable.proxy.rlwy.net:28927/railway`
   - **`RESEND_API_KEY`** → API key de Resend para el envío de la notificación por email
   - **`BACKUP_NOTIFY_EMAIL`** → dirección de email donde llega la notificación de éxito/fallo

El workflow corre automáticamente cada domingo a las 02:00 UTC. También puede ejecutarse manualmente desde GitHub Actions → **"Backup semanal DB produccion"** → **Run workflow**.

---

## 9. Tests E2E con Playwright

Los tests de extremo a extremo viven en `packages/e2e/` y cubren los flujos principales del sistema contra una base de datos real.

### Prerequisitos adicionales

| Herramienta | Versión | Cómo verificar |
|-------------|---------|----------------|
| Docker Desktop | cualquiera | `docker --version` |
| Playwright browsers | — | `pnpm --filter @nexor/e2e exec playwright install --with-deps` |

### Variables de entorno para E2E

Crea `packages/e2e/.env` (no se commitea):

```env
BASE_URL=http://localhost:3000
API_URL=http://localhost:3001
```

### Levantar el entorno para E2E

Los tests necesitan la API y el frontend corriendo con la base de datos de tests.

```bash
# 1. Levantar PostgreSQL y Redis (si no están corriendo)
docker-compose up -d

# 2. Preparar la base de datos de tests (seed especial)
DATABASE_URL="postgresql://postgres:password@localhost:5433/nexor_dev" \
  pnpm --filter @nexor/api db:seed-e2e

# 3. Levantar la API y el frontend en background
pnpm dev &

# 4. Esperar que la API esté lista
curl --retry 10 --retry-delay 2 http://localhost:3001/health
```

### Ejecutar los tests

```bash
# Todos los tests (modo headless)
pnpm test:e2e

# Solo un proyecto específico
pnpm --filter @nexor/e2e exec playwright test --project=auth-tests
pnpm --filter @nexor/e2e exec playwright test --project=security
pnpm --filter @nexor/e2e exec playwright test --project=openapi
pnpm --filter @nexor/e2e exec playwright test --project=chromium

# Solo un archivo específico
pnpm --filter @nexor/e2e exec playwright test tests/kira.spec.ts

# Con UI interactiva (para depurar)
pnpm test:e2e:headed

# Ver el reporte HTML del último run
pnpm test:e2e:report
```

### Proyectos de tests y lo que cubren

| Proyecto | Archivo | Qué cubre |
|----------|---------|-----------|
| `auth-tests` | `auth.spec.ts` | Login, refresh token, logout, acceso por rol |
| `security` | `security.spec.ts` | Aislamiento multi-tenant, acceso no autorizado, RLS |
| `openapi` | `openapi.spec.ts` | Spec JSON válido, Swagger UI, tags, seguridad bearerAuth |
| `chromium` | `kira.spec.ts` | Productos, stock, movimientos, alertas (UI) |
| `chromium` | `nira.spec.ts` | Proveedores, órdenes de compra, flujo de aprobación (UI) |
| `chromium` | `ari.spec.ts` | Clientes, pipeline, cotizaciones (UI) |
| `chromium` | `multitenancy.spec.ts` | Datos de un tenant no visibles para otro |

### Datos de test

El seed E2E (`prisma/seed-e2e.ts`) crea:
- **Tenant principal:** `e2e-test-tenant` con todos los módulos activos
- **Tenant secundario:** `e2e-test-tenant-2` para pruebas de aislamiento
- **Usuarios:** admin, branch-admin, area-manager (por módulo), operative (por módulo)
- **Datos de prueba:** productos, clientes, deals, proveedores, citas

> Los datos del seed E2E se recrean en cada run del workflow de CI. En desarrollo local, ejecuta `db:seed-e2e` manualmente antes de correr los tests.

### Tests en CI (GitHub Actions)

El workflow `.github/workflows/e2e.yml` corre automáticamente en cada PR a `main`:
1. Levanta PostgreSQL 16 y Redis 7 como services de Docker
2. Ejecuta migraciones + seeds (`db:seed` + `db:seed-e2e`)
3. Compila y levanta la API y el frontend
4. Corre los tests de Playwright en modo headless
5. Sube el reporte HTML y capturas de fallos como artefactos

---

## 10. Load Testing con k6 (HU-092)

### Prerequisitos

Instalar k6 como binario standalone (no es una dependencia npm):

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] \
  https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Windows (Chocolatey)
choco install k6

# Windows (winget)
winget install k6 --source winget
```

Verificar instalación:
```bash
k6 version
```

### Flujo completo de load testing

```bash
# 1. Levantar el ambiente de staging (o apuntar a staging existente)
#    El load test NUNCA se ejecuta contra producción

# 2. Poblar la BD con datos representativos (15 tenants × 1.000 productos)
pnpm seed:staging
# Equivalente: pnpm --filter @nexor/api db:seed:staging

# 3. Smoke test — verifica que los endpoints responden antes del test real (~2 min)
pnpm test:load:smoke
# Equivalente: k6 run packages/load-tests/scenarios/smoke.js

# 4. Load test completo — 75 VUs × 6.5 minutos
pnpm test:load
# Equivalente: k6 run packages/load-tests/scenarios/main.js

# 5. Contra staging remoto
BASE_URL=https://staging.nexor.app k6 run packages/load-tests/scenarios/main.js

# 6. Generar reporte HTML + JSON
k6 run packages/load-tests/scenarios/main.js
# Los reportes se generan automáticamente en packages/load-tests/results/
```

### Estructura del load test

```
packages/load-tests/
├── scenarios/
│   ├── main.js        ← Escenario completo: 75 VUs, 6.5 min
│   └── smoke.js       ← Sanity check rápido: 3 VUs, 2 min
└── utils/
    └── helpers.js     ← login(), authHeaders(), checkOk(), etc.
```

### Credenciales de los tenants de prueba

| Campo | Valor |
|-------|-------|
| Email | `admin01@load-test.nexor.co` … `admin15@load-test.nexor.co` |
| Contraseña | `LoadTest2024!` |
| Datos por tenant | 1.000 productos · 500 clientes · 200 transacciones |

### Endpoints bajo prueba y distribución de carga

| Endpoint | Distribución | SLA (p95) |
|----------|-------------|-----------|
| `GET /v1/kira/stock` | 30% | < 2 segundos |
| `POST /v1/kira/stock/movements` | 10% | < 2 segundos |
| `GET /v1/ari/pipeline/deals` | 20% | < 2 segundos |
| `GET /v1/vera/reports/summary` | 20% | < 2 segundos |
| `GET /v1/dashboard/kpis` | 15% | < 2 segundos |
| `POST /v1/chat/message` | 5% | < 30 segundos |

### Interpretar los resultados

Un test exitoso muestra todos los thresholds en verde:

```
✓ http_req_failed.............: 0.00%   ✓ 0      ✗ 0
✓ errors......................: 0.00%   ✓ 0      ✗ 0
✓ duration_kira_stock.........: p(95)=380ms
✓ duration_ari_deals..........: p(95)=340ms
✓ duration_vera_summary.......: p(95)=820ms
✓ duration_dashboard_kpis.....: p(95)=950ms
✓ duration_chat_message.......: p(95)=12s
```

Si un threshold falla (aparece con ✗), hay un problema de performance que debe corregirse antes de cerrar el sprint. Ver la sección **Performance** en `README_ARCHITECTURE.md` para la línea base de referencia y los índices SQL recomendados.

### Reglas de uso

1. **Nunca ejecutar contra producción** — solo staging o local
2. **El smoke test primero** — garantiza que el entorno está sano antes del test completo
3. **Los reportes se guardan** en `packages/load-tests/results/` — incluir el HTML en el PR del sprint
4. **Un endpoint que falla el SLA de 2s es un bug** de performance, no un "punto a mejorar"
